"""Deterministic JSON for Ed25519 signing (sorted object keys, stable arrays)."""

from __future__ import annotations

import base64
import json
from typing import Any


def stable_stringify(value: Any) -> str:
    if value is None or isinstance(value, (bool, int, float, str)):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, list):
        return "[" + ",".join(stable_stringify(item) for item in value) + "]"
    if isinstance(value, dict):
        # Keep JSON null (Python None); omit only absent keys — mirrors JS undefined filter.
        keys = sorted(value.keys())
        inner = ",".join(
            f"{json.dumps(k, ensure_ascii=False)}:{stable_stringify(value[k])}"
            for k in keys
        )
        return "{" + inner + "}"
    raise TypeError(f"unsupported type for stable_stringify: {type(value)!r}")


def signing_payload(obj: dict[str, Any]) -> str:
    return stable_stringify(
        {
            "version": obj["version"],
            "id": obj["id"],
            "issuerDid": obj["issuerDid"],
            "issuedAt": obj["issuedAt"],
            "semantic": obj["semantic"],
            "payload": obj["payload"],
            "governance": obj["governance"],
        }
    )


def b64_decode(encoded: str) -> bytes:
    return base64.b64decode(encoded, validate=True)
