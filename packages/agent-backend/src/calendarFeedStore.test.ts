import { describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { generateAgentKeyPair } from "@qwixl/protocol";
import { createSchedulingProposal, createSchedulingResponse } from "@qwixl/a2a-transport";
import { CalendarFeedStore } from "./calendarFeedStore.js";
import type { InboxEntry } from "./inbox.js";

const SLOTS = [
  {
    id: "tue-10",
    label: "Tue 8 Jul · 10:00–10:30",
    start: "2026-07-08T10:00:00.000Z",
    end: "2026-07-08T10:30:00.000Z",
  },
];

describe("CalendarFeedStore", () => {
  it("records accepted meetings from proposal + response inbox objects", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "atom-cal-feed-"));
    const store = new CalendarFeedStore(path.join(dir, "calendar-feed.json"));
    const organizer = await generateAgentKeyPair();
    const invitee = await generateAgentKeyPair();

    const proposal = await createSchedulingProposal({
      identity: organizer,
      payload: { title: "Team standup", slots: SLOTS },
    });
    store.ingestInboxObject(proposal);

    const response = await createSchedulingResponse({
      identity: invitee,
      payload: {
        proposalId: proposal.id,
        response: "accept",
        slotId: "tue-10",
      },
    });
    store.ingestInboxObject(response);

    expect(store.acceptedCount()).toBe(1);
    const ics = store.buildFeedIcs();
    expect(ics).toContain("SUMMARY:Team standup");
    expect(ics).toContain(`UID:${proposal.id}-tue-10`);
  });

  it("records outbound accepts with explicit slot details", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "atom-cal-feed-"));
    const store = new CalendarFeedStore(path.join(dir, "calendar-feed.json"));

    const added = store.recordAcceptedMeeting({
      proposalId: "proposal-1",
      slotId: "slot-a",
      title: "Design review",
      start: "2026-07-10T15:00:00.000Z",
      end: "2026-07-10T16:00:00.000Z",
    });

    expect(added).toBe(true);
    expect(store.acceptedCount()).toBe(1);
    expect(store.buildFeedIcs()).toContain("SUMMARY:Design review");
  });

  it("persists token and accepted meetings across reload", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "atom-cal-feed-"));
    const filePath = path.join(dir, "calendar-feed.json");
    const store = new CalendarFeedStore(filePath);
    const token = store.getToken();
    store.recordAcceptedMeeting({
      proposalId: "p1",
      slotId: "s1",
      title: "Persisted",
      start: "2026-07-11T09:00:00.000Z",
      end: "2026-07-11T10:00:00.000Z",
    });
    await store.flush();

    const reloaded = new CalendarFeedStore(filePath);
    await reloaded.load();
    expect(reloaded.getToken()).toBe(token);
    expect(reloaded.acceptedCount()).toBe(1);
    expect(reloaded.verifyToken(token)).toBe(true);
    expect(reloaded.verifyToken("wrong-token")).toBe(false);
  });

  it("syncFromInbox ingests coordination entries once", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "atom-cal-feed-"));
    const store = new CalendarFeedStore(path.join(dir, "calendar-feed.json"));
    const organizer = await generateAgentKeyPair();
    const invitee = await generateAgentKeyPair();

    const proposal = await createSchedulingProposal({
      identity: organizer,
      payload: { title: "Weekly sync", slots: SLOTS },
    });
    const response = await createSchedulingResponse({
      identity: invitee,
      payload: {
        proposalId: proposal.id,
        response: "accept",
        slotId: "tue-10",
      },
    });

    const entries: InboxEntry[] = [
      { object: proposal, receivedAt: new Date().toISOString(), messageId: "msg-1" },
      { object: response, receivedAt: new Date().toISOString(), messageId: "msg-2" },
    ];

    expect(store.syncFromInbox(entries)).toBe(1);
    expect(store.syncFromInbox(entries)).toBe(0);
  });
});
