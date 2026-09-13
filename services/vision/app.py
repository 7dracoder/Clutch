import asyncio
import json
import os
import struct
from functools import lru_cache
from pathlib import Path
from time import time
from uuid import uuid4

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from services.vision.detector import (
    SOCCER_MODEL_REPO,
    SOCCER_MODEL_REVISION,
    OpenCvSportsDetector,
    RFDetrSoccerDetector,
    SportsDetector,
)
from services.vision.processor import FrameMetadata, FrameProcessor


MAX_PACKET_BYTES = 5_000_000
FRAME_HEADER_BYTES = 16
DEFAULT_ORIGINS = {
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
}

app = FastAPI(title="Clutch Vision Worker", version="0.1.0")


def vision_sport() -> str:
    sport = os.environ.get("VISION_SPORT", "soccer").strip().lower()
    return sport if sport in {"soccer", "basketball"} else "soccer"


def detector_backend() -> str:
    return os.environ.get("VISION_DETECTOR", "opencv").strip().lower()


def soccer_model_path() -> Path:
    return Path(
        os.environ.get(
            "SOCCER_MODEL_PATH",
            "services/vision/models/rfdetr-soccernet/"
            "weights/checkpoint_best_regular.pth",
        )
    )


@lru_cache(maxsize=1)
def configured_detector() -> SportsDetector:
    if detector_backend() == "soccer-rfdetr":
        return RFDetrSoccerDetector(
            model_path=soccer_model_path(),
            device=os.environ.get("SOCCER_DEVICE", "auto"),
        )
    return OpenCvSportsDetector(sport=vision_sport())


def allowed_origins() -> set[str]:
    configured = os.environ.get("VISION_ALLOWED_ORIGINS")
    if not configured:
        return DEFAULT_ORIGINS
    return {origin.strip() for origin in configured.split(",") if origin.strip()}


@app.get("/health")
def health() -> dict[str, object]:
    backend = detector_backend()
    model_ready = backend != "soccer-rfdetr" or soccer_model_path().is_file()
    return {
        "status": "ok" if model_ready else "degraded",
        "sport": vision_sport(),
        "device": (
            os.environ.get("SOCCER_DEVICE", "auto")
            if backend == "soccer-rfdetr"
            else "cpu"
        ),
        "detector": (
            RFDetrSoccerDetector.name
            if backend == "soccer-rfdetr"
            else OpenCvSportsDetector(sport=vision_sport()).name
        ),
        "modelReady": model_ready,
        "researchOnly": backend == "soccer-rfdetr",
        "modelRepo": SOCCER_MODEL_REPO if backend == "soccer-rfdetr" else None,
        "modelRevision": (
            SOCCER_MODEL_REVISION if backend == "soccer-rfdetr" else None
        ),
        "timestampMs": time() * 1000,
    }


@app.websocket("/ws")
async def observe_stream(websocket: WebSocket) -> None:
    origin = websocket.headers.get("origin")
    if origin and origin not in allowed_origins():
        await websocket.close(code=1008, reason="Origin is not allowed")
        return

    await websocket.accept()
    try:
        processor = FrameProcessor(detector=configured_detector())
    except (FileNotFoundError, RuntimeError, ValueError) as error:
        await websocket.send_json({"type": "error", "message": str(error)})
        await websocket.close(code=1011, reason="Detector failed to initialize")
        return
    session_id = str(uuid4())
    session_source: dict[str, str] | None = None

    try:
        while True:
            message = await websocket.receive()
            packet = message.get("bytes")
            text = message.get("text")

            if packet is not None:
                try:
                    metadata, jpeg = parse_frame_packet(packet)
                    result = await asyncio.to_thread(
                        processor.process_frame,
                        jpeg,
                        metadata,
                        session_id,
                    )
                    if session_source:
                        result["source"] = session_source
                    await websocket.send_json(result)
                except (ValueError, struct.error) as error:
                    await websocket.send_json(
                        {"type": "error", "message": str(error)}
                    )
            elif text is not None:
                try:
                    command = json.loads(text)
                    if command.get("type") == "reset":
                        processor.reset()
                    elif command.get("type") == "calibrate":
                        processor.calibrate(command.get("points", []))
                    elif command.get("type") == "session_metadata":
                        source_url = command.get("sourceUrl", "")
                        license_note = command.get("licenseNote", "")
                        if not isinstance(source_url, str) or not isinstance(
                            license_note, str
                        ):
                            raise ValueError("Session metadata must be text")
                        if not license_note.strip():
                            raise ValueError("A footage license note is required")
                        session_source = {
                            "sourceUrl": source_url.strip()[:2_000],
                            "licenseNote": license_note.strip()[:1_000],
                        }
                    else:
                        raise ValueError("Unknown vision worker command")
                except (ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
                    await websocket.send_json(
                        {"type": "error", "message": str(error)}
                    )
    except (WebSocketDisconnect, RuntimeError):
        return


def parse_frame_packet(packet: bytes) -> tuple[FrameMetadata, bytes]:
    if len(packet) <= FRAME_HEADER_BYTES:
        raise ValueError("Frame packet is missing JPEG data")
    if len(packet) > MAX_PACKET_BYTES:
        raise ValueError("Frame packet exceeds the 5 MB limit")

    timestamp_ms, sequence, width, height = struct.unpack(
        "<dIHH", packet[:FRAME_HEADER_BYTES]
    )
    if timestamp_ms <= 0 or width <= 0 or height <= 0:
        raise ValueError("Frame packet header is invalid")
    if width > 4096 or height > 4096:
        raise ValueError("Frame dimensions exceed the supported limit")

    return (
        FrameMetadata(
            timestamp_ms=timestamp_ms,
            sequence=sequence,
            declared_width=width,
            declared_height=height,
        ),
        packet[FRAME_HEADER_BYTES:],
    )
