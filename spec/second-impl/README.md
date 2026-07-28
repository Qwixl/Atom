# Python second implementation

A deliberately small codec in another language that consumes the same wire-JSON
vectors as the TypeScript reference. Its job is not feature parity — it is to
prove that the draft and vectors describe the protocol well enough that a second
engineer can interoperate without reading our TypeScript.

## What it covers

1. **Encapsulation** (`atom_encap/`) — media-type placement for Atom `data`
   parts (vectors `070`–`078`). Stdlib only.
2. **Governed Objects** (`atom_gov/`) — structural validation, Ed25519 signature
   under `issuerDid`, expiry, purpose allowlist, replay, and credential binding
   (vectors `001`–`061`). Needs `cryptography` for Ed25519 verify.

It does **not** implement MLS sessions.

## Run

```bash
python3 -m pip install -r spec/second-impl/requirements.txt
python3 spec/second-impl/run_vectors.py   # 31/31
python3 spec/hostile/run_hostile.py       # encapsulation hostile cases
```

Decision context (local corpus): D110 / D119 / D121 — fixed vectors for third parties;
hostile harness for adversarial shapes.
