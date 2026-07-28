#!/usr/bin/env python3
"""Run encapsulation vectors 070–078 against the Python second implementation."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from atom_encap import read_atom_data_part

VECTOR_DIR = Path(__file__).resolve().parents[1] / "vectors"


def main() -> int:
    files = sorted(p for p in VECTOR_DIR.glob("*.json") if p.name != "manifest.json")
    passed = 0
    failures: list[str] = []

    for path in files:
        vector = json.loads(path.read_text(encoding="utf-8"))
        if vector.get("kind") != "encapsulation-part":
            continue
        resolved = read_atom_data_part(vector["part"], vector["readAs"])
        outcome = "accept" if resolved is not None else "reject"
        expected = vector["expect"]
        if outcome == expected:
            passed += 1
            print(f"  pass  {vector['id']}")
        else:
            failures.append(vector["id"])
            print(f"  FAIL  {vector['id']}: expected {expected}, got {outcome}")

    total = passed + len(failures)
    print(f"\n{passed}/{total} encapsulation vectors pass (Python second-impl)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    raise SystemExit(main())
