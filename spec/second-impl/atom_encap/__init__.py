"""Minimal second implementation of Atom A2A encapsulation (media-type placement).

Reads wire JSON parts — the bytes a peer actually transmits — not protobuf
tagged unions. Passes draft encapsulation vectors 070–078 independently of
`@qwixl/a2a-transport`.
"""

from .data_part import MEDIA_TYPES, read_atom_data_part, to_atom_data_part

__all__ = ["MEDIA_TYPES", "read_atom_data_part", "to_atom_data_part"]
