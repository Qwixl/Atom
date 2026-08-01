#!/usr/bin/env python3
"""Run conformance vectors against the Python second implementation.

Covers Governed Object / replay / credential-binding / encapsulation — the same
corpus as `spec/vectors/run.mjs`, without importing `@qwixl/protocol`.
"""

from __future__ import annotations

import base64
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from atom_encap import read_atom_data_part
from atom_gov import (
    ReplayGuard,
    credential_binding_holds,
    verify_data_object,
)

VECTOR_DIR = ROOT.parent / "vectors"


def _parse_now(value: str) -> datetime:
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    dt = datetime.fromisoformat(value)
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def evaluate_object(
    obj: dict, *, now: str, permitted: list[str] | None, replay: ReplayGuard
) -> str:
    try:
        verify_data_object(
            obj,
            now=_parse_now(now),
            permitted_purposes=permitted,
            replay=replay,
        )
        return "accept"
    except (ValueError, TypeError, KeyError):
        return "reject"


def evaluate_credential_binding(vector: dict) -> str:
    leaf = base64.b64decode(vector["leafSignatureKey"])
    return (
        "accept"
        if credential_binding_holds(vector["credentialIdentity"], leaf)
        else "reject"
    )


def evaluate_encapsulation(vector: dict) -> str:
    resolved = read_atom_data_part(vector["part"], vector["readAs"])
    return "accept" if resolved is not None else "reject"


def main() -> int:
    files = sorted(p for p in VECTOR_DIR.glob("*.json") if p.name != "manifest.json")
    passed = 0
    failures: list[str] = []

    for path in files:
        vector = json.loads(path.read_text(encoding="utf-8"))
        kind = vector.get("kind")
        results: list[tuple[str, str]] = []

        if kind == "credential-binding":
            results.append((vector["expect"], evaluate_credential_binding(vector)))
        elif kind == "encapsulation-part":
            results.append((vector["expect"], evaluate_encapsulation(vector)))
        elif kind == "data-object-sequence":
            replay = ReplayGuard()
            for step in vector["sequence"]:
                results.append(
                    (
                        step["expect"],
                        evaluate_object(
                            step["object"],
                            now=vector["now"],
                            permitted=vector.get("permittedPurposes"),
                            replay=replay,
                        ),
                    )
                )
        else:
            replay = ReplayGuard()
            outcome = evaluate_object(
                vector["object"],
                now=vector["now"],
                permitted=vector.get("permittedPurposes"),
                replay=replay,
            )
            results.append((vector["expect"], outcome))

        ok = all(expected == actual for expected, actual in results)
        if ok:
            passed += 1
            print(f"  pass  {vector['id']}")
        else:
            failures.append(vector["id"])
            detail = "; ".join(
                f"step {i + 1}: expected {e}, got {a}"
                for i, (e, a) in enumerate(results)
            )
            print(f"  FAIL  {vector['id']}: {detail}")

    total = passed + len(failures)
    print(f"\n{passed}/{total} vectors pass (Python second-impl)")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
