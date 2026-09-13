import struct

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from services.vision.app import app


client = TestClient(app)


def test_health_reports_detector() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["sport"] == "soccer"
    assert response.json()["device"] == "cpu"
    assert response.json()["detector"] == "opencv-hog-soccer-ball"
    assert response.json()["modelReady"] is True


def test_health_reports_missing_research_checkpoint(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("VISION_DETECTOR", "soccer-rfdetr")
    monkeypatch.setenv("SOCCER_MODEL_PATH", "missing/checkpoint.pth")
    monkeypatch.setenv("SOCCER_DEVICE", "cuda")
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "degraded"
    assert response.json()["modelReady"] is False
    assert response.json()["researchOnly"] is True
    assert response.json()["device"] == "cuda"
    assert response.json()["modelRevision"] == (
        "1e388b922a64f2be39cbf1925e5fd5fc4f7dd771"
    )


def test_websocket_processes_binary_frame(monkeypatch: pytest.MonkeyPatch) -> None:
    class StubProcessor:
        def __init__(self, detector=None):
            self.detector = detector

        def process_frame(self, jpeg, metadata, session_id):
            return {
                "type": "tracking",
                "sessionId": session_id,
                "sequence": metadata.sequence,
                "timestampMs": metadata.timestamp_ms,
                "processedAtMs": 1_010,
                "frame": {
                    "width": metadata.declared_width,
                    "height": metadata.declared_height,
                },
                "objects": [],
                "calibrated": False,
            }

        def reset(self):
            return None

        def calibrate(self, points):
            return None

    monkeypatch.setattr("services.vision.app.FrameProcessor", StubProcessor)
    frame = np.zeros((128, 128, 3), dtype=np.uint8)
    success, encoded = cv2.imencode(".jpg", frame)
    assert success
    packet = struct.pack("<dIHH", 1_000, 1, 128, 128) + encoded.tobytes()

    with client.websocket_connect(
        "/ws", headers={"origin": "http://localhost:3000"}
    ) as websocket:
        websocket.send_text(
            '{"type":"session_metadata","sourceUrl":"https://example.com/video",'
            '"licenseNote":"CC BY 4.0"}'
        )
        websocket.send_bytes(packet)
        response = websocket.receive_json()

    assert response["type"] == "tracking"
    assert response["sequence"] == 1
    assert response["timestampMs"] == 1_000
    assert response["frame"] == {"width": 128, "height": 128}
    assert response["source"]["licenseNote"] == "CC BY 4.0"


def test_websocket_rejects_untrusted_origin() -> None:
    with pytest.raises(Exception):
        with client.websocket_connect(
            "/ws", headers={"origin": "https://untrusted.example"}
        ):
            pass
