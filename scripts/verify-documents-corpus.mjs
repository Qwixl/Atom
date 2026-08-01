#!/usr/bin/env node
/**
 * DOC-01 / D138: enforce clean repo-root markdown allowlist and
 * resolve relative markdown links under documents/.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, normalize, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ROOT_ALLOWLIST = new Set([
  'README.md',
  'LICENSE',
  'CONTRIBUTING.md',
  'CODE_OF_CONDUCT.md',
  'SECURITY.md',
])
const ROOT_DELETE_FORBIDDEN = [
  'A2A-v1.md',
  'AGENT-BACKEND.md',
  'API-v1.md',
  'DEMO-PEER.md',
  'DEVELOPERS.md',
  'EMBED.md',
  'JOIN-AS-PEER.md',
  'LAUNCH-CHECKLIST.md',
  'LAUNCH.md',
  'MODEL-BEHAVIOR-ADMIN.md',
  'MODULES.md',
  'PERSONAL-DEMO.md',
  'PROTOCOL-v1.md',
  'SECRET-STORE.md',
]
const SANITISATION_BODY = [
  /docs\/public-source/i,
  /dual corpus/i,
  /programme-private/i,
  /sanitis(?:e|ed) from/i,
  /docs\/0[0-9]-/,
  /private decisions log/i,
  /decisions log \(private\)/i,
  /private revocation runbook/i,
  /private working (?:tree|doc)/i,
]

const errors = []

for (const name of readdirSync(ROOT)) {
  if (!name.endsWith('.md') && name !== 'LICENSE') continue
  const full = join(ROOT, name)
  if (!statSync(full).isFile()) continue
  if (!ROOT_ALLOWLIST.has(name)) {
    errors.push(`root markdown not allowlisted: ${name}`)
  }
}
for (const name of ROOT_DELETE_FORBIDDEN) {
  if (existsSync(join(ROOT, name))) {
    errors.push(`forbidden root guide still present: ${name}`)
  }
}

const docsRoot = join(ROOT, 'documents')
if (!existsSync(docsRoot)) {
  errors.push('documents/ missing')
} else {
  /** @type {string[]} */
  const mdFiles = []
  function walk(dir) {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, ent.name)
      if (ent.isDirectory()) walk(p)
      else if (ent.isFile() && ent.name.endsWith('.md')) mdFiles.push(p)
    }
  }
  walk(docsRoot)

  const linkRe = /\[[^\]]*\]\(([^)]+)\)/g
  for (const file of mdFiles) {
    const text = readFileSync(file, 'utf8')
    for (const pat of SANITISATION_BODY) {
      if (pat.test(text)) {
        errors.push(`${relative(ROOT, file)}: sanitisation hit ${pat}`)
      }
    }
    let m
    while ((m = linkRe.exec(text))) {
      let target = m[1].trim()
      if (
        !target ||
        target.startsWith('#') ||
        target.startsWith('http://') ||
        target.startsWith('https://') ||
        target.startsWith('mailto:')
      ) {
        continue
      }
      // strip title: url "title"
      const sp = target.indexOf(' ')
      if (sp !== -1) target = target.slice(0, sp)
      const hash = target.indexOf('#')
      const pathPart = hash === -1 ? target : target.slice(0, hash)
      if (!pathPart) continue
      if (pathPart.startsWith('/')) continue
      const resolved = normalize(resolve(dirname(file), pathPart))
      if (!existsSync(resolved)) {
        errors.push(
          `${relative(ROOT, file)}: broken link -> ${target} (resolved ${relative(ROOT, resolved)})`,
        )
      }
    }
  }
}

// Stale root-guide GitHub blob URLs in tracked tree (exclude this script).
const staleBlob =
  /blob\/main\/(?:A2A-v1|AGENT-BACKEND|API-v1|DEMO-PEER|DEVELOPERS|EMBED|JOIN-AS-PEER|LAUNCH-CHECKLIST|LAUNCH|MODEL-BEHAVIOR-ADMIN|MODULES|PERSONAL-DEMO|PROTOCOL-v1|SECRET-STORE)\.md\b/
const scanRoots = ['apps', 'packages', '.github', 'documents', 'spec', 'scripts', 'README.md', 'CONTRIBUTING.md', 'SECURITY.md']
function scanFile(file) {
  if (file.endsWith('verify-documents-corpus.mjs')) return
  const text = readFileSync(file, 'utf8')
  if (staleBlob.test(text)) {
    errors.push(`${relative(ROOT, file)}: stale blob/main/<root-guide>.md URL`)
  }
}
function walkScan(dir) {
  if (!existsSync(dir)) return
  if (statSync(dir).isFile()) {
    scanFile(dir)
    return
  }
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === 'dist' || ent.name === '.git') continue
    const p = join(dir, ent.name)
    if (ent.isDirectory()) walkScan(p)
    else if (/\.(md|ts|tsx|js|mjs|yml|yaml|html)$/.test(ent.name)) scanFile(p)
  }
}
for (const r of scanRoots) walkScan(join(ROOT, r))

if (errors.length) {
  console.error('verify-documents-corpus FAILED:')
  for (const e of errors) console.error(' -', e)
  process.exit(1)
}
console.log('verify-documents-corpus OK')
