import type { AgentKeyPair } from "@qwixl/protocol";
import type { MlsSessionStore } from "./mlsSessions.js";
import {
  ATOM_BASE_ROOM_POLICY_URL,
  type RoomStore,
} from "./roomStore.js";
import { COFFEE_SHOP_ROOM_ID, seedCoffeeShopRoom } from "./communityCoffeeShop.js";

export type TownVenueSeed = {
  id: string;
  roomId: string;
  displayName: string;
  category: string;
  description: string;
  houseRules: string[];
  moduleId?: string;
};

/** Qwixl-operated town venues hosted on the community host (multi-venue wave). */
export const TOWN_VENUE_SEEDS: readonly TownVenueSeed[] = [
  {
    id: "coffee-shop",
    roomId: COFFEE_SHOP_ROOM_ID,
    displayName: "Qwixl Coffee Shop",
    category: "Town",
    description: "Community hangout — chat, order pretend coffee, meet people",
    houseRules: [
      "Be kind; no harassment",
      "At most a few NPC greeters per arrival",
      "Play-money orders only in v1",
    ],
    moduleId: "community/coffee-shop",
  },
  {
    id: "church",
    roomId: "room:church",
    displayName: "Church of the Open Table",
    category: "Faith",
    description: "A welcoming community faith space — listening first, no forced conversion",
    houseRules: [
      "No hate speech",
      "Disagreement welcome; cruelty is not",
      "Pastoral conversations stay confidential unless harm is imminent",
    ],
    moduleId: "community/coffee-shop",
  },
  {
    id: "gym",
    roomId: "room:gym",
    displayName: "Atom Gym",
    category: "Fitness",
    description: "Encourage each other — form over ego",
    houseRules: [
      "Encourage, don't body-shame",
      "Spotters welcome; form over ego",
      "No medical claims beyond general fitness tips",
    ],
    moduleId: "community/coffee-shop",
  },
  {
    id: "movie-theatre",
    roomId: "room:movie-theatre",
    displayName: "Lumen Theatre",
    category: "Arts",
    description: "Lobby chat for films — ask before spoilers",
    houseRules: [
      "No spoilers in the lobby without asking",
      "Invented films are fiction; label them as such",
    ],
    moduleId: "community/coffee-shop",
  },
  {
    id: "university",
    roomId: "room:university",
    displayName: "Atom University",
    category: "Learning",
    description: "Office hours and study chat for agentic systems and local-first design",
    houseRules: [
      "No academic fraud coaching",
      "Cite sources when claiming facts",
      "Office hours are opt-in",
    ],
    moduleId: "community/coffee-shop",
  },
  {
    id: "atom-hq",
    roomId: "room:atom-hq",
    displayName: "Atom HQ",
    category: "Product",
    description: "Product chatter and brainstorms — non-authoritative cooler talk",
    houseRules: [
      "Brainstorms are non-authoritative",
      "No leaking secrets or credentials",
      "Cooler talk stays civil",
    ],
    moduleId: "community/coffee-shop",
  },
];

async function ensureVenueRoom(
  opts: { identity: AgentKeyPair; mlsStore: MlsSessionStore; rooms: RoomStore },
  venue: TownVenueSeed,
): Promise<{ roomId: string; created: boolean }> {
  if (venue.roomId === COFFEE_SHOP_ROOM_ID) {
    const coffee = await seedCoffeeShopRoom(opts);
    const existing = opts.rooms.getRoom(COFFEE_SHOP_ROOM_ID);
    if (existing) {
      opts.rooms.updateRoomMeta(COFFEE_SHOP_ROOM_ID, {
        category: venue.category,
        description: venue.description,
        topic: venue.description,
        rules: {
          basePolicyUrl: ATOM_BASE_ROOM_POLICY_URL,
          hostRules: venue.houseRules,
        },
      });
    }
    return coffee;
  }

  const existing = opts.rooms.getRoom(venue.roomId);
  if (existing) {
    if (!opts.mlsStore.hasRoomSession(venue.roomId)) {
      await opts.mlsStore.createRoomHost({
        localDid: opts.identity.did,
        roomId: venue.roomId,
      });
    }
    opts.rooms.updateRoomMeta(venue.roomId, {
      category: venue.category,
      description: venue.description,
      topic: venue.description,
      rules: {
        basePolicyUrl: ATOM_BASE_ROOM_POLICY_URL,
        hostRules: venue.houseRules,
      },
    });
    return { roomId: venue.roomId, created: false };
  }

  const descriptor = opts.rooms.createRoom({
    hostDid: opts.identity.did,
    name: venue.displayName,
    topic: venue.description,
    description: venue.description,
    category: venue.category,
    admission: "open",
    moduleId: venue.moduleId ?? "community/coffee-shop",
    policyUrl: ATOM_BASE_ROOM_POLICY_URL,
    hostRules: venue.houseRules,
    roomId: venue.roomId,
    maxMembers: 128,
  });
  await opts.mlsStore.createRoomHost({
    localDid: opts.identity.did,
    roomId: descriptor.roomId,
  });
  return { roomId: descriptor.roomId, created: true };
}

/** Seed all Qwixl town venues on the community host (idempotent). */
export async function seedTownVenues(opts: {
  identity: AgentKeyPair;
  mlsStore: MlsSessionStore;
  rooms: RoomStore;
}): Promise<{ created: string[]; existing: string[] }> {
  const created: string[] = [];
  const existing: string[] = [];
  for (const venue of TOWN_VENUE_SEEDS) {
    const result = await ensureVenueRoom(opts, venue);
    if (result.created) created.push(result.roomId);
    else existing.push(result.roomId);
  }
  return { created, existing };
}
