"""Wire-JSON codec for Atom `data` parts (draft-chapman-a2a-mls § Encapsulation).

Mirrors the normative rules documented in A2A-v1.md "Where the media type goes":
send both positions; accept either when only one is present; reject when they
disagree; require a `data` content member.
"""

from __future__ import annotations

from typing import Any

MEDIA_TYPES = {
    "data_object": "application/vnd.atom.data-object+json;version=1",
    "mls_wire": "application/vnd.atom.mls-wire+cbor;version=1",
    "mls_handshake": "application/vnd.atom.mls-handshake+json;version=1",
}

# A2A part content is a oneof on the wire: exactly one of these members.
_CONTENT_MEMBERS = ("text", "data", "raw", "url")


def to_atom_data_part(media_type: str, envelope: dict[str, Any]) -> dict[str, Any]:
    """Build a conforming sender part: media type in both positions."""
    body = dict(envelope)
    body["mediaType"] = media_type
    return {"data": body, "mediaType": media_type}


def _envelope_media_type(value: Any) -> str | None:
    if not isinstance(value, dict):
        return None
    candidate = value.get("mediaType")
    return candidate if isinstance(candidate, str) and candidate else None


def read_atom_data_part(part: Any, media_type: str) -> Any | None:
    """
    Resolve a wire-JSON part to the envelope sought under ``media_type``.

    Returns the data envelope on accept, or ``None`` on any reject condition
    (wrong content kind, missing/conflicted media type, media type not matched).
    """
    if not isinstance(part, dict):
        return None

    present = [m for m in _CONTENT_MEMBERS if m in part and part[m] is not None]
    if len(present) != 1:
        return None
    member = present[0]
    if member != "data":
        return None

    value = part["data"]
    if not isinstance(value, dict):
        return None
    declared = part.get("mediaType")
    if not isinstance(declared, str) or not declared:
        declared = None
    envelope = _envelope_media_type(value)

    if declared and envelope and declared != envelope:
        return None
    resolved = declared if declared is not None else envelope
    return value if resolved == media_type else None
