# Modules

Publish sandboxed iframe modules to a static registry index.

CLI: `@qwixl/registry-tools` (`atom-registry`).

```bash
pnpm exec atom-registry scaffold --id acme/widget --out ./widget
pnpm exec atom-registry publish-all   # monorepo helper
pnpm registry:verify
```

See [MODULES.md](https://github.com/Qwixl/Atom/blob/main/MODULES.md) and the [module author tutorial](/guides/module-author-tutorial).
