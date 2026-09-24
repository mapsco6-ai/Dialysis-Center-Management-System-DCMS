#!/usr/bin/env bash
# L4: forbid ad-hoc Tailwind palette classes in admin UI and shared shells.
set -euo pipefail
PATTERN='(slate-[0-9]+|red-[0-9]+|emerald-[0-9]+|amber-[0-9]+|orange-[0-9]+)'
ROOT="$(cd "$(dirname "$0")/.." && pwd)/src"
FAIL=0
for dir in app/admin app/login components; do
  path="$ROOT/$dir"
  [[ -d "$path" ]] || continue
  if matches=$(grep -rE "$PATTERN" "$path" --include='*.tsx' --include='*.ts' 2>/dev/null); then
    echo "Legacy Tailwind palette under $dir:"
    echo "$matches"
    FAIL=1
  fi
done
exit "$FAIL"
