export interface PhoneFrame {
  bytes: Uint8Array;
  sequence: number;
  timestampMs: number;
  sourceUrl: string;
  licenseNote: string;
  updatedAtMs: number;
}

interface PhoneStreamStore {
  rooms: Map<string, PhoneFrame>;
}

const STORE_KEY = Symbol.for("clutch.phone-stream-store");
const ROOM_PATTERN = /^[a-zA-Z0-9_-]{6,32}$/;
const ROOM_TTL_MS = 60_000;

type GlobalWithPhoneStreams = typeof globalThis & {
  [STORE_KEY]?: PhoneStreamStore;
};

const globalStore = globalThis as GlobalWithPhoneStreams;
const store =
  globalStore[STORE_KEY] ??
  (globalStore[STORE_KEY] = {
    rooms: new Map<string, PhoneFrame>(),
  });

export function isValidPhoneRoom(room: string) {
  return ROOM_PATTERN.test(room);
}

export function putPhoneFrame(room: string, frame: PhoneFrame) {
  prunePhoneStreams(frame.updatedAtMs);
  store.rooms.set(room, frame);
}

export function getPhoneFrame(room: string, nowMs = Date.now()) {
  const frame = store.rooms.get(room);
  if (!frame) return null;
  if (nowMs - frame.updatedAtMs > ROOM_TTL_MS) {
    store.rooms.delete(room);
    return null;
  }
  return frame;
}

export function deletePhoneStream(room: string) {
  store.rooms.delete(room);
}

function prunePhoneStreams(nowMs: number) {
  for (const [room, frame] of store.rooms) {
    if (nowMs - frame.updatedAtMs > ROOM_TTL_MS) store.rooms.delete(room);
  }
}
