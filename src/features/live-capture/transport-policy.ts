export const LIVE_FRAME_INTERVAL_MS = 125;
export const MAX_LIVE_SOCKET_BUFFER_BYTES = 2_000_000;

export function shouldDropLiveFrame(input: {
  frameEncoding: boolean;
  socketBufferedBytes: number;
  maxBufferedBytes?: number;
}) {
  return (
    input.frameEncoding ||
    input.socketBufferedBytes >
      (input.maxBufferedBytes ?? MAX_LIVE_SOCKET_BUFFER_BYTES)
  );
}
