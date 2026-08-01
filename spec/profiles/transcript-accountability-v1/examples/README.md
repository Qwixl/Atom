# Examples — Transcript Accountability v1

Illustrative payloads only. Signatures and full Governed Object envelopes are
omitted.

## Receipt payload

```json
{
  "roomId": "room:example",
  "objectId": "obj_01HZXAMPLE",
  "objectHash": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "seq": 42,
  "acceptedAt": "2026-08-01T12:00:00.000Z"
}
```

## Checkpoint payload

```json
{
  "roomId": "room:example",
  "fromSeq": 40,
  "toSeq": 42,
  "entries": [
    {
      "seq": 40,
      "objectHash": "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    },
    {
      "seq": 41,
      "objectHash": "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    },
    {
      "seq": 42,
      "objectHash": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
  ]
}
```
