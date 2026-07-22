import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createModuleBridge, MODULE_IFRAME_SANDBOX } from "@qwixl/renderer-web";
import { CommsAgentClient } from "./comms/client.js";
import { quickJoinCoffeeShop } from "./discoverActions.js";
import { loadCommsAgentConfig, loadContacts, saveContacts } from "./comms/storage.js";
import { isAgentAuthError, formatDiscoverHostError } from "./comms/agentErrors.js";
import { getChatSessionToken } from "./comms/chatSessionToken.js";
import { useAgentConfig } from "./comms/useAgentConfig.js";
import type { AgentContact } from "./comms/types.js";
import { loadRoomAttendance, saveRoomAttendance, type RoomAttendanceMode } from "./roomAttendance.js";
import {
  formatRoomActivity,
  moduleBundleUrl,
  COFFEE_SHOP_ROOM_ID,
  type CatalogRoom,
} from "./roomUtils.js";
import {
  createCommunityRoom,
  decideRoomJoinRequest,
  fetchCommunityRoomCatalog,
  fetchRoomCreationStatus,
  fetchRoomJoinRequests,
  type JoinRequestWire,
} from "./communityRooms.js";
import { COMMUNITY_HOST_PUBLIC_URL } from "./hostConfig.js";
import { ATOM_BASE_ROOM_POLICY_URL } from "./roomPolicy.js";
import { formatRoomMemberLabel, formatRoomSenderLabel, loadOwnerHandle, ownerHandleForRooms } from "./ownerHandle.js";
import { IconLeave, IconRefresh } from "./shell/ShellIcons.js";
import { ContactAbuseReportForm } from "./ContactAbuseReportForm.js";
import { ComposeExtras, insertAtCursor } from "./compose/ComposeExtras.js";
import type { GifItem } from "./compose/gifLibrary.js";
import {
  createOutgoingFriendRequest,
  ingestIncomingFriendRequest,
  listIncomingFriendRequests,
  updateFriendRequestStatus,
  type FriendRequest,
} from "./compose/friendRequests.js";
import { resizeTextareaToContent } from "./ui/resizeTextareaToContent.js";

interface RoomDescriptorWire {
  roomId: string;
  hostDid: string;
  name: string;
  topic?: string;
  description?: string;
  category?: string;
  moduleId?: string;
  admission?: string;
  status?: string;
  hostUrl?: string;
  creatorDid?: string;
  rules?: { basePolicyUrl: string; hostRules: string[] };
}

interface RoomGifPayload {
  url: string;
  previewUrl?: string;
  title?: string;
  width?: number;
  height?: number;
}

interface RoomMessageWire {
  seq: number;
  senderDid: string;
  kind: "message" | "activity";
  text?: string;
  activityKind?: string;
  payload?: Record<string, unknown>;
  at: string;
  deleted?: boolean;
  editedAt?: string;
}

interface RoomMemberWire {
  did: string;
  name?: string;
  endpoint?: string;
}

interface RoomsPanelProps {
  initialRoomId?: string | null;
  contacts?: AgentContact[];
  onContactsChange?: (contacts: AgentContact[]) => void;
  onOpenDiscover?: () => void;
  onActivity?: (note: string) => void;
  vaultUnlocked?: boolean;
  agentConnectionReady?: boolean;
  onAgentAuthFailure?: () => void | Promise<void>;
  onRequestReconnect?: () => void;
}

function memberLabel(
  member: RoomMemberWire,
  localDid: string | null,
  ownerHandle: string | undefined,
): string {
  return formatRoomMemberLabel(member, localDid, ownerHandle);
}

export function RoomsPanel({
  initialRoomId,
  contacts: contactsProp,
  onContactsChange,
  onOpenDiscover,
  onActivity,
  vaultUnlocked = true,
  agentConnectionReady = true,
  onAgentAuthFailure,
  onRequestReconnect,
}: RoomsPanelProps) {
  const { client, config: agentConfig, sessionReady } = useAgentConfig(vaultUnlocked);
  const connectionActive = agentConnectionReady && vaultUnlocked && sessionReady;
  const [localDid, setLocalDid] = useState<string | null>(null);
  const [hosted, setHosted] = useState<RoomDescriptorWire[]>([]);
  const [joined, setJoined] = useState<
    Array<{ roomId: string; hostUrl: string; descriptor: RoomDescriptorWire }>
  >([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialRoomId ?? null);
  const [messages, setMessages] = useState<RoomMessageWire[]>([]);
  const [members, setMembers] = useState<RoomMemberWire[]>([]);
  const [attendance, setAttendance] = useState<RoomAttendanceMode>("present");
  const [memberMenuDid, setMemberMenuDid] = useState<string | null>(null);
  const [memberReportDid, setMemberReportDid] = useState<string | null>(null);
  const [compose, setCompose] = useState("");
  const [pendingGif, setPendingGif] = useState<GifItem | null>(null);
  const [editingSeq, setEditingSeq] = useState<number | null>(null);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sceneOpen, setSceneOpen] = useState(false);
  const [mobilePane, setMobilePane] = useState<"chat" | "members">("chat");
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const [catalog, setCatalog] = useState<CatalogRoom[]>([]);
  const [catalogHostUrl, setCatalogHostUrl] = useState(COMMUNITY_HOST_PUBLIC_URL);
  const [createOpen, setCreateOpen] = useState(false);
  const [createEnabled, setCreateEnabled] = useState(true);
  const [createForm, setCreateForm] = useState({
    name: "",
    description: "",
    category: "Town",
    admission: "open" as "open" | "invite" | "request",
    hostRules: "",
    acceptedBaseRules: false,
  });
  const [roomReportOpen, setRoomReportOpen] = useState(false);
  const [pendingJoinRequests, setPendingJoinRequests] = useState<JoinRequestWire[]>([]);
  const composeRef = useRef<HTMLTextAreaElement | null>(null);
  const pollRef = useRef<number | null>(null);
  const memberPollRef = useRef<number | null>(null);
  const membersRef = useRef(members);
  const lastSeqRef = useRef(0);
  const moduleFrameRef = useRef<HTMLIFrameElement | null>(null);
  const localDidRef = useRef(localDid);

  membersRef.current = members;
  localDidRef.current = localDid;

  const contacts = contactsProp ?? loadContacts();
  const ownerHandle = useMemo(() => loadOwnerHandle(), []);
  const ownerHandleRef = useRef(ownerHandle);
  ownerHandleRef.current = ownerHandle;

  useLayoutEffect(() => {
    if (composeRef.current) resizeTextareaToContent(composeRef.current);
  }, [compose]);

  useEffect(() => {
    if (!localDid) {
      setFriendRequests([]);
      return;
    }
    setFriendRequests(listIncomingFriendRequests(localDid));
  }, [localDid]);

  const joinedIds = useMemo(() => new Set(joined.map((entry) => entry.roomId)), [joined]);
  const hasJoinedCoffeeShop = joinedIds.has(COFFEE_SHOP_ROOM_ID);

  const allRooms = useMemo(() => {
    const map = new Map<string, RoomDescriptorWire>();
    for (const room of catalog) {
      map.set(room.roomId, {
        roomId: room.roomId,
        hostDid: room.hostDid,
        name: room.name,
        topic: room.topic ?? room.description,
        description: room.description,
        category: room.category,
        moduleId: room.moduleId,
        admission: room.admission,
        status: room.status,
        hostUrl: catalogHostUrl,
        creatorDid: room.creatorDid,
        rules: room.rules,
      });
    }
    for (const room of hosted) map.set(room.roomId, room);
    for (const entry of joined) map.set(entry.roomId, { ...entry.descriptor, hostUrl: entry.hostUrl });
    return [...map.values()];
  }, [catalog, catalogHostUrl, hosted, joined]);

  const roomsByCategory = useMemo(() => {
    const groups = new Map<string, RoomDescriptorWire[]>();
    for (const room of allRooms) {
      if (room.status === "closed") continue;
      const category = room.category?.trim() || "Town";
      const list = groups.get(category) ?? [];
      list.push(room);
      groups.set(category, list);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [allRooms]);

  const categoryOptions = useMemo(() => {
    const set = new Set(roomsByCategory.map(([c]) => c));
    for (const preset of ["Town", "Faith", "Fitness", "Arts", "Learning", "Product"]) set.add(preset);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [roomsByCategory]);

  const selected = allRooms.find((room) => room.roomId === selectedId) ?? null;
  const canLeave = selectedId ? joinedIds.has(selectedId) : false;

  const visibleMessages = useMemo(
    () =>
      messages.filter(
        (msg) =>
          msg.kind === "message" ||
          (msg.kind === "activity" &&
            msg.activityKind !== "message_edit" &&
            msg.activityKind !== "message_delete"),
      ),
    [messages],
  );

  const moduleMembers = useMemo(() => {
    return members.map((member) => ({
      ...member,
      away: member.did === localDid && attendance === "away",
    }));
  }, [members, localDid, attendance]);

  const pushModuleInit = useCallback(() => {
    const frame = moduleFrameRef.current;
    if (!frame?.contentWindow || !selected?.moduleId) return;
    const bridge = createModuleBridge(moduleBundleUrl(selected.moduleId));
    bridge.sendInit(frame.contentWindow, {
      roomName: selected.name,
      topic: selected.topic,
      members: moduleMembers,
      nowPlaying: "lo-fi beats (host)",
    });
  }, [moduleMembers, selected]);

  const refreshCatalog = useCallback(async () => {
    try {
      const body = await fetchCommunityRoomCatalog();
      setCatalog(body.rooms);
      setCatalogHostUrl(body.hostUrl);
    } catch {
      /* catalog is best-effort until community host is up */
    }
  }, []);

  const refreshRooms = useCallback(async () => {
    void refreshCatalog();
    void fetchRoomCreationStatus()
      .then((s) => setCreateEnabled(s.enabled))
      .catch(() => undefined);
    if (!connectionActive) {
      setStatus(null);
      return;
    }
    try {
      const body = await client.listRooms();
      setHosted(body.hosted ?? []);
      setJoined(body.joined ?? []);
      setStatus(null);
    } catch (error) {
      if (isAgentAuthError(error)) {
        await onAgentAuthFailure?.();
        try {
          const token = getChatSessionToken() ?? agentConfig.adminToken;
          const retry = new CommsAgentClient(agentConfig.adminUrl, {
            readToken: token,
            adminToken: agentConfig.adminToken,
          });
          const body = await retry.listRooms();
          setHosted(body.hosted ?? []);
          setJoined(body.joined ?? []);
          setStatus(null);
          return;
        } catch {
          /* fall through */
        }
      }
      const message = error instanceof Error ? error.message : String(error);
      setStatus(message);
    }
  }, [
    agentConfig.adminToken,
    agentConfig.adminUrl,
    client,
    connectionActive,
    onAgentAuthFailure,
    refreshCatalog,
  ]);

  const refreshMessages = useCallback(async () => {
    if (!selectedId) return;
    try {
      const body = await client.listRoomMessages(selectedId, lastSeqRef.current);
      if (body.messages.length > 0) {
        const membersSnapshot = membersRef.current;
        const handleSnapshot = ownerHandleRef.current;
        const didSnapshot = localDidRef.current;
        setMessages((prev) => {
          const bySeq = new Map(prev.map((m) => [m.seq, m]));
          for (const msg of body.messages) {
            bySeq.set(msg.seq, msg);
            if (
              msg.kind === "activity" &&
              (msg.activityKind === "message_edit" || msg.activityKind === "message_delete")
            ) {
              const targetSeq = Number(msg.payload?.targetSeq);
              const target = bySeq.get(targetSeq);
              if (target && Number.isFinite(targetSeq)) {
                if (msg.activityKind === "message_delete") {
                  bySeq.set(targetSeq, {
                    ...target,
                    deleted: true,
                    text: undefined,
                    payload: undefined,
                  });
                } else {
                  const text =
                    typeof msg.payload?.text === "string" ? msg.payload.text : target.text;
                  const gif = msg.payload?.gif;
                  bySeq.set(targetSeq, {
                    ...target,
                    text,
                    editedAt: msg.at,
                    payload:
                      gif && typeof gif === "object"
                        ? { gif: gif as Record<string, unknown> }
                        : target.payload,
                  });
                }
              }
            }
            if (
              msg.kind === "activity" &&
              msg.activityKind === "friend_request" &&
              didSnapshot &&
              typeof msg.payload?.toDid === "string" &&
              msg.payload.toDid === didSnapshot &&
              msg.senderDid !== didSnapshot
            ) {
              ingestIncomingFriendRequest({
                id: typeof msg.payload.requestId === "string" ? msg.payload.requestId : undefined,
                fromDid: msg.senderDid,
                fromName:
                  typeof msg.payload.fromName === "string"
                    ? msg.payload.fromName
                    : formatRoomSenderLabel(
                        msg.senderDid,
                        membersSnapshot,
                        didSnapshot,
                        handleSnapshot,
                      ),
                fromEndpoint:
                  typeof msg.payload.fromEndpoint === "string"
                    ? msg.payload.fromEndpoint
                    : membersSnapshot.find((m) => m.did === msg.senderDid)?.endpoint,
                toDid: didSnapshot,
                roomId: selectedId,
              });
              setFriendRequests(listIncomingFriendRequests(didSnapshot));
            }
          }
          return [...bySeq.values()].sort((a, b) => a.seq - b.seq).slice(-200);
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
    if (!connectionActive) {
      setLocalDid(null);
      return;
    }
    void client.health().then((body) => setLocalDid(body.did)).catch(() => setLocalDid(null));
  }, [client, connectionActive]);

  useEffect(() => {
    void refreshRooms();
  }, [refreshRooms]);

  useEffect(() => {
    if (initialRoomId) {
      setSelectedId(initialRoomId);
      return;
    }
    if (selectedId) return;
    if (allRooms.length === 0) return;
    setSelectedId(allRooms[0]!.roomId);
  }, [allRooms, initialRoomId, selectedId]);

  useEffect(() => {
    setRoomReportOpen(false);
    if (!selectedId) {
      setPendingJoinRequests([]);
      return;
    }
    let cancelled = false;
    void fetchRoomJoinRequests(selectedId).then((requests) => {
      if (!cancelled) setPendingJoinRequests(requests);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      setMembers([]);
      setMemberMenuDid(null);
      lastSeqRef.current = 0;
      return;
    }
    setAttendance(loadRoomAttendance(selectedId));
    lastSeqRef.current = 0;
    setMessages([]);
    void refreshMembers();
    void refreshMessages();
    pollRef.current = window.setInterval(() => {
      void refreshMessages();
    }, 3000);
    memberPollRef.current = window.setInterval(() => {
      void refreshMembers();
    }, 8000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      if (memberPollRef.current) window.clearInterval(memberPollRef.current);
    };
  }, [selectedId, refreshMessages, refreshMembers]);

  useEffect(() => {
    pushModuleInit();
  }, [pushModuleInit]);

  const sendActivity = useCallback(
    async (activityKind: string): Promise<void> => {
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
    },
    [client, onActivity, refreshMessages, selectedId],
  );

  const sceneModuleBridge = useMemo(
    () => (selected?.moduleId ? createModuleBridge(moduleBundleUrl(selected.moduleId)) : null),
    [selected?.moduleId],
  );

  useEffect(() => {
    if (!sceneModuleBridge) return;
    const isAllowedOrigin = sceneModuleBridge.isAllowedMessageOrigin;
    function onMessage(event: MessageEvent): void {
      if (event.source !== moduleFrameRef.current?.contentWindow) return;
      if (!isAllowedOrigin(event.origin)) return;
      const data = event.data as {
        type?: string;
        event?: { name?: string; payload?: { activityKind?: string } };
      };
      if (!selectedId || data?.type !== "event") return;
      if (data.event?.name !== "community/coffee-shop/activity") return;
      const activityKind = data.event.payload?.activityKind?.trim();
      if (!activityKind) return;
      void sendActivity(activityKind);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [sceneModuleBridge, selectedId, sendActivity]);

  async function sendMessage(text: string, gif?: GifItem | null): Promise<void> {
    if (!selectedId) return;
    const trimmed = text.trim();
    const attachment = gif ?? pendingGif;
    if (!trimmed && !attachment) return;
    setLoading(true);
    try {
      const gifPayload = attachment
        ? {
            gif: {
              url: attachment.url,
              previewUrl: attachment.previewUrl,
              title: attachment.title,
              width: attachment.width,
              height: attachment.height,
            } satisfies RoomGifPayload,
          }
        : undefined;
      if (editingSeq != null) {
        await client.sendRoomMessage({
          roomId: selectedId,
          kind: "activity",
          activityKind: "message_edit",
          payload: { targetSeq: editingSeq, text: trimmed, ...gifPayload },
        });
        setEditingSeq(null);
        onActivity?.("Message edited");
      } else {
        await client.sendRoomMessage({
          roomId: selectedId,
          text: trimmed || undefined,
          payload: gifPayload,
        });
        onActivity?.("Message sent");
      }
      setCompose("");
      setPendingGif(null);
      await refreshMessages();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function deleteOwnMessage(seq: number): Promise<void> {
    if (!selectedId) return;
    setLoading(true);
    try {
      await client.sendRoomMessage({
        roomId: selectedId,
        kind: "activity",
        activityKind: "message_delete",
        payload: { targetSeq: seq },
      });
      if (editingSeq === seq) {
        setEditingSeq(null);
        setCompose("");
        setPendingGif(null);
      }
      await refreshMessages();
      onActivity?.("Message deleted");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  function beginEdit(msg: RoomMessageWire): void {
    setEditingSeq(msg.seq);
    setCompose(msg.text ?? "");
    const gif = msg.payload?.gif as RoomGifPayload | undefined;
    setPendingGif(
      gif?.url
        ? {
            id: `edit-${msg.seq}`,
            title: gif.title || "GIF",
            url: gif.url,
            previewUrl: gif.previewUrl || gif.url,
            width: gif.width,
            height: gif.height,
          }
        : null,
    );
    composeRef.current?.focus();
  }

  async function sendFriendRequest(member: RoomMemberWire): Promise<void> {
    if (!localDid || !selectedId) return;
    if (!member.endpoint?.trim()) {
      setStatus("This member has not shared an agent address.");
      return;
    }
    setLoading(true);
    try {
      const fromEndpoint = agentConfig.adminUrl?.trim() || undefined;
      const request = createOutgoingFriendRequest({
        fromDid: localDid,
        fromName: ownerHandle ? `@${ownerHandle}` : "You",
        fromEndpoint,
        toDid: member.did,
        toName: memberLabel(member, localDid, ownerHandle),
        toEndpoint: member.endpoint.trim(),
        roomId: selectedId,
      });
      await client.sendRoomMessage({
        roomId: selectedId,
        kind: "activity",
        activityKind: "friend_request",
        payload: {
          requestId: request.id,
          toDid: member.did,
          fromName: request.fromName,
          fromEndpoint,
        },
      });
      setMemberMenuDid(null);
      await refreshMessages();
      onActivity?.(`Friend request sent to ${memberLabel(member, localDid, ownerHandle)}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function acceptFriendRequest(request: FriendRequest): Promise<void> {
    if (!localDid) return;
    setLoading(true);
    try {
      if (request.fromEndpoint?.trim()) {
        await client.connectPeer(request.fromEndpoint.trim(), request.fromDid);
      }
      const existing = contacts.find((c) => c.did === request.fromDid);
      const endpoint = request.fromEndpoint?.trim() || existing?.endpoint || "";
      const contact: AgentContact = existing
        ? { ...existing, endpoint: endpoint || existing.endpoint, source: existing.source ?? "room" }
        : {
            id: request.fromDid,
            did: request.fromDid,
            name: request.fromName || request.fromDid.slice(0, 16),
            endpoint,
            connectedAt: new Date().toISOString(),
            kind: "person",
            source: "room",
          };
      if (!contact.endpoint) {
        throw new Error("Cannot add contact — no agent address on the request.");
      }
      const list = [...contacts.filter((row) => row.did !== request.fromDid), contact];
      saveContacts(list);
      onContactsChange?.(list);
      updateFriendRequestStatus(request.id, "accepted");
      setFriendRequests(listIncomingFriendRequests(localDid));
      if (selectedId) {
        await client.sendRoomMessage({
          roomId: selectedId,
          kind: "activity",
          activityKind: "friend_accept",
          payload: { requestId: request.id, toDid: request.fromDid },
        });
        await refreshMessages();
      }
      onActivity?.(`Added ${contact.name} to Messages contacts`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  function declineFriendRequest(request: FriendRequest): void {
    if (!localDid) return;
    updateFriendRequestStatus(request.id, "declined");
    setFriendRequests(listIncomingFriendRequests(localDid));
  }

  async function joinCoffeeShop(): Promise<void> {
    setLoading(true);
    setStatus(null);
    try {
      const roomId = await quickJoinCoffeeShop(client, ownerHandleForRooms());
      await refreshRooms();
      setSelectedId(roomId);
      onActivity?.("Joined Qwixl Coffee Shop");
    } catch (error) {
      setStatus(formatDiscoverHostError(error));
    } finally {
      setLoading(false);
    }
  }

  async function joinCatalogRoom(room: RoomDescriptorWire): Promise<void> {
    const hostUrl = (room.hostUrl ?? catalogHostUrl).replace(/\/$/, "");
    if (!hostUrl) {
      setStatus("Room host URL unknown");
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const admission = room.admission ?? "open";
      const result = await client.joinRemoteRoomWithOptions({
        hostUrl,
        roomId: room.roomId,
        memberName: ownerHandleForRooms(),
        requestOnly: admission === "request",
      });
      await refreshRooms();
      setSelectedId(room.roomId);
      if (result.pending) {
        onActivity?.(`Requested to join ${room.name}`);
        setStatus("Join request sent — waiting for host approval.");
      } else {
        onActivity?.(result.alreadyMember ? `Opened ${room.name}` : `Joined ${room.name}`);
      }
    } catch (error) {
      setStatus(formatDiscoverHostError(error));
    } finally {
      setLoading(false);
    }
  }

  async function submitCreateRoom(): Promise<void> {
    if (!createForm.acceptedBaseRules) {
      setStatus("Accept Atom community rules to create a room.");
      return;
    }
    if (!createForm.name.trim()) {
      setStatus("Room title is required.");
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const hostRules = createForm.hostRules
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const { room, hostUrl } = await createCommunityRoom({
        name: createForm.name.trim(),
        description: createForm.description.trim() || undefined,
        category: createForm.category.trim() || "Town",
        admission: createForm.admission,
        hostRules,
        acceptedBaseRules: true,
        creatorDid: localDid || undefined,
      });
      setCatalogHostUrl(hostUrl);
      setCreateOpen(false);
      setCreateForm({
        name: "",
        description: "",
        category: "Town",
        admission: "open",
        hostRules: "",
        acceptedBaseRules: false,
      });
      await refreshRooms();
      setSelectedId(room.roomId);
      onActivity?.(`Created room ${room.name}`);
      if (room.admission === "open" || room.admission === "invite") {
        await joinCatalogRoom({
          roomId: room.roomId,
          hostDid: room.hostDid,
          name: room.name,
          topic: room.topic ?? room.description,
          description: room.description,
          category: room.category,
          moduleId: room.moduleId,
          admission: room.admission,
          status: room.status,
          hostUrl,
          rules: room.rules,
        });
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function leaveSelectedRoom(): Promise<void> {
    if (!selectedId || !canLeave) return;
    setLoading(true);
    setStatus(null);
    try {
      await client.leaveRoom(selectedId);
      await refreshRooms();
      setSelectedId(null);
      onActivity?.("Left room");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  function setAttendanceMode(mode: RoomAttendanceMode): void {
    if (!selectedId) return;
    setAttendance(mode);
    saveRoomAttendance(selectedId, mode);
    if (mode === "away") {
      void sendActivity("presence-away");
    } else {
      void sendActivity("presence");
    }
  }

  function contactForMember(member: RoomMemberWire): AgentContact | undefined {
    return contacts.find((contact) => contact.did === member.did);
  }

  function updateMemberPolicy(
    member: RoomMemberWire,
    patch: Partial<Pick<AgentContact, "blocked" | "muted">>,
  ): void {
    const existing = contactForMember(member);
    const next: AgentContact = existing ?? {
      id: member.did,
      did: member.did,
      name: memberLabel(member, localDid, ownerHandle),
      endpoint: member.endpoint ?? "",
      connectedAt: new Date().toISOString(),
      kind: "community",
      source: "room",
    };
    const updated = { ...next, ...patch, endpoint: member.endpoint ?? next.endpoint };
    const list = [...contacts.filter((contact) => contact.did !== member.did), updated];
    saveContacts(list);
    onContactsChange?.(list);
    setMemberMenuDid(null);
    onActivity?.(patch.blocked ? "Member blocked" : patch.muted ? "Member muted" : "Member policy updated");
  }

  async function connectPrivately(member: RoomMemberWire): Promise<void> {
    if (!member.endpoint?.trim()) {
      setStatus("This member has not shared an agent address.");
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      await client.connectPeer(member.endpoint.trim(), member.did);
      const existing = contactForMember(member);
      const contact: AgentContact = existing ?? {
        id: member.did,
        did: member.did,
        name: memberLabel(member, localDid, ownerHandle),
        endpoint: member.endpoint.trim(),
        connectedAt: new Date().toISOString(),
        kind: "community",
        source: "room",
      };
      const list = [...contacts.filter((row) => row.did !== member.did), contact];
      saveContacts(list);
      onContactsChange?.(list);
      setMemberMenuDid(null);
      onActivity?.(`Connected with ${memberLabel(member, localDid, ownerHandle)}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <aside
      className={`panel-view rooms-view${selectedId ? " rooms-has-selection" : ""}${mobileListOpen ? " rooms-list-open" : ""}`}
    >
      {status ? (
        <div className="comms-status-error">
          <p>{status}</p>
          {onRequestReconnect ? (
            <button type="button" className="panel-btn" onClick={onRequestReconnect}>
              Reconnect agent
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="panel-body panel-master-detail comms-main">
        <nav className="panel-list comms-sidebar" aria-label="Rooms">
          <div className="panel-list-head panel-list-head--compact">
            <span className="panel-list-head-title">Rooms</span>
            <div className="rooms-list-head-actions">
              <button
                type="button"
                className="panel-btn panel-btn-sm"
                disabled={loading || !createEnabled}
                title={createEnabled ? "Create a room" : "Room creation is disabled"}
                onClick={() => setCreateOpen((open) => !open)}
              >
                Create
              </button>
              <button
                type="button"
                className="panel-btn panel-btn-sm"
                disabled={loading}
                onClick={() => void refreshRooms()}
              >
                Refresh
              </button>
            </div>
          </div>
          {createOpen ? (
            <form
              className="rooms-create-form"
              onSubmit={(event) => {
                event.preventDefault();
                void submitCreateRoom();
              }}
            >
              <label className="rooms-create-field">
                <span>Title</span>
                <input
                  className="panel-input"
                  value={createForm.name}
                  onChange={(event) => setCreateForm((f) => ({ ...f, name: event.target.value }))}
                  required
                  maxLength={80}
                />
              </label>
              <label className="rooms-create-field">
                <span>Category</span>
                <input
                  className="panel-input"
                  list="rooms-category-options"
                  value={createForm.category}
                  onChange={(event) => setCreateForm((f) => ({ ...f, category: event.target.value }))}
                  required
                />
                <datalist id="rooms-category-options">
                  {categoryOptions.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              </label>
              <label className="rooms-create-field">
                <span>Description</span>
                <textarea
                  className="panel-input"
                  rows={2}
                  value={createForm.description}
                  onChange={(event) =>
                    setCreateForm((f) => ({ ...f, description: event.target.value }))
                  }
                />
              </label>
              <label className="rooms-create-field">
                <span>Visibility</span>
                <select
                  className="panel-select"
                  value={createForm.admission}
                  onChange={(event) =>
                    setCreateForm((f) => ({
                      ...f,
                      admission: event.target.value as "open" | "invite" | "request",
                    }))
                  }
                >
                  <option value="open">Public (open join)</option>
                  <option value="request">Private (request to join)</option>
                  <option value="invite">Private (invite only)</option>
                </select>
              </label>
              <label className="rooms-create-field">
                <span>Host rules (optional)</span>
                <textarea
                  className="panel-input"
                  rows={3}
                  placeholder="One rule per line"
                  value={createForm.hostRules}
                  onChange={(event) => setCreateForm((f) => ({ ...f, hostRules: event.target.value }))}
                />
              </label>
              <label className="rooms-create-check">
                <input
                  type="checkbox"
                  checked={createForm.acceptedBaseRules}
                  onChange={(event) =>
                    setCreateForm((f) => ({ ...f, acceptedBaseRules: event.target.checked }))
                  }
                />
                <span>
                  I accept the{" "}
                  <a href={ATOM_BASE_ROOM_POLICY_URL} target="_blank" rel="noreferrer">
                    Atom community rules
                  </a>
                </span>
              </label>
              <div className="rooms-create-actions">
                <button type="submit" className="panel-btn panel-btn-primary" disabled={loading}>
                  Create room
                </button>
                <button
                  type="button"
                  className="panel-btn"
                  onClick={() => setCreateOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : null}
          <ul className="panel-list-scroll comms-contact-list">
            {roomsByCategory.length === 0 ? (
              <li className="panel-empty-state panel-empty-state--compact rooms-empty-list">
                <strong>No rooms yet</strong>
                <p>Browse town venues, or create a room when signed in.</p>
                <div className="rooms-empty-actions">
                  <button
                    type="button"
                    className="panel-btn panel-btn-primary"
                    disabled={loading}
                    onClick={() => void joinCoffeeShop()}
                  >
                    Join Coffee Shop
                  </button>
                  {onOpenDiscover ? (
                    <button type="button" className="panel-btn" onClick={onOpenDiscover}>
                      Address book
                    </button>
                  ) : null}
                </div>
              </li>
            ) : (
              roomsByCategory.map(([category, rooms]) => (
                <li key={category} className="rooms-category-group">
                  <details open>
                    <summary className="rooms-category-summary">{category}</summary>
                    <ul className="rooms-category-list">
                      {rooms.map((room) => {
                        const isJoined = joinedIds.has(room.roomId);
                        return (
                          <li key={room.roomId}>
                            <button
                              type="button"
                              className={`panel-row panel-row--elevated rooms-room-row${selectedId === room.roomId ? " is-selected" : ""}`}
                              onClick={() => {
                                setSelectedId(room.roomId);
                                setMobileListOpen(false);
                                setMobilePane("chat");
                              }}
                            >
                              <span className="panel-avatar rooms-room-avatar" aria-hidden="true">
                                {room.name.slice(0, 1).toUpperCase()}
                              </span>
                              <span className="panel-row-body">
                                <span className="panel-row-title">{room.name}</span>
                                <span className="panel-row-meta">
                                  {isJoined
                                    ? "Joined"
                                    : room.admission === "request"
                                      ? "Request"
                                      : room.admission === "invite"
                                        ? "Invite"
                                        : "Open"}
                                  {room.description?.trim()
                                    ? ` · ${room.description.trim().slice(0, 48)}`
                                    : room.topic?.trim()
                                      ? ` · ${room.topic.trim().slice(0, 48)}`
                                      : ""}
                                </span>
                              </span>
                            </button>
                            {!isJoined ? (
                              <button
                                type="button"
                                className="panel-btn panel-btn-sm rooms-join-inline"
                                disabled={loading || room.admission === "invite"}
                                title={
                                  room.admission === "invite"
                                    ? "Invite required"
                                    : room.admission === "request"
                                      ? "Request to join"
                                      : "Join"
                                }
                                onClick={() => void joinCatalogRoom(room)}
                              >
                                {room.admission === "request" ? "Request" : "Join"}
                              </button>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                </li>
              ))
            )}
          </ul>
        </nav>
        <section className="panel-detail rooms-detail">
          {selected ? (
            <>
              <header className="panel-detail-head rooms-chat-head">
                <div className="rooms-mobile-head-start">
                  <button
                    type="button"
                    className="rooms-mobile-back panel-btn panel-btn-icon"
                    aria-label="Back to room list"
                    title="Rooms"
                    onClick={() => setMobileListOpen(true)}
                  >
                    ←
                  </button>
                  <div className="panel-detail-identity comms-peer-identity">
                    <strong className="panel-detail-title comms-peer-name">{selected.name}</strong>
                    <span className="panel-detail-subtitle comms-peer-status">
                      {members.length > 0 ? `${members.length} here · ` : ""}
                      {selected.topic ?? selected.roomId}
                    </span>
                  </div>
                </div>
                <div className="rooms-head-actions">
                  <button
                    type="button"
                    className={`panel-btn rooms-members-toggle${mobilePane === "members" ? " is-active" : ""}`}
                    aria-pressed={mobilePane === "members"}
                    aria-label={
                      mobilePane === "members"
                        ? "Back to chat"
                        : `Members, ${members.length}`
                    }
                    title={mobilePane === "members" ? "Chat" : `Members (${members.length})`}
                    onClick={() =>
                      setMobilePane((pane) => (pane === "chat" ? "members" : "chat"))
                    }
                  >
                    {mobilePane === "members" ? "Chat" : `Members (${members.length})`}
                  </button>
                  <label className="rooms-attendance">
                    <span className="rooms-attendance-label">Show as</span>
                    <select
                      className="panel-select"
                      value={attendance}
                      onChange={(event) => setAttendanceMode(event.target.value as RoomAttendanceMode)}
                      aria-label="Room attendance"
                    >
                      <option value="present">Present</option>
                      <option value="away">Away</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className="panel-btn panel-btn-icon"
                    aria-label="Refresh rooms"
                    title="Refresh rooms"
                    disabled={loading}
                    onClick={() => void refreshRooms()}
                  >
                    <IconRefresh />
                  </button>
                  {!canLeave && selected.admission !== "invite" ? (
                    <button
                      type="button"
                      className="panel-btn panel-btn-primary panel-btn-sm"
                      disabled={loading}
                      onClick={() => void joinCatalogRoom(selected)}
                    >
                      {selected.admission === "request" ? "Request to join" : "Join"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="panel-btn panel-btn-sm"
                    onClick={() => setRoomReportOpen((open) => !open)}
                  >
                    {roomReportOpen ? "Cancel report" : "Report"}
                  </button>
                  {canLeave ? (
                    <button
                      type="button"
                      className="panel-btn panel-btn-icon panel-btn-danger"
                      aria-label="Leave room"
                      title="Leave room"
                      disabled={loading}
                      onClick={() => void leaveSelectedRoom()}
                    >
                      <IconLeave />
                    </button>
                  ) : null}
                </div>
              </header>
              {roomReportOpen ? (
                <div className="rooms-room-report">
                  <ContactAbuseReportForm
                    target={{
                      did: selected.hostDid || selected.roomId,
                      name: selected.name,
                      roomId: selected.roomId,
                      endpoint: selected.hostUrl,
                    }}
                    hideAlsoBlock
                    onReported={(note) => {
                      setStatus(note);
                      setRoomReportOpen(false);
                      onActivity?.(note);
                    }}
                    onCancel={() => setRoomReportOpen(false)}
                  />
                </div>
              ) : null}
              {pendingJoinRequests.length > 0 ? (
                <div className="rooms-pending-requests" aria-label="Pending join requests">
                  <strong>Pending join requests</strong>
                  <ul>
                    {pendingJoinRequests.map((request) => (
                      <li key={request.id}>
                        <span>{request.memberName || request.memberDid.slice(0, 18)}</span>
                        <button
                          type="button"
                          className="panel-btn panel-btn-sm panel-btn-primary"
                          disabled={loading}
                          onClick={() => {
                            void (async () => {
                              setLoading(true);
                              try {
                                await decideRoomJoinRequest(selected.roomId, request.id, "approved");
                                setPendingJoinRequests((rows) =>
                                  rows.filter((row) => row.id !== request.id),
                                );
                                onActivity?.("Approved join request");
                              } catch (error) {
                                setStatus(error instanceof Error ? error.message : String(error));
                              } finally {
                                setLoading(false);
                              }
                            })();
                          }}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="panel-btn panel-btn-sm"
                          disabled={loading}
                          onClick={() => {
                            void (async () => {
                              setLoading(true);
                              try {
                                await decideRoomJoinRequest(selected.roomId, request.id, "denied");
                                setPendingJoinRequests((rows) =>
                                  rows.filter((row) => row.id !== request.id),
                                );
                                onActivity?.("Denied join request");
                              } catch (error) {
                                setStatus(error instanceof Error ? error.message : String(error));
                              } finally {
                                setLoading(false);
                              }
                            })();
                          }}
                        >
                          Deny
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className={`rooms-thread-grid rooms-pane-${mobilePane}`}>
                {mobilePane === "members" ? (
                  <button
                    type="button"
                    className="rooms-members-backdrop"
                    aria-label="Close members"
                    onClick={() => setMobilePane("chat")}
                  />
                ) : null}
                <aside className="rooms-members" aria-label="Room members">
                  <div className="rooms-members-head">
                    <span>Members</span>
                    <button
                      type="button"
                      className="panel-btn panel-btn-ghost"
                      onClick={() => setMobilePane("chat")}
                    >
                      Close
                    </button>
                  </div>
                  <ul className="rooms-members-list">
                    {members.length === 0 ? (
                      <li className="panel-empty">No members loaded</li>
                    ) : (
                      members.map((member) => {
                        const contact = contactForMember(member);
                        const isSelf = member.did === localDid;
                        return (
                          <li key={member.did} className="rooms-member-row">
                            <button
                              type="button"
                              className="rooms-member-trigger"
                              onClick={() =>
                                setMemberMenuDid((current) => (current === member.did ? null : member.did))
                              }
                            >
                              <span className="rooms-member-name">
                                {memberLabel(member, localDid, ownerHandle)}
                                {isSelf ? " (you)" : ""}
                              </span>
                              {contact?.blocked ? (
                                <span className="rooms-member-badge">Blocked</span>
                              ) : contact?.muted ? (
                                <span className="rooms-member-badge">Muted</span>
                              ) : null}
                            </button>
                            {memberMenuDid === member.did && !isSelf ? (
                              <div className="rooms-member-menu">
                                <button
                                  type="button"
                                  className="panel-btn"
                                  disabled={loading || !member.endpoint}
                                  onClick={() => void connectPrivately(member)}
                                >
                                  Connect privately
                                </button>
                                <button
                                  type="button"
                                  className="panel-btn"
                                  disabled={loading || !member.endpoint || !!contact}
                                  onClick={() => void sendFriendRequest(member)}
                                >
                                  {contact ? "Already a contact" : "Send friend request"}
                                </button>
                                <button
                                  type="button"
                                  className="panel-btn"
                                  onClick={() => updateMemberPolicy(member, { muted: !contact?.muted })}
                                >
                                  {contact?.muted ? "Unmute" : "Mute"}
                                </button>
                                <button
                                  type="button"
                                  className="panel-btn"
                                  onClick={() => updateMemberPolicy(member, { blocked: !contact?.blocked })}
                                >
                                  {contact?.blocked ? "Unblock" : "Block"}
                                </button>
                                <button
                                  type="button"
                                  className="panel-btn panel-btn-ghost"
                                  onClick={() =>
                                    setMemberReportDid((current) =>
                                      current === member.did ? null : member.did,
                                    )
                                  }
                                >
                                  {memberReportDid === member.did ? "Cancel report" : "Report"}
                                </button>
                                {memberReportDid === member.did ? (
                                  <ContactAbuseReportForm
                                    target={{
                                      did: member.did,
                                      endpoint: member.endpoint ?? contact?.endpoint,
                                      handle: contact?.handle,
                                      name: memberLabel(member, localDid, ownerHandle),
                                      roomId: selectedId ?? undefined,
                                    }}
                                    onReported={(note, alsoBlock) => {
                                      setStatus(note);
                                      setMemberReportDid(null);
                                      setMemberMenuDid(null);
                                      if (alsoBlock && !contact?.blocked) {
                                        updateMemberPolicy(member, { blocked: true });
                                      }
                                      onActivity?.(note);
                                    }}
                                    onCancel={() => setMemberReportDid(null)}
                                  />
                                ) : null}
                              </div>
                            ) : null}
                          </li>
                        );
                      })
                    )}
                  </ul>
                </aside>

                <div className="rooms-chat-layout">
                  {friendRequests.length > 0 ? (
                    <div className="friend-request-banners" aria-label="Friend requests">
                      {friendRequests.map((request) => (
                        <div key={request.id} className="friend-request-banner">
                          <span>
                            <strong>{request.fromName}</strong> sent you a friend request
                          </span>
                          <div className="friend-request-banner-actions">
                            <button
                              type="button"
                              className="panel-btn panel-btn-primary"
                              disabled={loading}
                              onClick={() => void acceptFriendRequest(request)}
                            >
                              Accept
                            </button>
                            <button
                              type="button"
                              className="panel-btn"
                              onClick={() => declineFriendRequest(request)}
                            >
                              Decline
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="comms-messages rooms-messages">
                    {visibleMessages.length === 0 ? (
                      <div className="comms-empty-thread">
                        <strong>No messages yet</strong>
                        <p>Say hello — everyone in the room can see chat.</p>
                      </div>
                    ) : (
                      visibleMessages.map((msg) => {
                          const isOwn = msg.senderDid === localDid;
                          const gif = msg.payload?.gif as RoomGifPayload | undefined;
                          return (
                            <div
                              key={msg.seq}
                              className={`shell-comms-msg shell-comms-msg-in rooms-msg${isOwn ? " is-own" : ""}`}
                            >
                              <div className="shell-comms-msg-text">
                                <strong>
                                  {formatRoomSenderLabel(msg.senderDid, members, localDid, ownerHandle)}
                                </strong>
                                {msg.editedAt && !msg.deleted ? (
                                  <span className="rooms-msg-edited">(edited)</span>
                                ) : null}
                                {msg.kind === "activity" ? (
                                  <span> · {formatRoomActivity(msg.activityKind)}</span>
                                ) : msg.deleted ? (
                                  <p className="rooms-msg-deleted">Message deleted</p>
                                ) : (
                                  <>
                                    {msg.text ? <p>{msg.text}</p> : null}
                                    {gif?.url ? (
                                      <img
                                        className="rooms-msg-gif"
                                        src={gif.url}
                                        alt={gif.title || "GIF"}
                                        loading="lazy"
                                      />
                                    ) : null}
                                  </>
                                )}
                                {isOwn && msg.kind === "message" && !msg.deleted ? (
                                  <div className="rooms-msg-actions" aria-label="Message actions">
                                    <button type="button" onClick={() => beginEdit(msg)}>
                                      Edit
                                    </button>
                                    <button type="button" onClick={() => void deleteOwnMessage(msg.seq)}>
                                      Delete
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                              <time dateTime={msg.at}>{new Date(msg.at).toLocaleTimeString()}</time>
                            </div>
                          );
                        })
                    )}
                  </div>
                  <footer className="comms-compose rooms-compose">
                    {editingSeq != null ? (
                      <div className="rooms-compose-edit-bar">
                        <span>Editing message</span>
                        <button
                          type="button"
                          className="panel-btn panel-btn-ghost"
                          onClick={() => {
                            setEditingSeq(null);
                            setCompose("");
                            setPendingGif(null);
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : null}
                    {pendingGif ? (
                      <div className="rooms-compose-gif-preview">
                        <img src={pendingGif.previewUrl} alt={pendingGif.title} />
                        <button type="button" className="panel-btn panel-btn-ghost" onClick={() => setPendingGif(null)}>
                          Remove GIF
                        </button>
                      </div>
                    ) : null}
                    <ComposeExtras
                      disabled={loading}
                      enableGif
                      onInsertEmoji={(emoji) => {
                        const { next, caret } = insertAtCursor(compose, emoji, composeRef.current);
                        setCompose(next);
                        requestAnimationFrame(() => {
                          const el = composeRef.current;
                          if (!el) return;
                          el.focus();
                          el.setSelectionRange(caret, caret);
                        });
                      }}
                      onPickGif={(gif) => setPendingGif(gif)}
                    />
                    <textarea
                      ref={composeRef}
                      className="panel-textarea rooms-compose-input"
                      name="atom-room-compose"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={true}
                      value={compose}
                      onChange={(event) => setCompose(event.target.value)}
                      placeholder={editingSeq != null ? "Edit your message…" : "Message the room…"}
                      rows={1}
                      aria-label="Room message"
                      onKeyDown={(event) => {
                        // Enter inserts a newline. Ctrl/Cmd+Enter sends.
                        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                          event.preventDefault();
                          void sendMessage(compose, pendingGif);
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="panel-btn panel-btn-primary rooms-compose-send"
                      disabled={loading || (!compose.trim() && !pendingGif)}
                      onClick={() => void sendMessage(compose, pendingGif)}
                    >
                      {editingSeq != null ? "Save" : "Send"}
                    </button>
                  </footer>
                </div>
              </div>

              {selected.moduleId ? (
                <details
                  className="rooms-scene-details"
                  onToggle={(event) => setSceneOpen((event.currentTarget as HTMLDetailsElement).open)}
                >
                  <summary>Room activities</summary>
                  <p className="rooms-scene-note">
                    Optional interactive scene for this room (presence avatars, pretend coffee orders). Chat
                    works without opening this.
                  </p>
                  {sceneOpen ? (
                    <iframe
                      ref={moduleFrameRef}
                      className="rooms-module-frame"
                      title={`${selected.name} activities`}
                      src={moduleBundleUrl(selected.moduleId)}
                      sandbox={MODULE_IFRAME_SANDBOX}
                      onLoad={() => pushModuleInit()}
                    />
                  ) : null}
                </details>
              ) : null}
            </>
          ) : (
            <div className="panel-empty-state comms-no-selection rooms-empty-detail">
              <p className="panel-surface-eyebrow">Rooms</p>
              <strong>Pick a room to chat</strong>
              <p>Group spaces where people and agents hang out. Your personal agent stays in Chat.</p>
              <div className="rooms-empty-actions">
                {!hasJoinedCoffeeShop ? (
                  <button
                    type="button"
                    className="panel-btn panel-btn-primary"
                    disabled={loading}
                    onClick={() => void joinCoffeeShop()}
                  >
                    Join Coffee Shop
                  </button>
                ) : null}
                {onOpenDiscover ? (
                  <button type="button" className="panel-btn" onClick={onOpenDiscover}>
                    Address book
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}
