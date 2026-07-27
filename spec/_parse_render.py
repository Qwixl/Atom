"""Parse an author-tools.ietf.org render response.

Prints the export URL on stdout, diagnostics on stderr.
Exit 0 = clean, 1 = draft has errors, 2 = unusable response.
"""

import json
import sys


def main() -> int:
    raw = sys.stdin.read()
    try:
        data = json.loads(raw)
    except ValueError as exc:
        print(
            f"  error: unparseable response from author-tools: {exc}", file=sys.stderr
        )
        print(f"  {raw[:500]}", file=sys.stderr)
        return 2

    logs = data.get("logs") or {}
    for warning in logs.get("warnings") or []:
        print(f"  warning: {warning}", file=sys.stderr)

    errors = list(logs.get("errors") or [])
    top_level = data.get("error")
    if top_level:
        errors.append(top_level)
    for error in errors:
        print(f"  error: {error}", file=sys.stderr)
    if errors:
        return 1

    url = data.get("url")
    if not url:
        print("  error: no export url in response", file=sys.stderr)
        print(f"  {raw[:500]}", file=sys.stderr)
        return 1

    print(url)
    return 0


if __name__ == "__main__":
    sys.exit(main())
