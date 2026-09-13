"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  trackingFrameSchema,
  type CalibrationPoint,
  type CaptureSource,
  type CaptureStatus,
  type TrackingFrame,
} from "@/features/live-capture/types";
import {
  LIVE_FRAME_INTERVAL_MS,
  shouldDropLiveFrame,
} from "@/features/live-capture/transport-policy";

const CAPTURE_WIDTH = 960;

export interface LiveScreenObservation {
  videoRef: RefObject<HTMLVideoElement | null>;
  status: CaptureStatus;
  error: string | null;
  latestTracking: TrackingFrame | null;
  droppedFrames: number;
  latencyMs: number | null;
  startCapture: (source: CaptureSource) => Promise<void>;
  startPhoneCapture: (room: string, source: CaptureSource) => Promise<void>;
  stopCapture: () => void;
  calibrate: (points: CalibrationPoint[]) => void;
  takeKeyFrame: () => string | null;
  setStreamMuted: (muted: boolean) => void;
}

export function useLiveScreenObservation(): LiveScreenObservation {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const phoneAbortRef = useRef<AbortController | null>(null);
  const remoteCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const encodingRef = useRef(false);
  const awaitingWorkerRef = useRef(false);
  const sequenceRef = useRef(0);
  const [status, setStatus] = useState<CaptureStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [latestTracking, setLatestTracking] =
    useState<TrackingFrame | null>(null);
  const [droppedFrames, setDroppedFrames] = useState(0);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const stopCapture = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    phoneAbortRef.current?.abort();
    phoneAbortRef.current = null;
    socketRef.current?.close();
    socketRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    remoteCanvasRef.current = null;
    encodingRef.current = false;
    awaitingWorkerRef.current = false;
    setStatus((current) => (current === "error" ? current : "stopped"));
  }, []);

  const startFrameLoop = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => {
      const video = videoRef.current;
      const socket = socketRef.current;
      if (
        !video ||
        !socket ||
        socket.readyState !== WebSocket.OPEN ||
        video.videoWidth === 0
      ) {
        return;
      }

      if (
        awaitingWorkerRef.current ||
        shouldDropLiveFrame({
          frameEncoding: encodingRef.current,
          socketBufferedBytes: socket.bufferedAmount,
        })
      ) {
        setDroppedFrames((count) => count + 1);
        return;
      }

      const canvas =
        canvasRef.current ?? document.createElement("canvas");
      canvasRef.current = canvas;
      const scale = Math.min(1, CAPTURE_WIDTH / video.videoWidth);
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      canvas.getContext("2d", { alpha: false })?.drawImage(
        video,
        0,
        0,
        canvas.width,
        canvas.height,
      );

      encodingRef.current = true;
      canvas.toBlob(
        async (blob) => {
          try {
            if (!blob || socket.readyState !== WebSocket.OPEN) return;
            const jpeg = await blob.arrayBuffer();
            const packet = new ArrayBuffer(16 + jpeg.byteLength);
            const header = new DataView(packet, 0, 16);
            header.setFloat64(0, Date.now(), true);
            header.setUint32(8, sequenceRef.current++, true);
            header.setUint16(12, canvas.width, true);
            header.setUint16(14, canvas.height, true);
            new Uint8Array(packet, 16).set(new Uint8Array(jpeg));
            socket.send(packet);
            awaitingWorkerRef.current = true;
          } finally {
            encodingRef.current = false;
          }
        },
        "image/jpeg",
        0.72,
      );
    }, LIVE_FRAME_INTERVAL_MS);
  }, []);

  const connectVisionWorker = useCallback(
    (source: CaptureSource) => {
      setStatus("connecting");
      const socket = new WebSocket(
        process.env.NEXT_PUBLIC_VISION_WS_URL ??
          "ws://127.0.0.1:8765/ws",
      );
      socket.binaryType = "arraybuffer";
      socketRef.current = socket;
      socket.onopen = () => {
        socket.send(
          JSON.stringify({
            type: "session_metadata",
            sourceUrl: source.sourceUrl.trim(),
            licenseNote: source.licenseNote.trim(),
          }),
        );
        setStatus("observing");
        startFrameLoop();
      };
      socket.onmessage = (event) => {
        awaitingWorkerRef.current = false;
        try {
          const payload: unknown = JSON.parse(String(event.data));
          if (
            typeof payload === "object" &&
            payload !== null &&
            "type" in payload &&
            payload.type === "error"
          ) {
            setError(
              "message" in payload && typeof payload.message === "string"
                ? payload.message
                : "Vision worker processing failed",
            );
            return;
          }
          const parsed = trackingFrameSchema.parse(payload);
          setLatestTracking(parsed);
          setLatencyMs(Math.max(0, Date.now() - parsed.timestampMs));
        } catch {
          setError("Vision worker returned an invalid tracking event");
        }
      };
      socket.onerror = () => {
        awaitingWorkerRef.current = false;
        setError("Cannot connect to the local vision worker");
        setStatus("error");
      };
      socket.onclose = stopCapture;
    },
    [startFrameLoop, stopCapture],
  );

  const resetCapture = useCallback(
    (source: CaptureSource) => {
      stopCapture();
      setError(null);
      setLatestTracking(null);
      setLatencyMs(null);
      setDroppedFrames(0);
      sequenceRef.current = 0;
      if (!source.licenseNote.trim()) {
        throw new Error("AirServer session metadata is missing");
      }
    },
    [stopCapture],
  );

  const startCapture = useCallback(
    async (source: CaptureSource) => {
      try {
        resetCapture(source);
        setStatus("requesting_permission");
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            frameRate: { ideal: 15, max: 30 },
          },
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            suppressLocalAudioPlayback: true,
          } as MediaTrackConstraints,
        });
        streamRef.current = stream;
        stream.getVideoTracks()[0]?.addEventListener("ended", stopCapture, {
          once: true,
        });

        const video = videoRef.current;
        if (!video) throw new Error("Capture preview is not mounted");
        video.srcObject = stream;
        video.muted = false;
        await video.play();
        connectVisionWorker(source);
      } catch (cause) {
        const message =
          cause instanceof DOMException && cause.name === "NotAllowedError"
            ? "Screen share was cancelled. Tap the center again and pick AirServer."
            : cause instanceof Error
              ? cause.message
              : "Screen capture failed";
        setError(message);
        setStatus("error");
        stopCapture();
      }
    },
    [connectVisionWorker, resetCapture, stopCapture],
  );

  const startPhoneCapture = useCallback(
    async (room: string, source: CaptureSource) => {
      try {
        resetCapture(source);
        if (!/^[a-zA-Z0-9_-]{6,32}$/.test(room)) {
          throw new Error("Enter a valid phone room code");
        }

        const video = videoRef.current;
        if (!video) throw new Error("Capture preview is not mounted");
        const remoteCanvas = document.createElement("canvas");
        remoteCanvas.width = 960;
        remoteCanvas.height = 540;
        remoteCanvasRef.current = remoteCanvas;
        const stream = remoteCanvas.captureStream(8);
        streamRef.current = stream;
        video.srcObject = stream;
        await video.play();

        const controller = new AbortController();
        phoneAbortRef.current = controller;
        connectVisionWorker(source);

        let lastSequence = -1;
        const poll = async () => {
          while (!controller.signal.aborted) {
            const response = await fetch(
              `/api/phone-stream/${room}/frame?after=${lastSequence}`,
              { cache: "no-store", signal: controller.signal },
            );
            if (response.status === 200) {
              lastSequence = Number(
                response.headers.get("x-clutch-sequence") ?? lastSequence + 1,
              );
              const bitmap = await createImageBitmap(await response.blob());
              const context = remoteCanvas.getContext("2d", { alpha: false });
              if (context) {
                context.fillStyle = "#000";
                context.fillRect(0, 0, remoteCanvas.width, remoteCanvas.height);
                const scale = Math.min(
                  remoteCanvas.width / bitmap.width,
                  remoteCanvas.height / bitmap.height,
                );
                const width = bitmap.width * scale;
                const height = bitmap.height * scale;
                context.drawImage(
                  bitmap,
                  (remoteCanvas.width - width) / 2,
                  (remoteCanvas.height - height) / 2,
                  width,
                  height,
                );
              }
              bitmap.close();
            }
            await new Promise((resolve) => setTimeout(resolve, 90));
          }
        };
        void poll().catch((cause) => {
          if (controller.signal.aborted) return;
          setError(
            cause instanceof Error ? cause.message : "Phone stream disconnected",
          );
          setStatus("error");
          stopCapture();
        });
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Phone capture failed",
        );
        setStatus("error");
        stopCapture();
      }
    },
    [connectVisionWorker, resetCapture, stopCapture],
  );

  const calibrate = useCallback((points: CalibrationPoint[]) => {
    if (points.length !== 4) {
      throw new Error("Pitch calibration requires exactly four points");
    }
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error("Vision worker is not connected");
    }
    socket.send(JSON.stringify({ type: "calibrate", points }));
  }, []);

  const takeKeyFrame = useCallback(() => {
    return canvasRef.current?.toDataURL("image/jpeg", 0.82) ?? null;
  }, []);

  const setStreamMuted = useCallback((muted: boolean) => {
    const video = videoRef.current;
    if (video) video.muted = muted;
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  }, []);

  useEffect(() => stopCapture, [stopCapture]);

  return {
    videoRef,
    status,
    error,
    latestTracking,
    droppedFrames,
    latencyMs,
    startCapture,
    startPhoneCapture,
    stopCapture,
    calibrate,
    takeKeyFrame,
    setStreamMuted,
  };
}
