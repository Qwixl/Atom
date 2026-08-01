#!/usr/bin/env bash
# Render and validate the Internet-Draft using the IETF author-tools service.
# Requires only curl and python3. Exits non-zero if the draft has errors.
set -uo pipefail

cd "$(dirname "$0")"
DRAFT="${1:-draft-chapman-a2a-mls-02}"
SRC="${DRAFT}.md"

if [[ ! -f "$SRC" ]]; then
  echo "no such draft source: $SRC" >&2
  exit 1
fi

# API format name -> output file extension
declare -A FORMATS=([text]=txt [xml]=xml)
failed=0

for fmt in text xml; do
  ext="${FORMATS[$fmt]}"
  echo "rendering ${fmt}..."

  response=$(curl -sS -m 180 -X POST \
    "https://author-tools.ietf.org/api/render/${fmt}" \
    -F "file=@${SRC}")

  url=$(printf '%s' "$response" | python3 _parse_render.py)
  if [[ $? -ne 0 || -z "$url" ]]; then
    failed=1
    continue
  fi

  curl -sS -m 60 -o "${DRAFT}.${ext}" "$url"
  echo "  wrote ${DRAFT}.${ext} ($(wc -c <"${DRAFT}.${ext}") bytes)"
done

if [[ $failed -ne 0 ]]; then
  echo
  echo "FAILED: fix the errors above before submitting." >&2
  exit 1
fi

pages=$(grep -c '\[Page' "${DRAFT}.txt" 2>/dev/null || true)
echo
echo "OK: zero errors. ${pages:-?} pages."
echo "Submit ${DRAFT}.xml at https://datatracker.ietf.org/submit/"
