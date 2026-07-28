"""Governed Object structural validation, signature, expiry, purpose, replay."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from .canonical import b64_decode, signing_payload
from .did import did_to_public_key, is_did_key


class ReplayGuard:
    def __init__(self) -> None:
        self._seen: set[str] = set()

    @staticmethod
    def key(issuer_did: str, object_id: str) -> str:
        return f"{issuer_did}\0{object_id}"

    def admit(self, obj: dict[str, Any]) -> bool:
        k = self.key(str(obj["issuerDid"]), str(obj["id"]))
        if k in self._seen:
            return False
        self._seen.add(k)
        return True


def _is_plain_object(value: Any) -> bool:
    return isinstance(value, dict)


def _parse_iso(value: str) -> datetime:
    # Accept trailing Z.
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    return datetime.fromisoformat(value)


def validate_data_object(input_obj: Any) -> tuple[dict[str, Any] | None, list[str]]:
    errors: list[str] = []
    if not _is_plain_object(input_obj):
        return None, ["Data object must be an object"]

    if input_obj.get("version") != 1:
        errors.append("version must be literal 1")
    if not isinstance(input_obj.get("id"), str) or not input_obj["id"].strip():
        errors.append("id must be a non-empty string")
    issuer = input_obj.get("issuerDid")
    if not isinstance(issuer, str) or not issuer.startswith("did:key:"):
        errors.append("issuerDid must be a did:key DID")
    issued_at = input_obj.get("issuedAt")
    if not isinstance(issued_at, str):
        errors.append("issuedAt must be an ISO 8601 timestamp string")
    else:
        try:
            _parse_iso(issued_at)
        except ValueError:
            errors.append("issuedAt must be an ISO 8601 timestamp string")
    if input_obj.get("signatureAlgorithm") != "ed25519":
        errors.append('signatureAlgorithm must be "ed25519"')
    if (
        not isinstance(input_obj.get("signature"), str)
        or not input_obj["signature"].strip()
    ):
        errors.append("signature must be a non-empty base64 string")

    semantic = input_obj.get("semantic")
    if (
        not _is_plain_object(semantic)
        or not isinstance(semantic.get("schema"), str)
        or not semantic["schema"].strip()
    ):
        errors.append("semantic.schema must be a non-empty string")
    if not _is_plain_object(input_obj.get("payload")):
        errors.append("payload must be an object")
    governance = input_obj.get("governance")
    if not _is_plain_object(governance):
        errors.append("governance must be an object")
    elif (
        not isinstance(governance.get("purpose"), str)
        or not governance["purpose"].strip()
    ):
        errors.append("governance.purpose must be a non-empty string")
    elif governance.get("ttlSeconds") is not None and (
        not isinstance(governance["ttlSeconds"], (int, float))
        or governance["ttlSeconds"] < 0
    ):
        errors.append(
            "governance.ttlSeconds must be a non-negative number when present"
        )

    if errors:
        return None, errors
    return input_obj, []


def resolve_expiry(governance: dict[str, Any], issued_at: str) -> datetime | None:
    candidates: list[datetime] = []
    if governance.get("expiresAt"):
        candidates.append(_parse_iso(str(governance["expiresAt"])))
    if governance.get("ttlSeconds") is not None:
        issued = _parse_iso(issued_at)
        candidates.append(
            datetime.fromtimestamp(
                issued.timestamp() + float(governance["ttlSeconds"]), tz=timezone.utc
            )
        )
    if not candidates:
        return None
    return min(candidates)


def verify_signature(obj: dict[str, Any]) -> bool:
    if not is_did_key(str(obj["issuerDid"])):
        return False
    try:
        public = Ed25519PublicKey.from_public_bytes(
            did_to_public_key(str(obj["issuerDid"]))
        )
        message = signing_payload(obj).encode("utf-8")
        signature = b64_decode(str(obj["signature"]))
        public.verify(signature, message)
        return True
    except (ValueError, InvalidSignature, TypeError):
        return False


def verify_data_object(
    input_obj: Any,
    *,
    now: datetime | None = None,
    permitted_purposes: list[str] | None = None,
    replay: ReplayGuard | None = None,
) -> dict[str, Any]:
    parsed, errors = validate_data_object(input_obj)
    if errors or parsed is None:
        raise ValueError("; ".join(errors) or "invalid object")
    obj = parsed
    if not verify_signature(obj):
        raise ValueError(f"Data object {obj['id']} signature verification failed")

    when = now or datetime.now(tz=timezone.utc)
    expiry = resolve_expiry(obj["governance"], str(obj["issuedAt"]))
    if expiry is not None:
        # Compare in UTC-aware space.
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        if when.tzinfo is None:
            when = when.replace(tzinfo=timezone.utc)
        if when >= expiry:
            raise ValueError(f"Data object {obj['id']} expired")

    purpose = str(obj["governance"]["purpose"])
    if permitted_purposes and purpose not in permitted_purposes:
        raise ValueError(f'Data object {obj["id"]} purpose "{purpose}" not allowed')

    if replay is not None and not replay.admit(obj):
        raise ValueError(
            f"Data object {obj['id']} rejected as replay of (issuerDid, id)"
        )

    return obj
