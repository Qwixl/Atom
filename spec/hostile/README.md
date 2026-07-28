# Hostile-peer encapsulation harness

Adversarial mutations of conforming parts. Complements the fixed corpus in
`../vectors/` (D110): third parties run the fixed vectors; we also run these
to keep the codec from growing silent preference rules.

```bash
python3 spec/hostile/run_hostile.py
```

Every case must be **rejected** by `spec/second-impl`. New attack shapes belong
here as `HNNN-…` cases, not as edits to the normative 070–078 files unless the
draft itself gains a new MUST.
