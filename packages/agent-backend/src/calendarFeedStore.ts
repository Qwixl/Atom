import { randomBytes } from "node:crypto";
import type { SchedulingSlot } from "@qwixl/a2a-transport";
import {
  COORDINATION_PROPOSAL_PURPOSE,
  COORDINATION_RESPONSE_PURPOSE,
  type SchedulingResponseKind,
} from "@qwixl/a2a-transport";
import type { DataObject } from "@qwixl/protocol";
import { AGENT_STORE_REGISTRY } from "./storeContracts.js";
import { resolveDataPath } from "./dataDir.js";
import { createJsonStoreWriter, loadJsonStore } from "./persistedJsonStore.js";
import { buildIcsCalendar, type IcalEventInput } from "./icalFeed.js";
import type { InboxEntry } from "./inbox.js";

export interface StoredSchedulingProposal {
  id: string;
  title: string;
  slots: SchedulingSlot[];
  recordedAt: string;
}

export interface AcceptedMeeting {
  uid: string;
  title: string;
  start: string;
  end: string;
  recordedAt: string;
}

const CALENDAR_FEED_FILE = "calendar-feed.json";
const SCHEMA_VERSION = 1;
const MAX_PROPOSALS = 200;
const MAX_ACCEPTED = 500;

interface CalendarFeedFile {
  schemaVersion: number;
  feedToken: string;
  proposals: StoredSchedulingProposal[];
  accepted: AcceptedMeeting[];
}

function parseSlots(raw: unknown): SchedulingSlot[] {
  if (!Array.isArray(raw)) return [];
  const slots: SchedulingSlot[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const slot = item as SchedulingSlot;
    if (
      typeof slot.id === "string" &&
      typeof slot.label === "string" &&
      typeof slot.start === "string" &&
      typeof slot.end === "string"
    ) {
      slots.push(slot);
    }
  }
  return slots;
}

function newFeedToken(): string {
  return randomBytes(24).toString("base64url");
}

export class CalendarFeedStore {
  static readonly storeMeta = AGENT_STORE_REGISTRY.calendarFeed;

  private feedToken = newFeedToken();
  private readonly proposals: StoredSchedulingProposal[] = [];
  private readonly accepted: AcceptedMeeting[] = [];
  private readonly filePath: string;
  private readonly writer: ReturnType<typeof createJsonStoreWriter<CalendarFeedFile>>;

  constructor(filePath = resolveDataPath(CALENDAR_FEED_FILE)) {
    this.filePath = filePath;
    this.writer = createJsonStoreWriter<CalendarFeedFile>(
      this.filePath,
      SCHEMA_VERSION,
      "calendarFeed",
      () => ({
        feedToken: this.feedToken,
        proposals: this.proposals.slice(-MAX_PROPOSALS),
        accepted: this.accepted.slice(-MAX_ACCEPTED),
      }),
    );
  }

  async load(): Promise<void> {
    await loadJsonStore<CalendarFeedFile>(this.filePath, (file) => {
      this.proposals.length = 0;
      this.accepted.length = 0;
      this.feedToken = file?.feedToken?.trim() || newFeedToken();
      for (const proposal of file?.proposals ?? []) {
        if (proposal?.id && proposal.title && Array.isArray(proposal.slots)) {
          this.proposals.push(proposal);
        }
      }
      for (const meeting of file?.accepted ?? []) {
        if (meeting?.uid && meeting.title && meeting.start && meeting.end) {
          this.accepted.push(meeting);
        }
      }
    });
  }

  verifyToken(token: string | undefined): boolean {
    return Boolean(token?.trim() && token.trim() === this.feedToken);
  }

  feedTokenHint(): string {
    return `${this.feedToken.slice(0, 6)}…`;
  }

  rotateToken(): string {
    this.feedToken = newFeedToken();
    this.writer.persist();
    return this.feedToken;
  }

  getToken(): string {
    return this.feedToken;
  }

  acceptedCount(): number {
    return this.accepted.length;
  }

  recordProposal(proposal: StoredSchedulingProposal): void {
    const index = this.proposals.findIndex((entry) => entry.id === proposal.id);
    if (index >= 0) this.proposals.splice(index, 1);
    this.proposals.push(proposal);
    if (this.proposals.length > MAX_PROPOSALS) {
      this.proposals.splice(0, this.proposals.length - MAX_PROPOSALS);
    }
    this.writer.persist();
  }

  recordAcceptedMeeting(opts: {
    proposalId: string;
    slotId: string;
    title?: string;
    start?: string;
    end?: string;
  }): boolean {
    const uid = `${opts.proposalId}-${opts.slotId}`;
    if (this.accepted.some((entry) => entry.uid === uid)) return false;

    let title = opts.title?.trim();
    let start = opts.start?.trim();
    let end = opts.end?.trim();

    if (!title || !start || !end) {
      const proposal = this.proposals.find((entry) => entry.id === opts.proposalId);
      const slot = proposal?.slots.find((entry) => entry.id === opts.slotId);
      if (!slot) return false;
      title = title || proposal?.title || "Meeting";
      start = start || slot.start;
      end = end || slot.end;
    }

    if (!title || !start || !end) return false;

    this.accepted.push({
      uid,
      title,
      start,
      end,
      recordedAt: new Date().toISOString(),
    });
    if (this.accepted.length > MAX_ACCEPTED) {
      this.accepted.splice(0, this.accepted.length - MAX_ACCEPTED);
    }
    this.writer.persist();
    return true;
  }

  ingestInboxObject(object: DataObject): void {
    const purpose = object.governance.purpose;
    const payload = object.payload;

    if (purpose === COORDINATION_PROPOSAL_PURPOSE) {
      const title = typeof payload.title === "string" ? payload.title : "";
      const slots = parseSlots(payload.slots);
      if (!title || slots.length === 0) return;
      this.recordProposal({
        id: object.id,
        title,
        slots,
        recordedAt: new Date().toISOString(),
      });
      return;
    }

    if (purpose === COORDINATION_RESPONSE_PURPOSE) {
      const response = payload.response as SchedulingResponseKind;
      if (response !== "accept") return;
      const proposalId = typeof payload.proposalId === "string" ? payload.proposalId : "";
      const slotId = typeof payload.slotId === "string" ? payload.slotId : "";
      if (!proposalId || !slotId) return;
      this.recordAcceptedMeeting({ proposalId, slotId });
    }
  }

  syncFromInbox(entries: InboxEntry[]): number {
    let added = 0;
    for (const entry of entries) {
      const before = this.accepted.length;
      this.ingestInboxObject(entry.object);
      if (this.accepted.length > before) added += 1;
    }
    return added;
  }

  toIcsEvents(): IcalEventInput[] {
    return this.accepted.map((meeting) => ({
      uid: meeting.uid,
      summary: meeting.title,
      description: "Scheduled via Atom",
      start: meeting.start,
      end: meeting.end,
    }));
  }

  buildFeedIcs(): string {
    return buildIcsCalendar(this.toIcsEvents());
  }

  async flush(): Promise<void> {
    await this.writer.flush();
  }
}
