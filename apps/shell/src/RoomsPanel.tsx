import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CommsAgentClient } from "./comms/client.js";
import { loadCommsAgentConfig } from "./comms/storage.js";

interface RoomDescriptorWire {
  roomId: string;
  hostDid: string;
  name: string;
  topic?: string;
  moduleId?: string;
  admission?: string;
}

interface RoomMessageWire {
  seq: number;
  senderDid: string;
  kind: "message" | "activity";
  text?: string;
  activityKind?: string;
  at: string;
}

interface RoomsPanelProps {
  initialRoomId?: string | null;
  onActivity?: (note: string) => void;
}

function shortDid(did: string): string {
  return did.length > 16 ? `${did.slice(0, 10)}…` : did;
}

export function RoomsPanel({ initialRoomId, onActivity }: RoomsPanelProps) {
  const config = useMemo(() => loadCommsAgentConfig(), []);
  const client = useMemo(
    () => new CommsAgentClient(config.adminUrl, config.adminToken),
    [config.adminUrl, config.adminToken],
  );
  const [hosted, setHosted] = useState<RoomDescriptorWire[]>([]);
  const [joined, setJoined] = useState<
    Array<{ roomId: string; hostUrl: string; descriptor: RoomDescriptorWire }>
  >([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialRoomId ?? null);
  const [messages, setMessages] = useState<RoomMessageWire[]>([]);
  const [members, setMembers] = useState<Array<{ did: string; name?: string }>>([]);
  const [compose, setCompose] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<number | null>(null);
  const lastSeqRef = useRef(0);

  const allRooms = useMemo(() => {
    const map = new Map<string, RoomDescriptorWire & { hostUrl?: string }>();
    for (const room of hosted) map.set(room.roomId, room);
    for (const entry of joined) map.set(entry.roomId, { ...entry.descriptor, hostUrl: entry.hostUrl });
    return [...map.values()];
  }, [hosted, joined]);

  const selected = allRooms.find((room) => room.roomId === selectedId) ?? null;

  const refreshRooms = useCallback(async () => {
    try {
      const body = await client.listRooms();
      setHosted(body.hosted ?? []);
      setJoined(body.joined ?? []);
      setStatus(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }, [client]);

  const refreshMessages = useCallback(async () => {
    if (!selectedId) return;
    try {
      const body = await client.listRoomMessages(selectedId, lastSeqRef.current);
      if (body.messages.length > 0) {
        setMessages((prev) => {
          const merged = [...prev];
          for (const msg of body.messages) {
            if (!merged.some((m) => m.seq === msg.seq)) merged.push(msg);
          }
          merged.sort((a, b) => a.seq - b.seq);
          return merged.slice(-200);
        });
        lastSeqRef.current = Math.max(lastSeqRef.current, ...body.messages.map((m) => m.seq));
      }
    } catch {
      /* polling — ignore transient errors */
    }
  }, [client, selectedId]);

  const refreshMembers = useCallback(async () => {
    if (!selectedId) return;
    try {
      const body = await client.listRoomMembers(selectedId);
      setMembers(body.members ?? []);
    } catch {
      setMembers([]);
    }
  }, [client, selectedId]);

  useEffect(() => {
    void refreshRooms();
  }, [refreshRooms]);

  useEffect(() => {
    if (initialRoomId) setSelectedId(initialRoomId);
  }, [initialRoomId]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      setMembers([]);
      lastSeqRef.current = 0;
      return;
    }
    lastSeqRef.current = 0;
    setMessages([]);
    void refreshMembers();
    void refreshMessages();
    pollRef.current = window.setInterval(() => {
      void refreshMessages();
    }, 3000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [selectedId, refreshMessages, refreshMembers]);

  async function sendMessage(text: string): Promise<void> {
    if (!selectedId || !text.trim()) return;
    setLoading(true);
    try {
      await client.sendRoomMessage({ roomId: selectedId, text: text.trim() });
      setCompose("");
      await refreshMessages();
      onActivity?.("Message sent");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function sendActivity(activityKind: string): Promise<void> {
    if (!selectedId) return;
    setLoading(true);
    try {
      await client.sendRoomMessage({
        roomId: selectedId,
        kind: "activity",
        activityKind,
        payload: { activityKind },
      });
      await refreshMessages();
      onActivity?.(`Activity: ${activityKind}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <aside className="panel-view rooms-view">
      <header className="panel-toolbar">
        <p className="panel-toolbar-meta">Community spaces — join from Discover or open a hosted room</p>
        <div className="panel-toolbar-actions">
          <button type="button" className="panel-btn" onClick={() => void refreshRooms()}>
            Refresh
          </button>
        </div>
      </header>
      {status ? <p className="comms-status-error">{status}</p> : null}
      <div className="panel-body panel-master-detail comms-main">
        <nav className="panel-list comms-sidebar" aria-label="Rooms">
          <div className="panel-list-head">Your rooms</div>
          <ul className="panel-list-scroll comms-contact-list">
            {allRooms.length === 0 ? (
              <li className="panel-empty">No rooms yet. Use Discover to join the Coffee Shop.</li>
            ) : (
              allRooms.map((room) => (
                <li key={room.roomId}>
                  <button
                    type="button"
                    className={`panel-row comms-contact${selectedId === room.roomId ? " is-selected" : ""}`}
                    onClick={() => setSelectedId(room.roomId)}
                  >
                    <span className="panel-avatar comms-contact-avatar" aria-hidden="true">
                      {room.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="panel-row-body comms-contact-body">
                      <span className="panel-row-title comms-contact-name">{room.name}</span>
                      <span className="panel-row-meta comms-contact-meta">{room.topic ?? room.roomId}</span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </nav>
        <section className="panel-detail rooms-chat-layout">
          {selected ? (
            <>
              <header className="panel-detail-head rooms-chat-head">
                <div className="panel-detail-identity comms-peer-identity">
                  <strong className="panel-detail-title comms-peer-name">{selected.name}</strong>
                  <span className="panel-detail-subtitle comms-peer-status">
                    {members.length > 0 ? `${members.length} here · ` : ""}
                    {selected.topic ?? selected.roomId}
                  </span>
                </div>
              </header>
              <div className="comms-messages rooms-messages">
                {messages.length === 0 ? (
                  <div className="comms-empty-thread">
                    <strong>No messages yet</strong>
                    <p>Say hello — everyone in the room can see chat.</p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div key={msg.seq} className="shell-comms-msg shell-comms-msg-in rooms-msg">
                      <div className="shell-comms-msg-text">
                        <strong>{shortDid(msg.senderDid)}</strong>
                        {msg.kind === "activity" ? (
                          <span> · {msg.activityKind ?? "activity"}</span>
                        ) : (
                          <p>{msg.text}</p>
                        )}
                      </div>
                      <time dateTime={msg.at}>{new Date(msg.at).toLocaleTimeString()}</time>
                    </div>
                  ))
                )}
              </div>
              <footer className="comms-compose rooms-compose">
                <textarea
                  className="panel-textarea rooms-compose-input"
                  value={compose}
                  onChange={(event) => setCompose(event.target.value)}
                  placeholder="Message the room…"
                  rows={1}
                  aria-label="Room message"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendMessage(compose);
                    }
                  }}
                />
                <div className="comms-compose-row">
                  <button
                    type="button"
                    className="panel-btn"
                    disabled={loading || !compose.trim()}
                    onClick={() => void sendMessage(compose)}
                  >
                    Send
                  </button>
                </div>
              </footer>
              {selected.moduleId ? (
                <details className="rooms-venue">
                  <summary>Scene &amp; activities</summary>
                  <iframe
                    className="rooms-module-frame"
                    title={selected.name}
                    src={`/modules/community-coffee-shop/index.html`}
                    sandbox="allow-scripts allow-same-origin"
                    onLoad={(event) => {
                      const frame = event.currentTarget;
                      frame.contentWindow?.postMessage(
                        {
                          type: "init",
                          props: {
                            roomName: selected.name,
                            topic: selected.topic,
                            members,
                            nowPlaying: "lo-fi beats (host)",
                          },
                        },
                        "*",
                      );
                    }}
                  />
                  <div className="rooms-activity-bar">
                    <button
                      type="button"
                      className="panel-btn"
                      disabled={loading}
                      onClick={() => void sendActivity("order")}
                    >
                      Order coffee
                    </button>
                    <button
                      type="button"
                      className="panel-btn"
                      disabled={loading}
                      onClick={() => void sendActivity("listen")}
                    >
                      Listen along
                    </button>
                  </div>
                </details>
              ) : null}
            </>
          ) : (
            <div className="panel-empty comms-no-selection">
              <strong>Select a room</strong>
              <p>Join the Coffee Shop from Discover, or open a room you host.</p>
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}
