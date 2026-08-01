"""did:key Ed25519 public-key recovery (multibase base58btc)."""

from __future__ import annotations

_ALPHABET = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
_ED25519_PREFIX = bytes([0xED, 0x01])


def _b58decode(data: str) -> bytes:
    if not data:
        raise ValueError("empty base58")
    n = 0
    for ch in data.encode("ascii"):
        try:
            digit = _ALPHABET.index(ch)
        except ValueError as exc:
            raise ValueError("invalid base58 character") from exc
        n = n * 58 + digit
    # Preserve leading zeros (encoded as leading '1's).
    pad = 0
    for ch in data:
        if ch == "1":
            pad += 1
        else:
            break
    raw = n.to_bytes((n.bit_length() + 7) // 8 or 1, "big") if n else b""
    return b"\x00" * pad + raw


def did_to_public_key(did: str) -> bytes:
    if not did.startswith("did:key:"):
        raise ValueError(f"Unsupported DID method: {did}")
    multibase = did[len("did:key:") :]
    encoded = multibase.removeprefix("z")
    decoded = _b58decode(encoded)
    if len(decoded) != 34 or decoded[0:2] != _ED25519_PREFIX:
        raise ValueError("did:key does not contain an Ed25519 public key")
    return decoded[2:]


def is_did_key(did: str) -> bool:
    try:
        did_to_public_key(did)
        return True
    except (ValueError, UnicodeEncodeError):
        return False
