#!/usr/bin/env bash
set -euo pipefail
jq -c '.issues[]' backlog.json | while read -r issue; do
  title=$(echo "$issue" | jq -r '.title')
  labels=$(echo "$issue" | jq -r '.labels | join(",")')
  num=$(gh issue list --search "$title in:title" --json number,title \
        | jq -r ".[] | select(.title==\"$title\") | .number")
  if [ -z "$num" ]; then
    echo "  Bulunamadı: $title"
    continue
  fi
  echo "Label ekleniyor: #$num -> $labels"
  gh issue edit "$num" --add-label "$labels"
done
