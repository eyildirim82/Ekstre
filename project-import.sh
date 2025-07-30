#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<EOF
Kullanım:
  $0 --user <github_user> --project "<Project Title>" --estimate-field "Estimate" [--org <github_org>] [--file backlog.json]

Notlar:
 - --user ya da --org'dan sadece birini ver.
 - Project v2 user seviyesinde ise --user, org seviyesinde ise --org kullan.
 - --estimate-field Project v2'de oluşturduğun Number tipindeki alanın adı.
EOF
  exit 1
}

USER_LOGIN=""
ORG_LOGIN=""
PROJECT_TITLE=""
ESTIMATE_FIELD_NAME="Estimate"
FILE="backlog.json"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --user) USER_LOGIN="$2"; shift 2 ;;
    --org) ORG_LOGIN="$2"; shift 2 ;;
    --project) PROJECT_TITLE="$2"; shift 2 ;;
    --estimate-field) ESTIMATE_FIELD_NAME="$2"; shift 2 ;;
    --file) FILE="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Bilinmeyen argüman: $1"; usage ;;
  esac
done

if [[ -z "$PROJECT_TITLE" ]]; then
  echo "Hata: --project zorunlu."
  usage
fi

if [[ -z "$USER_LOGIN" && -z "$ORG_LOGIN" ]]; then
  echo "Hata: --user veya --org vermelisin."
  usage
fi

if [[ ! -f "$FILE" ]]; then
  echo "Hata: $FILE bulunamadı."
  exit 1
fi

# 1) Project ID'yi keşfet
if [[ -n "$USER_LOGIN" ]]; then
  echo ">> Kullanıcı projeleri çekiliyor: $USER_LOGIN"
  PROJECTS_JSON=$(gh api graphql -f query='
    query($login: String!) {
      user(login: $login) {
        projectsV2(first: 50) {
          nodes { id title number }
        }
      }
    }' -F login="$USER_LOGIN")
  PROJECT_ID=$(echo "$PROJECTS_JSON" | jq -r --arg title "$PROJECT_TITLE" '.data.user.projectsV2.nodes[] | select(.title==$title) | .id')
else
  echo ">> Organizasyon projeleri çekiliyor: $ORG_LOGIN"
  PROJECTS_JSON=$(gh api graphql -f query='
    query($login: String!) {
      organization(login: $login) {
        projectsV2(first: 50) {
          nodes { id title number }
        }
      }
    }' -F login="$ORG_LOGIN")
  PROJECT_ID=$(echo "$PROJECTS_JSON" | jq -r --arg title "$PROJECT_TITLE" '.data.organization.projectsV2.nodes[] | select(.title==$title) | .id')
fi

if [[ -z "$PROJECT_ID" || "$PROJECT_ID" == "null" ]]; then
  echo "Hata: '$PROJECT_TITLE' başlıklı Project v2 bulunamadı."
  exit 1
fi

echo ">> PROJECT_ID: $PROJECT_ID"

# 2) Estimate alanının field ID'sini bul
FIELDS_JSON=$(gh api graphql -f query='
query($project: ID!) {
  node(id: $project) {
    ... on ProjectV2 {
      fields(first: 100) {
        nodes {
          ... on ProjectV2FieldCommon {
            id
            name
            dataType
          }
        }
      }
    }
  }
}' -F project="$PROJECT_ID")

ESTIMATE_FIELD_ID=$(echo "$FIELDS_JSON" | jq -r --arg name "$ESTIMATE_FIELD_NAME" '.data.node.fields.nodes[] | select(.name==$name) | .id')

if [[ -z "$ESTIMATE_FIELD_ID" || "$ESTIMATE_FIELD_ID" == "null" ]]; then
  echo "Hata: '$ESTIMATE_FIELD_NAME' isimli bir Project alanı bulunamadı. Project settings > Fields kısmından Number tipinde bir alan oluştur."
  exit 1
fi

echo ">> ESTIMATE_FIELD_ID: $ESTIMATE_FIELD_ID"

# 3) backlog.json'daki her issue için: issue'yu bul → projeye item ekle → estimate set et
jq -c '.issues[]' "$FILE" | while read -r issue; do
  title=$(echo "$issue" | jq -r '.title')
  estimate=$(echo "$issue" | jq -r '.estimate')

  echo "----"
  echo "Processing: $title"

  # issue numarasını başlığa göre bul
  issue_number=$(gh issue list --search "$title in:title" --json number,title \
    | jq -r --arg title "$title" '.[] | select(.title==$title) | .number')

  if [[ -z "$issue_number" || "$issue_number" == "null" ]]; then
    echo "  ! Issue bulunamadı: $title (önce issue'ları oluşturduğundan emin ol)"
    continue
  fi

  issue_node_id=$(gh issue view "$issue_number" --json id -q '.id')

  # Projeye item ekle
  item_id=$(gh api graphql -f query='
    mutation($project:ID!, $content:ID!){
      addProjectV2ItemById(input:{projectId:$project, contentId:$content}) {
        item { id }
      }
    }' -F project="$PROJECT_ID" -F content="$issue_node_id" --jq '.data.addProjectV2ItemById.item.id')

  echo "  -> Added to project: itemId=$item_id"

  # Estimate varsa set et
  if [[ "$estimate" != "null" ]]; then
    gh api graphql -f query='
      mutation($project:ID!, $item:ID!, $field:ID!, $value:String!) {
        updateProjectV2ItemFieldValue(input:{
          projectId:$project,
          itemId:$item,
          fieldId:$field,
          value: { number: $value }
        }) {
          projectV2Item { id }
        }
      }' \
      -F project="$PROJECT_ID" \
      -F item="$item_id" \
      -F field="$ESTIMATE_FIELD_ID" \
      -F value="$estimate" >/dev/null
    echo "  -> estimate set: $estimate"
  fi
done

echo "Bitti ✔"
