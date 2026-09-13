import { describe, expect, it } from "vitest";
import {
  deletePhoneStream,
  getPhoneFrame,
  isValidPhoneRoom,
  putPhoneFrame,
} from "../src/lib/phone-stream-store";

describe("phone stream store", () => {
  it("validates room codes", () => {
    expect(isValidPhoneRoom("CLUTCH01")).toBe(true);
    expect(isValidPhoneRoom("abc")).toBe(false);
    expect(isValidPhoneRoom("../secret")).toBe(false);
  });

  it("stores only the latest frame for a room", () => {
    const room = "TESTROOM";
    putPhoneFrame(room, {
      bytes: new Uint8Array([1, 2, 3]),
      sequence: 7,
      timestampMs: 100,
      sourceUrl: "phone:test.mp4",
      licenseNote: "Owner permission",
      updatedAtMs: 1_000,
    });

    expect(getPhoneFrame(room, 1_001)?.sequence).toBe(7);
    deletePhoneStream(room);
    expect(getPhoneFrame(room, 1_001)).toBeNull();
  });

  it("expires inactive rooms", () => {
    const room = "OLDROOM";
    putPhoneFrame(room, {
      bytes: new Uint8Array([1]),
      sequence: 1,
      timestampMs: 100,
      sourceUrl: "phone:test.mp4",
      licenseNote: "Owner permission",
      updatedAtMs: 1_000,
    });

    expect(getPhoneFrame(room, 62_000)).toBeNull();
  });
});
