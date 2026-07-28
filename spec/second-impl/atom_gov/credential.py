"""Credential binding: LeafNode signature_key == did:key public key."""

from __future__ import annotations

from .did import did_to_public_key, is_did_key


def credential_binding_holds(
    credential_identity: str, leaf_signature_key: bytes
) -> bool:
    if not is_did_key(credential_identity):
        return False
    try:
        derived = did_to_public_key(credential_identity)
    except ValueError:
        return False
    if len(derived) != len(leaf_signature_key):
        return False
    diff = 0
    for a, b in zip(derived, leaf_signature_key, strict=True):
        diff |= a ^ b
    return diff == 0
