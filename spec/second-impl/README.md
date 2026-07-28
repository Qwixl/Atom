# Python second implementation (encapsulation)

A deliberately small codec in another language that consumes the same wire-JSON
vectors as the TypeScript reference. Its job is not feature parity — it is to
prove that `A2A-v1.md` and the encapsulation vectors describe the wire well
enough that a second engineer can interoperate without reading our TypeScript.

## What it covers

Media-type placement for Atom `data` parts (draft § Encapsulation / vectors
`070`–`078`):

- send both positions (`to_atom_data_part`)
- accept part-member-only or envelope-only
- reject conflict, absent, wrong content kind, wrong media type

It does **not** verify Governed Object signatures, MLS, or replay. Those stay
with `@qwixl/protocol` / `run.mjs` until a fuller second implementation exists.

## Run

```bash
# from repo root
python3 spec/second-impl/run_vectors.py
```

No third-party packages. Exit code non-zero on any disagreement with the corpus.
