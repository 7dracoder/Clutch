import { describe, expect, it } from "vitest";
import {
  LIVE_FRAME_INTERVAL_MS,
  shouldDropLiveFrame,
} from "../src/features/live-capture/transport-policy";

describe("live frame transport policy", () => {
  it("targets eight frames per second", () => {
    expect(1_000 / LIVE_FRAME_INTERVAL_MS).toBe(8);
  });

  it("drops a frame while the previous frame is encoding", () => {
    expect(
      shouldDropLiveFrame({
        frameEncoding: true,
        socketBufferedBytes: 0,
      }),
    ).toBe(true);
  });

  it("drops stale frames when the socket queue is over its bound", () => {
    expect(
      shouldDropLiveFrame({
        frameEncoding: false,
        socketBufferedBytes: 101,
        maxBufferedBytes: 100,
      }),
    ).toBe(true);
    expect(
      shouldDropLiveFrame({
        frameEncoding: false,
        socketBufferedBytes: 100,
        maxBufferedBytes: 100,
      }),
    ).toBe(false);
  });
});
