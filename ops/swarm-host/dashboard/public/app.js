const agentsEl = document.getElementById("agents");
const summaryEl = document.getElementById("summary");
const findingsEl = document.getElementById("findings");
const chronicleEl = document.getElementById("chronicle");
const stampEl = document.getElementById("stamp");
const detail = document.getElementById("detail");
const detailTitle = document.getElementById("detail-title");
const detailBody = document.getElementById("detail-body");

let latest = null;
let timer = null;

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderSummary(snap) {
  const s = snap.summary;
  const hb = snap.heartbeat;
  summaryEl.innerHTML = [
    ["Up", `${s.up}/${s.total}`],
    ["Police", s.policeUp ? "up" : "down"],
    ["Kill switch", s.killSwitch ? "ON" : "off"],
    ["Pending alerts", String(s.pendingAlerts)],
    ["Findings", String(s.findings)],
    ["Heartbeat", hb ? `${hb.npcs_up}/${hb.npcs_total}` : "—"],
  ]
    .map(
      ([label, value]) =>
        `<div class="stat"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`,
    )
    .join("");
}

function agentCard(agent) {
  const goals = (agent.shortGoals || []).slice(0, 3);
  const mems = (agent.memories || []).slice(0, 3);
  const kindBadge =
    agent.agentKind === "swarm-police"
      ? `<span class="badge police">Police</span>`
      : `<span class="badge">NPC</span>`;
  const upBadge = agent.up
    ? `<span class="badge up">up :${agent.port}</span>`
    : `<span class="badge down">down</span>`;
  return `
    <button type="button" class="card" data-id="${esc(agent.id)}">
      <div class="card-top">
        <div>
          <div class="name">${esc(agent.displayName)}</div>
          <div class="handle">${esc(agent.handle || agent.id)}</div>
        </div>
        <div>${kindBadge} ${upBadge}</div>
      </div>
      <div class="meta-row">
        <span>${esc(agent.homePlace || "no place")}</span>
        <span>mood: ${esc(agent.mood || "—")}</span>
        <span>intents: ${agent.intents?.length ?? 0}</span>
      </div>
      ${
        goals.length
          ? `<ol class="goals">${goals.map((g) => `<li>${esc(g)}</li>`).join("")}</ol>`
          : `<p class="empty">No short goals yet</p>`
      }
      ${
        mems.length
          ? `<ol class="mem">${mems
              .map((m) => `<li><strong>${esc(m.kind)}</strong> ${esc(m.text)}</li>`)
              .join("")}</ol>`
          : `<p class="empty">No recent memories matched</p>`
      }
    </button>
  `;
}

function renderAgents(snap) {
  agentsEl.innerHTML = snap.agents.map(agentCard).join("");
  for (const btn of agentsEl.querySelectorAll(".card")) {
    btn.addEventListener("click", () => {
      const agent = snap.agents.find((a) => a.id === btn.dataset.id);
      if (agent) openDetail(agent);
    });
  }
}

function renderFindings(snap) {
  const items = snap.findings || [];
  if (!items.length) {
    findingsEl.innerHTML = `<p class="empty">No findings</p>`;
    return;
  }
  findingsEl.innerHTML = items
    .slice(0, 20)
    .map((f) => {
      const title = f.title || f.summary || f.id || "finding";
      const body = f.body || f.detail || f.reason || "";
      const sev = f.severity || f.level || "";
      return `<div class="finding">
        <strong>${esc(title)}</strong>
        ${sev ? `<div class="sev">${esc(sev)}</div>` : ""}
        <div>${esc(body)}</div>
      </div>`;
    })
    .join("");
}

function openDetail(agent) {
  detailTitle.textContent = `${agent.displayName} (${agent.id})`;
  const role = agent.core?.role || "—";
  const reason = agent.core?.reasonForBeing || "—";
  const voice = agent.core?.voice || "—";
  const goals = (agent.shortGoals || []).map((g) => `<li>${esc(g)}</li>`).join("") || "<li class='empty'>none</li>";
  const intents =
    (agent.intents || [])
      .map((i) => `<li><strong>${esc(i.kind || i.type || "intent")}</strong> ${esc(i.label || i.title || i.id || "")}</li>`)
      .join("") || "<li class='empty'>none</li>";
  const mems =
    (agent.memories || [])
      .map((m) => `<li><strong>${esc(m.kind)}</strong> ${esc(m.text)}</li>`)
      .join("") || "<li class='empty'>none</li>";
  const pending =
    (agent.pending || [])
      .map((p) => `<li><strong>${esc(p.title || p.id)}</strong> ${esc(p.body || "")}</li>`)
      .join("") || "<li class='empty'>none</li>";
  const log = (agent.logTail || []).join("\n") || "No log lines";
  detailBody.innerHTML = `
    <div class="detail-grid">
      <div>
        <h3>Core</h3>
        <p><strong>Role:</strong> ${esc(role)}</p>
        <p>${esc(reason)}</p>
        <p><strong>Voice:</strong> ${esc(voice)}</p>
        <p><strong>Mood:</strong> ${esc(agent.mood || "—")}</p>
        <h3>Short goals</h3>
        <ol class="goals">${goals}</ol>
        <h3>Standing intents</h3>
        <ol class="goals">${intents}</ol>
      </div>
      <div>
        <h3>Memories</h3>
        <ol class="mem">${mems}</ol>
        <h3>Pending brain alerts</h3>
        <ol class="mem">${pending}</ol>
      </div>
    </div>
    <h3>Recent log</h3>
    <pre class="log">${esc(log)}</pre>
  `;
  detail.showModal();
}

async function load() {
  stampEl.textContent = "Refreshing…";
  try {
    const res = await fetch("/api/snapshot", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    latest = await res.json();
    stampEl.textContent = `${latest.generatedAt} · ${latest.host}`;
    renderSummary(latest);
    renderAgents(latest);
    renderFindings(latest);
    chronicleEl.textContent = latest.chronicle?.text || "No chronicle yet";
  } catch (error) {
    stampEl.textContent = `Error: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function setAuto() {
  if (timer) clearInterval(timer);
  timer = null;
  if (document.getElementById("autorefresh").checked) {
    timer = setInterval(load, 8000);
  }
}

document.getElementById("refresh").addEventListener("click", load);
document.getElementById("autorefresh").addEventListener("change", setAuto);
load();
setAuto();
