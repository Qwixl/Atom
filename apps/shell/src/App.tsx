import { useEffect, useMemo, useRef, useState } from "react";
import {
  AttestationLog,
  Catalog,
  registerCorePrimitives,
  resolveComposition,
  type AttestationEntry,
  type ConsequentialAction,
  type ResolvedSurface,
  type UiEvent,
} from "@atom/shell-core";
import { SurfaceRenderer } from "@atom/renderer-web";
import { MockAgentSession } from "./mock-agent.js";

type FeedItem =
  | { kind: "user"; id: string; text: string }
  | { kind: "agent-text"; id: string; text: string }
  | { kind: "surface"; id: string; surface: ResolvedSurface };

interface PendingAction {
  surfaceId: string;
  action: ConsequentialAction;
}

const SUGGESTIONS = ["Book me a flight to Tokyo", "Show me my spending this quarter"];

export function App() {
  const catalog = useMemo(() => {
    const c = new Catalog();
    registerCorePrimitives(c);
    return c;
  }, []);

  const attestationLog = useMemo(
    () =>
      new AttestationLog({
        persist: (entries) => {
          try {
            localStorage.setItem("atom-attestation", JSON.stringify(entries));
          } catch {
            // Persistence is best-effort in v1.
          }
        },
        restore: (() => {
          try {
            const raw = localStorage.getItem("atom-attestation");
            return raw ? (JSON.parse(raw) as AttestationEntry[]) : undefined;
          } catch {
            return undefined;
          }
        })(),
      }),
    [],
  );

  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [attestations, setAttestations] = useState<readonly AttestationEntry[]>(
    attestationLog.list(),
  );
  const [logOpen, setLogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const idCounter = useRef(0);

  const session = useMemo(() => new MockAgentSession(), []);

  useEffect(() => {
    const unsubscribe = session.subscribe((output) => {
      const id = `item-${++idCounter.current}`;
      if (output.type === "text") {
        setFeed((current) => [...current, { kind: "agent-text", id, text: output.text }]);
      } else if (output.type === "composition") {
        const surface = resolveComposition(output.composition, catalog);
        setFeed((current) => [...current, { kind: "surface", id, surface }]);
      } else if (output.type === "consequential-action") {
        setPending({ surfaceId: output.surfaceId, action: output.action });
      } else if (output.type === "done") {
        setBusy(false);
      }
    });
    return () => {
      unsubscribe();
      session.dispose();
    };
  }, [session, catalog]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [feed, busy]);

  function submitMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setFeed((current) => [
      ...current,
      { kind: "user", id: `item-${++idCounter.current}`, text: trimmed },
    ]);
    setInput("");
    setBusy(true);
    session.sendUserMessage(trimmed);
  }

  function handleUiEvent(event: UiEvent) {
    setBusy(true);
    session.sendUiEvent(event);
  }

  async function decide(decision: "approved" | "declined") {
    if (!pending) return;
    const entry = await attestationLog.append({
      surfaceId: pending.surfaceId,
      action: pending.action,
      decision,
    });
    setAttestations([...attestationLog.list()]);
    setPending(null);
    setBusy(true);
    session.sendActionDecision(entry.action.id, decision);
  }

  return (
    <div className="shell">
      <header className="shell-titlebar">
        <div className="shell-brand">
          <span className="shell-brand-mark" />
          Atom Shell
          <span className="shell-brand-tag">v1 · mock agent · core vocabulary only</span>
        </div>
        <button className="shell-log-toggle" onClick={() => setLogOpen((open) => !open)}>
          Attestation log
          {attestations.length > 0 ? (
            <span className="shell-log-count">{attestations.length}</span>
          ) : null}
        </button>
      </header>

      <div className="shell-body">
        <main className="shell-feed" ref={feedRef}>
          {feed.length === 0 ? (
            <div className="shell-empty">
              <h1>Direct your intent.</h1>
              <p>
                The agent composes; the shell renders from its trusted catalog. Actions of
                consequence only ever happen in shell-owned chrome.
              </p>
              <div className="shell-suggestions">
                {SUGGESTIONS.map((suggestion) => (
                  <button key={suggestion} onClick={() => submitMessage(suggestion)}>
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            feed.map((item) => {
              if (item.kind === "user") {
                return (
                  <div key={item.id} className="feed-user">
                    {item.text}
                  </div>
                );
              }
              if (item.kind === "agent-text") {
                return (
                  <div key={item.id} className="feed-agent">
                    {item.text}
                  </div>
                );
              }
              return (
                <div key={item.id} className="feed-surface">
                  {item.surface.degraded ? (
                    <div className="feed-surface-degraded">degraded rendering</div>
                  ) : null}
                  <SurfaceRenderer surface={item.surface} onEvent={handleUiEvent} />
                </div>
              );
            })
          )}
          {busy ? <div className="feed-busy">agent working…</div> : null}
        </main>

        {logOpen ? (
          <aside className="shell-attestations">
            <h2>Attestation log</h2>
            <p className="shell-attestations-note">
              Append-only, hash-chained record of every consequential decision and the exact terms
              displayed when you made it.
            </p>
            {attestations.length === 0 ? (
              <p className="shell-attestations-empty">No decisions recorded yet.</p>
            ) : (
              attestations.map((entry) => (
                <div key={entry.seq} className={`attestation attestation-${entry.decision}`}>
                  <div className="attestation-head">
                    <span>#{entry.seq}</span>
                    <span>{entry.decision}</span>
                    <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="attestation-title">{entry.action.title}</div>
                  <dl className="attestation-terms">
                    {Object.entries(entry.displayedTerms).map(([key, value]) => (
                      <div key={key}>
                        <dt>{key}</dt>
                        <dd>{String(value)}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="attestation-hash">{entry.hash.slice(0, 16)}…</div>
                </div>
              ))
            )}
          </aside>
        ) : null}
      </div>

      <footer className="shell-composer">
        <input
          value={input}
          placeholder="Tell your agent what you want…"
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submitMessage(input);
          }}
        />
        <button onClick={() => submitMessage(input)} disabled={!input.trim()}>
          Send
        </button>
      </footer>

      {pending ? (
        <div className="chrome-overlay" role="dialog" aria-modal="true">
          <div className="chrome-dialog">
            <div className="chrome-dialog-banner">
              Shell-verified request · terms restated from the data object
            </div>
            <h2>{pending.action.title}</h2>
            <dl className="chrome-terms">
              {Object.entries(pending.action.terms).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{String(value)}</dd>
                </div>
              ))}
            </dl>
            <div className="chrome-actions">
              <button className="chrome-decline" onClick={() => decide("declined")}>
                {pending.action.declineLabel ?? "Decline"}
              </button>
              <button className="chrome-approve" onClick={() => decide("approved")}>
                {pending.action.confirmLabel ?? "Approve"}
              </button>
            </div>
            <p className="chrome-footnote">
              This decision and the terms above will be recorded in your local attestation log.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
