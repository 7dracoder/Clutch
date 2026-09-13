import struct

import cv2
import numpy as np
import pytest
import supervision as sv

from services.vision.app import parse_frame_packet
from services.vision.detector import (
    BALL_CLASS_ID,
    DetectionBatch,
    GOALKEEPER_CLASS_ID,
    OFFICIAL_CLASS_ID,
)
from services.vision.processor import (
    FrameMetadata,
    FrameProcessor,
    JerseyTeamAssigner,
)


class FakeDetector:
    name = "fake"

    def detect(self, frame: np.ndarray) -> DetectionBatch:
        return DetectionBatch(
            xyxy=np.asarray(
                [[10, 10, 30, 60], [20, 40, 26, 46]], dtype=np.float32
            ),
            confidence=np.asarray([0.95, 0.9], dtype=np.float32),
            class_id=np.asarray([0, 1], dtype=int),
        )


def jpeg_frame() -> bytes:
    frame = np.zeros((100, 100, 3), dtype=np.uint8)
    success, encoded = cv2.imencode(".jpg", frame)
    assert success
    return encoded.tobytes()


def test_frame_packet_round_trip() -> None:
    jpeg = jpeg_frame()
    packet = struct.pack("<dIHH", 1_000.5, 7, 100, 100) + jpeg
    metadata, parsed_jpeg = parse_frame_packet(packet)
    assert metadata.timestamp_ms == 1_000.5
    assert metadata.sequence == 7
    assert parsed_jpeg == jpeg


def test_calibration_and_tracking_ids_are_applied() -> None:
    processor = FrameProcessor(detector=FakeDetector(), frame_rate=8)
    processor.calibrate(
        [
            {"video": {"x": 0, "y": 0}, "field": {"x": 0, "y": 0}},
            {"video": {"x": 100, "y": 0}, "field": {"x": 94, "y": 0}},
            {"video": {"x": 100, "y": 100}, "field": {"x": 94, "y": 50}},
            {"video": {"x": 0, "y": 100}, "field": {"x": 0, "y": 50}},
        ]
    )
    metadata = FrameMetadata(1_000, 1, 100, 100)
    first = processor.process_frame(jpeg_frame(), metadata, "session")
    second = processor.process_frame(
        jpeg_frame(),
        FrameMetadata(1_125, 2, 100, 100),
        "session",
    )

    assert first["calibrated"] is True
    assert len(first["objects"]) == 2
    assert [item["id"] for item in first["objects"]] == [
        item["id"] for item in second["objects"]
    ]
    player = next(item for item in first["objects"] if item["kind"] == "player")
    assert player["fieldPoint"]["x"] == pytest.approx(18.8, abs=0.1)
    assert player["fieldPoint"]["y"] == pytest.approx(30, abs=0.1)


def test_rejects_degenerate_calibration() -> None:
    processor = FrameProcessor(detector=FakeDetector())
    with pytest.raises(ValueError):
        processor.calibrate(
            [
                {"video": {"x": 0, "y": 0}, "field": {"x": 0, "y": 0}},
                {"video": {"x": 1, "y": 1}, "field": {"x": 1, "y": 1}},
                {"video": {"x": 2, "y": 2}, "field": {"x": 2, "y": 2}},
                {"video": {"x": 3, "y": 3}, "field": {"x": 3, "y": 3}},
            ]
        )


def test_soccer_pitch_calibration_uses_metric_dimensions() -> None:
    processor = FrameProcessor(detector=FakeDetector())
    processor.calibrate(
        [
            {"video": {"x": 0, "y": 0}, "field": {"x": 0, "y": 0}},
            {"video": {"x": 100, "y": 0}, "field": {"x": 105, "y": 0}},
            {"video": {"x": 100, "y": 100}, "field": {"x": 105, "y": 68}},
            {"video": {"x": 0, "y": 100}, "field": {"x": 0, "y": 68}},
        ]
    )
    result = processor.process_frame(
        jpeg_frame(), FrameMetadata(1_000, 1, 100, 100), "soccer"
    )
    player = next(item for item in result["objects"] if item["kind"] == "player")
    assert player["fieldPoint"]["x"] == pytest.approx(21, abs=0.1)
    assert player["fieldPoint"]["y"] == pytest.approx(40.8, abs=0.1)


def test_roles_are_serialized_for_soccer_classes() -> None:
    processor = FrameProcessor(detector=FakeDetector())
    box = np.asarray([10, 10, 30, 60], dtype=np.float32)
    ball = processor._serialize_detection(box, 0.9, BALL_CLASS_ID, 1, "unknown")
    official = processor._serialize_detection(
        box, 0.9, OFFICIAL_CLASS_ID, 2, "unknown"
    )
    goalkeeper = processor._serialize_detection(
        box, 0.9, GOALKEEPER_CLASS_ID, 3, "defense"
    )
    assert (ball["kind"], ball["role"]) == ("ball", "ball")
    assert (official["kind"], official["role"]) == ("official", "referee")
    assert (goalkeeper["kind"], goalkeeper["role"]) == ("player", "goalkeeper")
    assert goalkeeper["team"] == "unknown"


def test_team_color_assignment_votes_per_track() -> None:
    frame = np.zeros((100, 100, 3), dtype=np.uint8)
    frame[5:45, 5:20] = (0, 0, 220)
    frame[5:45, 25:40] = (0, 0, 220)
    frame[5:45, 50:65] = (220, 0, 0)
    frame[5:45, 75:90] = (220, 0, 0)
    detections = sv.Detections(
        xyxy=np.asarray(
            [[5, 5, 20, 75], [25, 5, 40, 75], [50, 5, 65, 75], [75, 5, 90, 75]],
            dtype=np.float32,
        ),
        confidence=np.ones(4, dtype=np.float32),
        class_id=np.zeros(4, dtype=int),
        tracker_id=np.asarray([1, 2, 3, 4]),
    )
    assigner = JerseyTeamAssigner()
    first = assigner.assign(frame, detections)
    second = assigner.assign(frame, detections)
    assert first == second
    assert first[1] == first[2]
    assert first[3] == first[4]
    assert first[1] != first[3]
