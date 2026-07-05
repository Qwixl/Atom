import type { AgentKeyPair } from "@qwixl/protocol";
import type { MlsSessionStore } from "./mlsSessions.js";
import type { RoomStore } from "./roomStore.js";

export const COFFEE_SHOP_ROOM_ID = "room:coffeeshop";

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
