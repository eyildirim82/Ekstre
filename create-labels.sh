#!/usr/bin/env bash
set -euo pipefail
mapfile -t LABELS < <(jq -r '.issues[].labels[]' backlog.json | sort -u)
EXISTING=$(gh label list --json name -q '.[].name' || echo '')
hexcolor() { printf "%06x" $((0x$(echo -n "$1" | sha1sum | cut -c1-6))); }
for l in "${LABELS[@]}"; do
  if echo "$EXISTING" | grep -Fxq "$l"; then
    echo " $l zaten var"
  else
    c=$(hexcolor "$l")
    echo " $l"
    gh label create "$l" --color "$c" >/dev/null
  fi
done
