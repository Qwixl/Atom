#!/usr/bin/env python3
"""
Hostile-peer harness for encapsulation.

Starts from conforming accept vectors and mutates them into shapes a hostile
sender would try. Every case MUST be rejected by both the Python second
implementation and (when available) the TypeScript reference via run.mjs's
codec rules reimplemented here as an oracle check against atom_encap.

Fixed corpus vectors stay normative for third parties; this harness is the
adversarial complement (D110).
"""

from __future__ import annotations

import copy
import json
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "second-impl"))

from atom_encap import MEDIA_TYPES, read_atom_data_part

VECTOR_DIR = ROOT / "vectors"
DATA_OBJECT = MEDIA_TYPES["data_object"]
MLS_WIRE = MEDIA_TYPES["mls_wire"]


def load_accept_base() -> dict[str, Any]:
    path = VECTOR_DIR / "070-part-media-type-both-positions.json"
    return json.loads(path.read_text(encoding="utf-8"))


def cases() -> list[tuple[str, dict[str, Any], str]]:
    """(id, part, readAs) — all must reject."""
    base = load_accept_base()
    good_part = base["part"]
    read_as = base["readAs"]
    out: list[tuple[str, dict[str, Any], str]] = []

    def add(
        case_id: str,
        mutate: Callable[[dict[str, Any]], dict[str, Any]],
        seek: str = read_as,
    ) -> None:
        part = mutate(copy.deepcopy(good_part))
        out.append((case_id, part, seek))

    add(
        "H001-conflict-swapped",
        lambda p: {
            **p,
            "mediaType": DATA_OBJECT,
            "data": {**p["data"], "mediaType": MLS_WIRE},
        },
    )
    add(
        "H002-conflict-whitespace-lookalike",
        lambda p: {
            **p,
            "mediaType": DATA_OBJECT + " ",
            "data": {**p["data"], "mediaType": DATA_OBJECT},
        },
    )
    add(
        "H003-dual-content-text-and-data",
        lambda p: {**p, "text": "ignore-me"},
    )
    add(
        "H004-empty-string-part-media-type-with-wrong-envelope",
        lambda p: {
            "data": {**p["data"], "mediaType": MLS_WIRE},
            "mediaType": "",
        },
        seek=DATA_OBJECT,
    )
    add(
        "H005-null-data",
        lambda p: {"data": None, "mediaType": DATA_OBJECT},
    )
    add(
        "H006-array-data",
        lambda p: {"data": [], "mediaType": DATA_OBJECT},
    )
    add(
        "H007-media-type-only-no-content",
        lambda p: {"mediaType": DATA_OBJECT},
    )
    add(
        "H008-raw-claiming-data-object",
        lambda p: {"raw": "AAEC", "mediaType": DATA_OBJECT},
    )
    add(
        "H009-url-claiming-data-object",
        lambda p: {"url": "https://evil.example/payload", "mediaType": DATA_OBJECT},
    )
    add(
        "H010-case-folded-mediatype-key",
        # Hostile JSON that uses a lookalike key; must not be treated as mediaType.
        lambda p: {
            "data": {"MediaType": DATA_OBJECT, "object": p["data"]["object"]},
        },
        seek=DATA_OBJECT,
    )
    add(
        "H011-seek-mls-but-offer-data-object",
        lambda p: p,
        seek=MLS_WIRE,
    )
    add(
        "H012-outer-data-object-inner-mls-label",
        lambda p: {
            "data": {
                "mediaType": MLS_WIRE,
                "object": p["data"]["object"],
            },
            "mediaType": DATA_OBJECT,
        },
    )
    # Envelope says data-object; part member omitted; seek MLS — must not infer from shape.
    add(
        "H013-shape-inference-trap",
        lambda p: {"data": {"object": p["data"]["object"], "mediaType": DATA_OBJECT}},
        seek=MLS_WIRE,
    )
    add(
        "H014-both-absent-empty-object",
        lambda p: {"data": {}},
    )
    add(
        "H015-conflicting-numeric-looking-types",
        lambda p: {
            "data": {**p["data"], "mediaType": "1"},
            "mediaType": "1.0",
        },
    )

    return out


def main() -> int:
    failed = 0
    for case_id, part, read_as in cases():
        resolved = read_atom_data_part(part, read_as)
        if resolved is not None:
            failed += 1
            print(f"  FAIL  {case_id}: hostile part was accepted")
        else:
            print(f"  pass  {case_id}")

    total = len(cases())
    print(f"\n{total - failed}/{total} hostile cases rejected (Python)")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
