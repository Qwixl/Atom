# Examples

These files are **wire JSON**: the shape a peer transmits or receives on the
network, not an internal SDK tagged-union representation.

| File | What it shows |
|---|---|
| [valid-comms-message.json](./valid-comms-message.json) | A2A message declaring the GO extension URI and carrying a valid Governed Object part (object from vector `001`) |
| [mls-only-message-no-go-extension.json](./mls-only-message-no-go-extension.json) | MLS wire part only; `extensions` is empty so the GO URI is not claimed |

Normative rules: [../SPEC.md](../SPEC.md). Vector source for the GO object:
[`../../../vectors/001-valid-comms-message.json`](../../../vectors/001-valid-comms-message.json).
