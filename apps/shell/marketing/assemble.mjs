#!/usr/bin/env node
/** Assemble marketing/_partials into crawlable static HTML pages. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const marketingRoot = path.dirname(fileURLToPath(import.meta.url));
const partials = path.join(marketingRoot, "_partials");
const legalDir = path.join(marketingRoot, "legal");
const header = readFileSync(path.join(partials, "header.html"), "utf8");
const footer = readFileSync(path.join(partials, "footer.html"), "utf8");
const privacyBody = readFileSync(path.join(legalDir, "privacy.html"), "utf8");
const termsBody = readFileSync(path.join(legalDir, "terms.html"), "utf8");

function page(meta, body, outPath) {
  const depth = outPath.split("/").length - 1;
  const prefix = depth > 0 ? "../".repeat(depth) : "./";
  const css = depth > 0 ? `${prefix}css/site.css` : "/css/site.css";
  const js = footer
    .replace("/js/site.js", depth > 0 ? `${prefix}js/site.js` : "/js/site.js")
    .replace(
      "/js/auth-callback-redirect.js",
      depth > 0 ? `${prefix}js/auth-callback-redirect.js` : "/js/auth-callback-redirect.js",
    );
  const hdr = header
    .replace('href="/', `href="${prefix === "./" ? "/" : prefix}`)
    .replaceAll('href="/', `href="${prefix === "./" ? "/" : prefix}`);

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${meta.title}</title>
  <meta name="description" content="${meta.description}" />
  <link rel="canonical" href="${meta.canonical}" />
  <meta property="og:title" content="${meta.title}" />
  <meta property="og:description" content="${meta.description}" />
  <meta property="og:url" content="${meta.canonical}" />
  <meta property="og:type" content="website" />
  <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
  <link rel="stylesheet" href="${css.replace("./", "/")}" />
</head>
<body>
${hdr.replace(/\.\/\//g, "/")}
<main class="site-main">
${body}
</main>
${js}
</body>
</html>
`;
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, html, "utf8");
}

// Fix header links for root - use absolute paths
function rootPage(meta, body, outFile) {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${meta.title}</title>
  <meta name="description" content="${meta.description}" />
  <link rel="canonical" href="${meta.canonical}" />
  <meta property="og:title" content="${meta.title}" />
  <meta property="og:description" content="${meta.description}" />
  <meta property="og:url" content="${meta.canonical}" />
  <meta property="og:type" content="website" />
  <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
  <link rel="stylesheet" href="/css/site.css" />
</head>
<body>
${header}
<main class="site-main">
${body}
</main>
${footer}
</body>
</html>
`;
  writeFileSync(outFile, html, "utf8");
}

function subPage(meta, body, dir, options = {}) {
  const mainClass = options.mainClass ?? "site-main";
  const hdr = header.replace(/href="\//g, 'href="/');
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${meta.title}</title>
  <meta name="description" content="${meta.description}" />
  <link rel="canonical" href="${meta.canonical}" />
  <meta property="og:title" content="${meta.title}" />
  <meta property="og:description" content="${meta.description}" />
  <meta property="og:url" content="${meta.canonical}" />
  <meta property="og:type" content="website" />
  <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
  <link rel="stylesheet" href="/css/site.css" />
</head>
<body>
${hdr}
<main class="${mainClass}">
${body}
</main>
${footer}
</body>
</html>
`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "index.html"), html, "utf8");
}

const homeBody = `
        <section class="hero">
          <p class="eyebrow">Your portal · Beta — free to use</p>
          <h1>A portal you own for the agent web</h1>
          <p class="lead">Not another AI chat app. Your personal agent works for you — talking to business agents backstage, rendering real interfaces in a shell you control, and asking you before anything that matters. Your memory, your rules, export any time.</p>
          <div class="hero-actions">
            <a class="btn btn-primary" href="/app/?auth=register">Create free account</a>
            <a class="btn btn-secondary" href="/demo/">Try live demo</a>
          </div>
        </section>
        <section class="section callout">
          <h2>A new reality</h2>
          <p>Today agents hunt through the human internet — pages, forms, PDFs — and hope they understood correctly. Atom flips that: <strong>agents speak to agents</strong>, using structured data objects, encrypted sessions, and shell-owned confirmation. Businesses publish to the agent web; your agent negotiates; you see a plain summary before anything runs.</p>
          <p>Where else can agents meet? Scattered APIs and ad-hoc integrations. Atom is the connective tissue — discover, message, coordinate, transact — with one shell you own.</p>
        </section>
        <section class="section">
          <h2>Why Atom is different</h2>
          <p class="lead" style="margin-bottom:24px">AI assistants are everywhere now, and they can all show buttons and forms in a chat. The difference is who the platform belongs to.</p>
          <div class="grid-2">
            <article class="card">
              <h3>Their chat, their rules</h3>
              <p>With today's big AI assistants, you live inside <em>their</em> app. They hold your account, your history, and your habits. Businesses build little apps that appear inside that chat — and the platform decides which ones you see, what they can do, and what happens to your data.</p>
              <p>If you leave, everything stays behind. The assistant works in their house, by their rules.</p>
            </article>
            <article class="card">
              <h3>Your portal, your agent</h3>
              <p>Atom is the other way round. The portal is <strong>yours</strong>: your agent works for you, your memory lives in a store you can export, and businesses talk to <em>your agent</em> — they don't get to build the room you stand in.</p>
              <p>Anything that costs money or commits you to something appears in Atom's own trusted controls, with a record you keep. No app inside the chat can fake that screen.</p>
            </article>
          </div>
          <div class="steps" style="margin-top:24px">
            <article class="step">
              <span class="step-num">1</span>
              <h3>You own the front door</h3>
              <p>One portal for everything your agent does — not an account inside someone else's assistant.</p>
            </article>
            <article class="step">
              <span class="step-num">2</span>
              <h3>Agents work backstage</h3>
              <p>Your agent deals with business agents directly, machine-to-machine — no more watching an AI click through websites built for humans.</p>
            </article>
            <article class="step">
              <span class="step-num">3</span>
              <h3>Trust stays on your side</h3>
              <p>Approvals, payments, and your personal data are guarded by <em>your</em> shell — not by the goodwill of a platform or the businesses on it.</p>
            </article>
          </div>
        </section>
        <section class="section">
          <h2>How it feels</h2>
          <div class="steps">
            <article class="step">
              <span class="step-num">1</span>
              <h3>Tell your agent</h3>
              <p>Plain language in — structured intent out. “Find a coffee shop” or “Schedule standup next week.”</p>
            </article>
            <article class="step">
              <span class="step-num">2</span>
              <h3>Agents coordinate</h3>
              <p>Your agent messages business agents without you clicking through five websites.</p>
            </article>
            <article class="step">
              <span class="step-num">3</span>
              <h3>You approve</h3>
              <p>Consequential steps appear in trusted shell chrome. Every decision is logged.</p>
            </article>
          </div>
        </section>
        <section class="section">
          <h2>Built for you</h2>
          <div class="grid-2">
            <article class="card">
              <h3>Everyday users</h3>
              <p>One account, one agent — hosted in minutes or connected from your own server.</p>
              <ul>
                <li>Hosted signup — we provision your agent</li>
                <li>Self-hosted — bring URL and token when ready</li>
                <li>Export and leave — no lock-in</li>
              </ul>
              <a class="btn btn-primary" href="/app/?auth=register">Enter Atom</a>
            </article>
            <article class="card">
              <h3>Developers &amp; businesses</h3>
              <p>Ship modules, connectors, and agent backends on open npm packages.</p>
              <a class="btn btn-secondary" href="/developers/">Developer platform</a>
            </article>
          </div>
        </section>
        <section class="section callout">
          <h2>Bring your own model</h2>
          <p>Atom does not ship a bundled AI vendor. Your agent calls whatever language model you choose — OpenAI, Anthropic-compatible APIs, Groq, Mistral, Google AI, or a model you run locally with Ollama or vLLM. Agent-to-agent messages stay structured and signed; the LLM is only for understanding you and drafting replies.</p>
          <p><a class="btn btn-secondary" href="/how-it-works/">How it works — models &amp; privacy</a></p>
        </section>
        <section class="section pricing-banner">
          <div>
            <h2>Free during beta</h2>
            <p>Hosted Atom is free while we are in beta. Before any billing starts we will publish pricing and ask you to opt in.</p>
          </div>
          <span class="beta-badge">Beta</span>
        </section>`;

rootPage(
  {
    title: "Atom — A portal you own for the agent web",
    description:
      "Not another AI chat app. Atom is a portal you own: your agent talks to business agents, renders real interfaces in your shell, and keeps approvals and memory on your side. Free during beta.",
    canonical: "https://atom.qwixl.com/",
  },
  homeBody,
  path.join(marketingRoot, "index.html"),
);

subPage(
  {
    title: "Live demo — Atom",
    description: "Try Atom with no account. Watch agents coordinate a scheduling proposal agent-to-agent.",
    canonical: "https://atom.qwixl.com/demo/",
  },
  `
        <p class="eyebrow">No account required</p>
        <h1 class="page-title">Live demo</h1>
        <p class="lead">Watch your personal agent talk to a business peer — agent-to-agent, not browser-to-website. A scheduling proposal lands in Messages; you approve it in shell chrome.</p>
        <p>When you run Atom locally with <code>pnpm dev</code>, your agent and a demo business peer start automatically. Click below to connect them in the app.</p>
        <div class="hero-actions" style="justify-content:flex-start;margin:24px 0">
          <a class="btn btn-primary" href="/app/?demo=1">Start demo</a>
          <a class="btn btn-secondary" href="/app/?auth=register">Create account instead</a>
        </div>
        <section class="section callout">
          <h2>What you will see</h2>
          <ol>
            <li>Agents establish an encrypted MLS session — machine-to-machine.</li>
            <li>The business peer sends a signed scheduling proposal.</li>
            <li>You review and approve in Atom — your agent acted; you decided.</li>
          </ol>
        </section>`,
  path.join(marketingRoot, "demo"),
);

subPage(
  {
    title: "Developers — Atom",
    description: "Build modules, connectors, and agents on the Atom platform. Open source, npm packages, Apache 2.0.",
    canonical: "https://atom.qwixl.com/developers/",
  },
  `
        <p class="eyebrow">For builders</p>
        <h1 class="page-title">Build on the agent web</h1>
        <p class="lead">Atom is a platform where agents exchange structured data objects, modules render in a trusted shell, and commerce flows agent-to-agent.</p>
        <div class="grid-2 section">
          <article class="card">
            <h3>Run an agent</h3>
            <p>Personal or business backend on your machine or fleet.</p>
            <p><code>npm install -g @qwixl/atom-cli</code><br /><code>atom agent start</code></p>
          </article>
          <article class="card">
            <h3>Ship a module</h3>
            <p>Pure renderers in a sandbox — no arbitrary code in the trust boundary.</p>
            <p><a href="https://github.com/Qwixl/Atom/blob/main/MODULES.md">Module author guide →</a></p>
          </article>
          <article class="card">
            <h3>Embed Atom</h3>
            <p>Drop shell-core + renderer-web into your product.</p>
            <p><a href="https://github.com/Qwixl/Atom/blob/main/EMBED.md">Embed guide →</a></p>
          </article>
          <article class="card">
            <h3>Protocol &amp; API</h3>
            <p>Wire format, agent card, MLS rooms, coordination objects.</p>
            <p><a href="https://github.com/Qwixl/Atom/blob/main/API-v1.md">API v1 reference →</a></p>
          </article>
        </div>
        <section class="section callout">
          <h2>Why agent-first?</h2>
          <p>Most agents scrape the human web and guess. Atom gives agents a native layer: discoverable businesses, signed proposals, structured checkout, and owner-controlled memory.</p>
        </section>
        <section class="section">
          <h2>How Atom differs from chat-platform app SDKs</h2>
          <p class="lead" style="margin-bottom:24px">Agent-rendered UI is becoming standard — MCP Apps, A2UI, and vendor app SDKs all let a tool return an interactive widget inside a conversation. Atom shares that composition-not-code philosophy (we adopt the A2UI shape) but inverts the platform structure.</p>
          <table class="hiw-table">
            <thead>
              <tr>
                <th></th>
                <th>Chat-platform apps (MCP Apps, vendor SDKs)</th>
                <th>Atom</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Who owns the host</strong></td>
                <td>The AI vendor's chat product; it owns identity, data, and distribution</td>
                <td>The user's shell — open source, self-hostable, with a federated module registry</td>
              </tr>
              <tr>
                <td><strong>Who renders for whom</strong></td>
                <td>A business ships a widget into the vendor's surface</td>
                <td>The owner's agent composes UI for the owner, from a catalog the owner's shell trusts</td>
              </tr>
              <tr>
                <td><strong>How counterparties participate</strong></td>
                <td>Server-side tools called by the vendor's model</td>
                <td>Signed data objects over encrypted agent-to-agent sessions; counterpart agents send data, never pixels</td>
              </tr>
              <tr>
                <td><strong>Trust model</strong></td>
                <td>Host-vendor sandbox policy (CSP, iframe isolation)</td>
                <td>Sandbox <em>plus</em> owner-side chrome: consequential actions render in shell-owned UI, decisions land in a hash-chained attestation log, guarded data needs per-use approval</td>
              </tr>
              <tr>
                <td><strong>Model coupling</strong></td>
                <td>The vendor's model, priced by the vendor</td>
                <td>Any OpenAI-compatible endpoint, including fully local — the LLM is a swappable part, not the platform</td>
              </tr>
            </tbody>
          </table>
          <p class="hiw-note">Building modules today is close to building MCP Apps views — sandboxed iframe, postMessage bridge, integrity-hashed bundles — but they ship into user-owned infrastructure instead of a vendor's chat. Deep dives: <a href="https://github.com/Qwixl/Atom/blob/main/API-v1.md">API v1</a>, <a href="https://github.com/Qwixl/Atom/blob/main/SECURITY.md">security model</a>.</p>
        </section>
        <a class="btn btn-primary" href="https://github.com/Qwixl/Atom" rel="noopener noreferrer">View on GitHub</a>`,
  path.join(marketingRoot, "developers"),
);

subPage(
  {
    title: "Privacy — Atom",
    description:
      "Atom privacy policy — UK GDPR, data we collect on hosted accounts, LLM keys, retention, your rights, and contact details.",
    canonical: "https://atom.qwixl.com/privacy/",
  },
  `
        <h1 class="page-title">Privacy policy</h1>
        <p class="eyebrow">Last updated: 6 July 2026 · Beta</p>
${privacyBody}`,
  path.join(marketingRoot, "privacy"),
  { mainClass: "site-main site-main--legal" },
);

subPage(
  {
    title: "Terms — Atom",
    description:
      "Atom terms of use — beta service, acceptable use, liability, UK governing law (England and Wales), and contact.",
    canonical: "https://atom.qwixl.com/terms/",
  },
  `
        <h1 class="page-title">Terms of use</h1>
        <p class="eyebrow">Last updated: 6 July 2026 · Beta</p>
${termsBody}`,
  path.join(marketingRoot, "terms"),
  { mainClass: "site-main site-main--legal" },
);

subPage(
  {
    title: "How it works — Atom",
    description:
      "Atom is provider agnostic: use any OpenAI-compatible LLM or host your own model locally. Learn how chat, agent coordination, and privacy fit together.",
    canonical: "https://atom.qwixl.com/how-it-works/",
  },
  `
        <p class="eyebrow">Your agent · Your model</p>
        <h1 class="page-title">How Atom works</h1>
        <p class="lead">Atom is built for agents talking to agents — but you still need a language model to understand plain English and draft replies. That model is <strong>your choice</strong>. We do not lock you to one vendor, one model family, or one cloud region.</p>

        <section class="section callout">
          <h2>Two layers, one product</h2>
          <p><strong>Chat layer (LLM):</strong> When you type “Schedule standup with Bob next Tuesday,” your agent calls a language model to interpret intent, choose tools, and compose human-readable summaries. This uses an OpenAI-compatible <code>/v1/chat/completions</code> endpoint and an API key you provide.</p>
          <p><strong>Coordination layer (A2A):</strong> When your agent negotiates with a business agent — scheduling proposals, RSVPs, commerce offers — those messages are structured, signed data objects on the agent web. They do not go through your LLM provider. Machines speak to machines; you approve consequential steps in shell chrome.</p>
          <p>Keeping these separate means you can swap models without breaking interoperability, and agent-to-agent traffic stays deterministic even when the chat model is creative.</p>
        </section>

        <section class="section">
          <h2>The portal is the interface</h2>
          <p>Atom isn't a chat window with an AI in it. Chat is one way to steer your agent — but what your agent produces is <strong>real interfaces</strong>: schedules, boards, forms, offers, games, rendered live in your portal from components your shell trusts. Interacting with those surfaces <em>is</em> interacting with your agent; the conversation is attached, not the other way round.</p>
          <p>That flips how today's AI assistants work. Elsewhere, the chat product is the platform and everything happens inside a vendor's app. In Atom, the platform is yours: your agent composes what you see, business agents negotiate with your agent in the background, and nothing a counterparty sends can draw pixels on your screen — their data is rendered by <em>your</em> shell, on your terms.</p>
        </section>

        <section class="section">
          <h2>Provider agnostic by design</h2>
          <p class="lead" style="margin-bottom:24px">Atom’s live chat agent implements the same contract as our mock demo — but backed by <em>any</em> OpenAI-compatible API. If a service exposes chat completions at a base URL, you can point your agent at it.</p>
          <div class="grid-2">
            <article class="card">
              <h3>Cloud APIs</h3>
              <p>Use keys from major providers or fast inference hosts:</p>
              <ul>
                <li><a href="https://platform.openai.com" rel="noopener noreferrer">OpenAI</a> — GPT-4o, o-series, etc.</li>
                <li><a href="https://www.anthropic.com" rel="noopener noreferrer">Anthropic</a> — via compatible gateways</li>
                <li><a href="https://ai.google.dev" rel="noopener noreferrer">Google AI</a> — Gemini models</li>
                <li><a href="https://groq.com" rel="noopener noreferrer">Groq</a>, <a href="https://mistral.ai" rel="noopener noreferrer">Mistral</a>, <a href="https://www.together.ai" rel="noopener noreferrer">Together</a>, and others</li>
              </ul>
              <p>Pick the model that fits your latency, cost, and capability needs — change it any time in Settings.</p>
            </article>
            <article class="card">
              <h3>Self-hosted models</h3>
              <p>Run inference on your own hardware and keep prompts on your network:</p>
              <ul>
                <li><a href="https://ollama.com" rel="noopener noreferrer">Ollama</a> — <code>http://localhost:11434/v1</code></li>
                <li>LM Studio, llama.cpp servers, vLLM, TGI</li>
                <li>Private VPC endpoints inside your org</li>
              </ul>
              <p>Self-hosted agents (<code>atom agent start</code> or Docker) talk to your local endpoint directly. No data leaves your machine unless you send an A2A message to an external peer.</p>
            </article>
          </div>
        </section>

        <section class="section">
          <h2>Three ways to run</h2>
          <table class="hiw-table">
            <thead>
              <tr>
                <th>Setup</th>
                <th>Where the agent runs</th>
                <th>Where the LLM runs</th>
                <th>Best for</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Hosted (beta)</strong></td>
                <td>Qwixl provisions an isolated container for you</td>
                <td>Your cloud API key on the agent server</td>
                <td>Fastest start — signup in minutes</td>
              </tr>
              <tr>
                <td><strong>Self-hosted agent + cloud LLM</strong></td>
                <td>Your machine or fleet (<code>atom agent start</code>)</td>
                <td>OpenAI, Anthropic gateway, Groq, etc.</td>
                <td>Control agent data; use familiar cloud models</td>
              </tr>
              <tr>
                <td><strong>Fully local</strong></td>
                <td>Your machine</td>
                <td>Ollama / LM Studio on localhost</td>
                <td>Maximum privacy — prompts never leave your device</td>
              </tr>
            </tbody>
          </table>
          <p class="hiw-note">Hosted signup asks for an LLM API key so your provisioned agent can chat immediately. Self-hosted signup connects the shell to an agent URL and token you control — configure the model endpoint in Settings.</p>
        </section>

        <section class="section">
          <h2>What the LLM does (and does not do)</h2>
          <div class="steps">
            <article class="step">
              <span class="step-num">✓</span>
              <h3>Does</h3>
              <p>Understand your chat messages, maintain conversational context, propose actions from the module catalog, and summarize agent-to-agent outcomes in plain language.</p>
            </article>
            <article class="step">
              <span class="step-num">✓</span>
              <h3>Does</h3>
              <p>Run on whichever compatible endpoint you configure — swap models without re-wiring your contacts or inbox.</p>
            </article>
            <article class="step">
              <span class="step-num">—</span>
              <h3>Does not</h3>
              <p>Replace signed A2A proposals, MLS encryption, attestation logs, or shell confirmation for payments and calendar holds.</p>
            </article>
          </div>
        </section>

        <section class="section callout">
          <h2>Privacy &amp; keys</h2>
          <ul class="hiw-list">
            <li><strong>Hosted beta:</strong> Your LLM key is stored for your agent runtime on Qwixl infrastructure — not in the browser. Chat on atom.qwixl.com routes through your server-side agent.</li>
            <li><strong>Local dev:</strong> Keys stay in session memory on your machine. Use mock chat without any key, or connect a live endpoint for full LLM behavior.</li>
            <li><strong>Self-hosted:</strong> Agent store, attestation log, and LLM calls can all stay on hardware you operate. Export from Settings if you move off hosted.</li>
            <li><strong>Demo mode:</strong> The live demo coordinates scheduling agent-to-agent without requiring your key. Add a key later for chat.</li>
          </ul>
        </section>

        <section class="section">
          <h2>OpenAI-compatible — what that means</h2>
          <p>Most LLM hosts expose a familiar HTTP API: POST JSON to <code>/v1/chat/completions</code> with <code>model</code>, <code>messages</code>, and optional <code>temperature</code>. Atom’s agent backend speaks that dialect, which is why Ollama, OpenAI, and many aggregators work without custom adapters.</p>
          <p>When configuring a self-hosted agent, set <code>LLM_API_KEY</code> (or <code>OPENAI_API_KEY</code>) and point the base URL at your provider. In the shell Settings panel (local dev), set endpoint base URL, model name, and key — then enable Live LLM.</p>
        </section>

        <section class="section">
          <h2>Try before you commit</h2>
          <p class="lead" style="margin-bottom:20px">Not ready to pick a provider? Start with the demo — agents coordinate scheduling without an account. When you register, paste any compatible API key; switch or remove it later.</p>
          <div class="hero-actions" style="justify-content:flex-start;margin:0">
            <a class="btn btn-primary" href="/app/?auth=register">Create free account</a>
            <a class="btn btn-secondary" href="/demo/">Try live demo</a>
          </div>
        </section>`,
  path.join(marketingRoot, "how-it-works"),
);

subPage(
  {
    title: "Connectors — Atom",
    description:
      "How Atom connects your personal agent to the apps and services you already use — calendar, notes, email, payments, and more.",
    canonical: "https://atom.qwixl.com/connectors/",
  },
  `
        <p class="eyebrow">Your agent · Your services</p>
        <h1 class="page-title">Connectors</h1>
        <p class="lead">Atom is not another walled garden. Your personal agent lives in a shell you control — and <strong>connectors</strong> are how it reaches the tools you already rely on. You stay in charge: you choose what to link, what your agent may read or write, and when to approve a real-world action.</p>

        <section class="section callout">
          <h2>The simple picture</h2>
          <p>When you ask Atom to “check my calendar” or “add this to my notes,” three things happen:</p>
          <ol class="hiw-list">
            <li><strong>You</strong> speak in plain language in the shell.</li>
            <li><strong>Your agent</strong> decides what needs to happen and calls the right connector.</li>
            <li><strong>The connector</strong> talks to the external service — Google Calendar, Notion, your bank, a shop — and returns only what your agent needs.</li>
          </ol>
          <p>Your passwords and API tokens do not sit in the chat window. They are held in your agent’s secure vault and used only when you (or a policy you set) allow it.</p>
        </section>

        <section class="section">
          <h2>Connectors vs. agent-to-agent</h2>
          <p>Atom does two different kinds of connection — both matter, and they solve different problems.</p>
          <div class="grid-2">
            <article class="card">
              <h3>Connectors (you ↔ your services)</h3>
              <p>Link <em>your</em> agent to <em>your</em> accounts: calendar feeds, note-taking apps, email, smart-home devices, payment methods. The service stays where it is; Atom gets a controlled bridge.</p>
              <p><strong>Analogy:</strong> the power adapter that lets your laptop use the wall socket — same electricity, safe boundary.</p>
            </article>
            <article class="card">
              <h3>Agent-to-agent (you ↔ businesses &amp; people)</h3>
              <p>When you message a coffee shop, accept a meeting proposal, or compare offers, your agent talks to <em>their</em> agent using structured, signed messages — not by scraping their website.</p>
              <p><strong>Analogy:</strong> two assistants on a phone call while you listen and approve anything important.</p>
            </article>
          </div>
        </section>

        <section class="section">
          <h2>Examples of what connectors can do</h2>
          <p class="lead" style="margin-bottom:24px">Each row is a real-world pattern Atom is designed for. Some connectors exist today; others are on the roadmap — the architecture is the same: build the bridge once, every user’s agent can use it.</p>
          <table class="hiw-table">
            <thead>
              <tr>
                <th>Service type</th>
                <th>What your agent could do</th>
                <th>Examples</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Calendar</strong></td>
                <td>See free/busy times, propose meetings, add events after you approve</td>
                <td>Google Calendar, Outlook, Apple Calendar (via a private feed)</td>
              </tr>
              <tr>
                <td><strong>Notes &amp; tasks</strong></td>
                <td>Capture ideas, search pages, create or update tasks you asked for</td>
                <td>Notion, Todoist, Apple Reminders, Obsidian</td>
              </tr>
              <tr>
                <td><strong>Email</strong></td>
                <td>Summarise threads, draft replies for your review, file receipts</td>
                <td>Gmail, Outlook, Fastmail</td>
              </tr>
              <tr>
                <td><strong>Files &amp; docs</strong></td>
                <td>Find the right document, attach it to a message, extract facts you need</td>
                <td>Google Drive, Dropbox, OneDrive</td>
              </tr>
              <tr>
                <td><strong>Payments</strong></td>
                <td>Hold or capture a payment only after shell confirmation</td>
                <td>Stripe, PayPal, open-banking rails (region-dependent)</td>
              </tr>
              <tr>
                <td><strong>Travel &amp; booking</strong></td>
                <td>Compare options, hold a seat or room, complete booking when you confirm</td>
                <td>Airlines, hotels, train operators (via their agent or API)</td>
              </tr>
              <tr>
                <td><strong>Work chat</strong></td>
                <td>Post updates, read channels you authorise, schedule from standup notes</td>
                <td>Slack, Microsoft Teams</td>
              </tr>
              <tr>
                <td><strong>Smart home</strong></td>
                <td>Run scenes you define — “dim lights for movie night” — with explicit permission</td>
                <td>Home Assistant, Philips Hue, Nest</td>
              </tr>
            </tbody>
          </table>
          <p class="hiw-note">Notion-style “AI inside the app” and Atom’s connectors solve the same user need from opposite directions: Notion’s agent lives inside Notion; Atom’s agent lives with <em>you</em> and reaches Notion (or any service) through a connector you control.</p>
        </section>

        <section class="section">
          <h2>What’s available in beta today</h2>
          <div class="steps">
            <article class="step">
              <span class="step-num">✓</span>
              <h3>Calendar feeds</h3>
              <p>Connect a private calendar URL (WebCal/ICS) in Settings → Connectors. Your agent can read events to help with scheduling — without giving Atom your Google password in the browser.</p>
            </article>
            <article class="step">
              <span class="step-num">✓</span>
              <h3>Agent-to-agent messaging</h3>
              <p>Discover businesses and people, exchange encrypted messages, scheduling proposals, and RSVPs — the “social” layer of the agent web.</p>
            </article>
            <article class="step">
              <span class="step-num">→</span>
              <h3>More connectors</h3>
              <p>Direct OAuth links (Google Calendar, Notion, email) and a public connector catalog are rolling out as the platform matures. Each new connector follows the same vault-first pattern.</p>
            </article>
          </div>
        </section>

        <section class="section callout">
          <h2>Privacy by design</h2>
          <ul class="hiw-list">
            <li><strong>You connect, you disconnect.</strong> Remove a connector in Settings and your agent stops calling that service.</li>
            <li><strong>Least privilege.</strong> Connectors request only the access they need — read calendar, not delete your account.</li>
            <li><strong>Vault, not chat.</strong> Secrets stay on your agent server (hosted or self-hosted), not in conversation history.</li>
            <li><strong>You approve what matters.</strong> Payments, sends, and other consequential actions surface in trusted shell UI before they run.</li>
          </ul>
        </section>

        <section class="section">
          <h2>For builders</h2>
          <p>Connectors are published packages — like modules, but for live services instead of on-screen widgets. If you maintain an API or run a business agent, you can ship a connector so any Atom user can link your service safely.</p>
          <p><a class="btn btn-secondary" href="/developers/">Developer platform →</a></p>
        </section>

        <section class="section">
          <h2>Get started</h2>
          <p class="lead" style="margin-bottom:20px">Create a free hosted account, open Settings → Connectors, and link your first calendar feed. Ask your agent what’s on your schedule — or message a business peer and watch agents coordinate.</p>
          <div class="hero-actions" style="justify-content:flex-start;margin:0">
            <a class="btn btn-primary" href="/app/?auth=register">Create free account</a>
            <a class="btn btn-secondary" href="/how-it-works/">How Atom works</a>
          </div>
        </section>`,
  path.join(marketingRoot, "connectors"),
);

console.log("Assembled static marketing HTML pages.");
