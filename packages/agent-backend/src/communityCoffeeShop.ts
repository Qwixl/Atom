import type { AgentKeyPair } from "@qwixl/protocol";
import { BUSINESS_BRAND_CATEGORY } from "@qwixl/owner-store";
import type { BusinessContextStore } from "./businessContextStore.js";
import type { BusinessKnowledgeBackend } from "./businessKnowledgeBackend.js";
import type { MlsSessionStore } from "./mlsSessions.js";
import type { RoomStore } from "./roomStore.js";

export const COFFEE_SHOP_ROOM_ID = "room:coffeeshop";

const COFFEE_SHOP_BRAND: Array<{
  category: typeof BUSINESS_BRAND_CATEGORY;
  label: string;
  value: string;
}> = [
  {
    category: BUSINESS_BRAND_CATEGORY,
    label: "Greeter role",
    value:
      "You welcome people into the Qwixl Coffee Shop — a relaxed community room for chat, pretend coffee orders, and meeting other Atom users.",
  },
  {
    category: BUSINESS_BRAND_CATEGORY,
    label: "Tone",
    value: "Warm, concise, and inclusive. Light humor is fine; never salesy or corporate.",
  },
  {
    category: BUSINESS_BRAND_CATEGORY,
    label: "Values",
    value: "Privacy-respecting, agent-mediated, community-first. Help people connect without oversharing.",
  },
];

const COFFEE_SHOP_KNOWLEDGE: Array<{
  id: string;
  title: string;
  category: "policy" | "faq";
  body: string;
}> = [
  {
    id: "house-rules",
    title: "House rules",
    category: "policy",
    body: "Be kind. No spam, harassment, or unsolicited pitches. Respect that messages are agent-mediated.",
  },
  {
    id: "moderation",
    title: "Moderation",
    category: "policy",
    body: "The host may evict or ban for rule breaks with a disclosed reason code. Play-money orders only in v1.",
  },
];

/** Seed Coffee Shop greeter brand voice (idempotent). */
export async function seedCoffeeShopBrand(context: BusinessContextStore): Promise<{ seeded: boolean }> {
  const existing = context.list(BUSINESS_BRAND_CATEGORY);
  if (existing.length > 0) {
    return { seeded: false };
  }
  context.replaceAll(COFFEE_SHOP_BRAND);
  return { seeded: true };
}

/** Seed Coffee Shop policies and reference docs for RAG (idempotent). */
export async function seedCoffeeShopKnowledge(
  knowledge: BusinessKnowledgeBackend,
): Promise<{ seeded: boolean }> {
  if (knowledge.list().length > 0) {
    return { seeded: false };
  }
  for (const doc of COFFEE_SHOP_KNOWLEDGE) {
    knowledge.upsert(doc);
  }
  return { seeded: true };
}

/** Seed the Qwixl Coffee Shop room on a community host agent (idempotent). */
export async function seedCoffeeShopRoom(opts: {
  identity: AgentKeyPair;
  mlsStore: MlsSessionStore;
  rooms: RoomStore;
}): Promise<{ roomId: string; created: boolean }> {
  const existing = opts.rooms.getRoom(COFFEE_SHOP_ROOM_ID);
  if (existing) {
    if (!opts.mlsStore.hasRoomSession(COFFEE_SHOP_ROOM_ID)) {
      await opts.mlsStore.createRoomHost({
        localDid: opts.identity.did,
        roomId: COFFEE_SHOP_ROOM_ID,
      });
    }
    return { roomId: COFFEE_SHOP_ROOM_ID, created: false };
  }
  const descriptor = opts.rooms.createRoom({
    hostDid: opts.identity.did,
    name: "Qwixl Coffee Shop",
    topic: "Community hangout — chat, order pretend coffee, meet people",
    admission: "open",
    moduleId: "community/coffee-shop",
    policyUrl: "https://qwixl.dev/community/aup",
    roomId: COFFEE_SHOP_ROOM_ID,
    maxMembers: 128,
  });
  await opts.mlsStore.createRoomHost({
    localDid: opts.identity.did,
    roomId: descriptor.roomId,
  });
  return { roomId: descriptor.roomId, created: true };
}
