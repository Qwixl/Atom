"""Minimal second implementation of Atom Governed Object verification.

Passes draft vectors 001–061 independently of `@qwixl/protocol`. Uses
`cryptography` only for Ed25519 verify; everything else is stdlib.
"""

from .credential import credential_binding_holds
from .verify import ReplayGuard, verify_data_object

__all__ = ["ReplayGuard", "credential_binding_holds", "verify_data_object"]
