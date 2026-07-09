## Summary

<!-- What changed and why (1–3 bullets). -->

-

## Design check

- [ ] Fits **agent-led composition** (no new shell keyword routing / task-specific Chat widgets for read-only data)
- [ ] Interactive UI uses a **registry module** when needed; read-only uses `core/*` + tokens/skins
- [ ] No secrets, private operator notes, or real credentials in the diff

## Test plan

- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build` (or scoped package/app build if appropriate)
- [ ] `pnpm registry:verify` (if registry/module listings changed)
- [ ] Manual check (describe):

## Related

<!-- Issues / Discussions: Fixes #123 -->
