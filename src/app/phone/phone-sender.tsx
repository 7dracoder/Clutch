"use client";

import { useEffect, useRef, useState } from "react";
import { BrandLockup } from "@/features/brand/brand-lockup";
import { LIVE_FRAME_INTERVAL_MS } from "@/features/live-capture/transport-policy";

export function PhoneSender({ room }: { room: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const sequenceRef = useRef(0);
  const sendingRef = useRef(false);
  const [licenseNote, setLicenseNote] = useState("");
  const [fileName, setFileName] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoReady, setVideoReady] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "ready" | "streaming" | "error"
  >("idle");
  const [message, setMessage] = useState("Choose an authorized video file.");
  const [sentFrames, setSentFrames] = useState(0);

  const stop = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    sendingRef.current = false;
    videoRef.current?.pause();
    if (status === "streaming") {
      setStatus("ready");
      setMessage("Phone stream stopped.");
      void fetch(`/api/phone-stream/${room}/frame`, { method: "DELETE" });
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const chooseFile = (file: File | undefined) => {
    stop();
    if (!file || !videoRef.current) return;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = URL.createObjectURL(file);
    setVideoUrl(objectUrlRef.current);
    setVideoReady(false);
    setFileName(file.name);
    setStatus("idle");
    setMessage(
      `Loading ${file.name} (${formatFileSize(file.size)}, ${
        file.type || "unknown format"
      })…`,
    );
    setSentFrames(0);
    sequenceRef.current = 0;
  };

  const markVideoReady = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;
    setVideoReady(true);
    setStatus("ready");
    setMessage(
      `Video ready · ${video.videoWidth}×${video.videoHeight} · ${formatDuration(
        video.duration,
      )}`,
    );
  };

  const reportVideoError = () => {
    const code = videoRef.current?.error?.code;
    const detail =
      code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
        ? "This phone browser cannot decode the selected format. Use an MP4 encoded with H.264 video."
        : code === MediaError.MEDIA_ERR_DECODE
          ? "The file was found but its video codec could not be decoded. Try an H.264 MP4."
          : "The selected video could not be loaded. Try downloading it locally or choosing another MP4.";
    setVideoReady(false);
    setStatus("error");
    setMessage(detail);
  };

  const sendFrame = async () => {
    const video = videoRef.current;
    if (
      !video ||
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      video.videoWidth === 0 ||
      sendingRef.current
    ) {
      return;
    }

    const canvas = canvasRef.current ?? document.createElement("canvas");
    canvasRef.current = canvas;
    const scale = Math.min(1, 960 / video.videoWidth);
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    canvas
      .getContext("2d", { alpha: false })
      ?.drawImage(video, 0, 0, canvas.width, canvas.height);

    sendingRef.current = true;
    const sequence = sequenceRef.current++;
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.72),
      );
      if (!blob) throw new Error("Could not encode this video frame");
      const response = await fetch(`/api/phone-stream/${room}/frame`, {
        method: "POST",
        headers: {
          "Content-Type": "image/jpeg",
          "X-Clutch-Sequence": String(sequence),
          "X-Clutch-Timestamp": String(Date.now()),
          "X-Clutch-Source": encodeURIComponent(fileName),
          "X-Clutch-License": encodeURIComponent(licenseNote),
        },
        body: blob,
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? "Desktop relay rejected the frame");
      }
      setSentFrames(sequence + 1);
    } catch (cause) {
      stop();
      setStatus("error");
      setMessage(
        cause instanceof Error ? cause.message : "Phone streaming failed",
      );
    } finally {
      sendingRef.current = false;
    }
  };

  const start = async () => {
    if (!videoRef.current || !fileName || !licenseNote.trim()) {
      return;
    }
    try {
      const video = videoRef.current;
      if (!videoReady) {
        setMessage("Loading video for playback…");
      }
      // Mobile browsers may defer media loading until a user explicitly starts
      // playback, even when preload is set. Keep this call in the click handler
      // and do not require a preload event before enabling the button.
      await video.play();
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        throw new Error("The video started but no picture was available.");
      }
      setStatus("streaming");
      setMessage("Streaming frames to the Clutch desktop.");
      timerRef.current = setInterval(
        () => void sendFrame(),
        LIVE_FRAME_INTERVAL_MS,
      );
      await sendFrame();
    } catch (cause) {
      setStatus("error");
      setMessage(
        cause instanceof Error ? cause.message : "Video playback failed",
      );
    }
  };

  return (
    <main className="phone-page">
      <header className="phone-header">
        <BrandLockup section="Phone Feed" meta="Local network source" />
        <div className="room-stamp">Room {room}</div>
      </header>

      <section className="phone-card">
        <p className="eyebrow gold-text">Local network video source</p>
        <h1>Send video to Clutch</h1>
        <p className="phone-intro">
          Select a video stored on this phone. It stays on your local network;
          sampled frames are processed by the vision worker on your computer.
        </p>

        <label className="phone-file">
          <span>{fileName || "Choose soccer video"}</span>
          <input
            type="file"
            accept="video/*"
            onChange={(event) => chooseFile(event.currentTarget.files?.[0])}
          />
        </label>

        <div className="phone-video-stage">
          <video
            key={videoUrl}
            ref={videoRef}
            src={videoUrl || undefined}
            controls
            muted
            playsInline
            preload="auto"
            onLoadedMetadata={markVideoReady}
            onLoadedData={markVideoReady}
            onCanPlay={markVideoReady}
            onError={reportVideoError}
            onEnded={stop}
          />
          {!fileName ? (
            <div className="phone-video-empty">No video selected</div>
          ) : null}
        </div>

        <label className="phone-license">
          <span>License or permission note</span>
          <input
            value={licenseNote}
            placeholder="Owner permission, CC BY 4.0, etc."
            onChange={(event) => setLicenseNote(event.currentTarget.value)}
          />
        </label>

        <div className="phone-actions">
          <button
            type="button"
            className="button button--primary"
            onClick={() => void start()}
            disabled={
              !fileName || !licenseNote.trim() || status === "streaming"
            }
          >
            Start phone stream
          </button>
          <button
            type="button"
            className="button button--danger"
            onClick={stop}
            disabled={status !== "streaming"}
          >
            Stop
          </button>
        </div>

        <div className={`phone-status phone-status--${status}`} role="status">
          <span className="live-dot" />
          <div>
            <strong>{status}</strong>
            <p>{message}</p>
          </div>
          <span>{sentFrames} frames</span>
        </div>

        <p className="phone-disclaimer">
          Keep this page open and the display awake. Do not send DRM-protected
          or unauthorized footage.
        </p>
      </section>
    </main>
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1_000))} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds)) return "unknown duration";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}
