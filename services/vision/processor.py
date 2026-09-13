from __future__ import annotations

from dataclasses import dataclass
from collections import defaultdict
from time import time
from typing import Any

import cv2
import numpy as np
import supervision as sv

from services.vision.detector import (
    BALL_CLASS_ID,
    DetectionBatch,
    GOALKEEPER_CLASS_ID,
    OFFICIAL_CLASS_ID,
    OpenCvSportsDetector,
    PLAYER_CLASS_ID,
    SportsDetector,
)


@dataclass(frozen=True)
class FrameMetadata:
    timestamp_ms: float
    sequence: int
    declared_width: int
    declared_height: int


class JerseyTeamAssigner:
    """Two-team color clustering with per-track temporal voting."""

    def __init__(self) -> None:
        self._votes: dict[int, list[int]] = defaultdict(lambda: [0, 0])

    def reset(self) -> None:
        self._votes.clear()

    def assign(
        self,
        frame: np.ndarray,
        detections: sv.Detections,
    ) -> dict[int, str]:
        samples: list[np.ndarray] = []
        tracker_ids: list[int] = []
        if detections.class_id is None or detections.tracker_id is None:
            return {}

        height, width = frame.shape[:2]
        for box, class_id, tracker_id in zip(
            detections.xyxy,
            detections.class_id,
            detections.tracker_id,
            strict=True,
        ):
            if int(class_id) != PLAYER_CLASS_ID or tracker_id is None:
                continue
            x1, y1, x2, y2 = (int(value) for value in box)
            x1, x2 = max(0, x1), min(width, x2)
            y1, y2 = max(0, y1), min(height, y2)
            torso_y2 = y1 + max(1, int((y2 - y1) * 0.55))
            crop = frame[y1:torso_y2, x1:x2]
            if crop.size == 0:
                continue
            lab = cv2.cvtColor(crop, cv2.COLOR_BGR2LAB)
            samples.append(np.median(lab.reshape(-1, 3), axis=0).astype(np.float32))
            tracker_ids.append(int(tracker_id))

        if len(samples) < 4:
            return {
                tracker_id: self._voted_team(tracker_id)
                for tracker_id in tracker_ids
            }

        cv2.setRNGSeed(7)
        _compactness, labels, centers = cv2.kmeans(
            np.asarray(samples, dtype=np.float32),
            2,
            None,
            (
                cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_MAX_ITER,
                20,
                0.2,
            ),
            5,
            cv2.KMEANS_PP_CENTERS,
        )
        ordered = sorted(range(2), key=lambda index: tuple(centers[index].tolist()))
        normalized_label = {ordered[0]: 0, ordered[1]: 1}
        for tracker_id, raw_label in zip(
            tracker_ids, labels.reshape(-1), strict=True
        ):
            self._votes[tracker_id][normalized_label[int(raw_label)]] += 1

        return {
            tracker_id: self._voted_team(tracker_id)
            for tracker_id in tracker_ids
        }

    def _voted_team(self, tracker_id: int) -> str:
        votes = self._votes.get(tracker_id, [0, 0])
        if max(votes) == 0:
            return "unknown"
        return "offense" if votes[0] >= votes[1] else "defense"


class FrameProcessor:
    def __init__(
        self,
        detector: SportsDetector | None = None,
        frame_rate: int = 8,
    ) -> None:
        self.detector = detector or OpenCvSportsDetector()
        self.frame_rate = frame_rate
        self._homography: np.ndarray | None = None
        self._team_assigner = JerseyTeamAssigner()
        self.reset()

    @property
    def calibrated(self) -> bool:
        return self._homography is not None

    def reset(self) -> None:
        self._tracker = sv.ByteTrack(frame_rate=self.frame_rate)
        self._team_assigner.reset()

    def calibrate(self, points: list[dict[str, dict[str, float]]]) -> None:
        if len(points) != 4:
            raise ValueError("Field calibration requires exactly four points")

        source = np.asarray(
            [[point["video"]["x"], point["video"]["y"]] for point in points],
            dtype=np.float32,
        )
        target = np.asarray(
            [[point["field"]["x"], point["field"]["y"]] for point in points],
            dtype=np.float32,
        )
        if abs(cv2.contourArea(source)) < 1 or abs(cv2.contourArea(target)) < 1:
            raise ValueError("Calibration points must form non-zero quadrilaterals")

        homography = cv2.getPerspectiveTransform(source, target)
        if not np.isfinite(homography).all():
            raise ValueError("Calibration produced an invalid homography")
        self._homography = homography

    def process_frame(
        self,
        jpeg: bytes,
        metadata: FrameMetadata,
        session_id: str,
    ) -> dict[str, Any]:
        encoded = np.frombuffer(jpeg, dtype=np.uint8)
        frame = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
        if frame is None:
            raise ValueError("Frame is not a valid JPEG image")

        detections = self.detector.detect(frame)
        tracked = self._track(detections)
        team_assignments = self._team_assigner.assign(frame, tracked)
        objects = [
            self._serialize_detection(
                box=box,
                confidence=float(tracked.confidence[index]),
                class_id=int(tracked.class_id[index]),
                tracker_id=int(tracker_id),
                team=team_assignments.get(int(tracker_id), "unknown"),
            )
            for index, (box, tracker_id) in enumerate(
                zip(tracked.xyxy, tracked.tracker_id, strict=True)
            )
            if tracker_id is not None
        ]

        height, width = frame.shape[:2]
        return {
            "type": "tracking",
            "sport": getattr(self.detector, "sport", "soccer"),
            "sessionId": session_id,
            "sequence": metadata.sequence,
            "timestampMs": metadata.timestamp_ms,
            "processedAtMs": time() * 1000,
            "frame": {"width": width, "height": height},
            "objects": objects,
            "calibrated": self.calibrated,
        }

    def _track(self, batch: DetectionBatch) -> sv.Detections:
        detections = sv.Detections(
            xyxy=batch.xyxy,
            confidence=batch.confidence,
            class_id=batch.class_id,
        )
        return self._tracker.update_with_detections(detections)

    def _serialize_detection(
        self,
        box: np.ndarray,
        confidence: float,
        class_id: int,
        tracker_id: int,
        team: str,
    ) -> dict[str, Any]:
        x1, y1, x2, y2 = (float(value) for value in box)
        is_ball = class_id == BALL_CLASS_ID
        is_official = class_id == OFFICIAL_CLASS_ID
        is_goalkeeper = class_id == GOALKEEPER_CLASS_ID
        role = (
            "ball"
            if is_ball
            else "referee"
            if is_official
            else "goalkeeper"
            if is_goalkeeper
            else "player"
        )
        kind = "ball" if is_ball else "official" if is_official else "player"
        video_point = {
            "x": (x1 + x2) / 2,
            "y": (y1 + y2) / 2 if is_ball else y2,
        }
        result: dict[str, Any] = {
            "id": f"{role}_{tracker_id}",
            "kind": kind,
            "role": role,
            "team": team if kind == "player" and not is_goalkeeper else "unknown",
            "videoPoint": video_point,
            "confidence": float(np.clip(confidence, 0, 1)),
            "box": [x1, y1, x2, y2],
        }
        if self._homography is not None:
            source = np.asarray(
                [[[video_point["x"], video_point["y"]]]],
                dtype=np.float32,
            )
            projected = cv2.perspectiveTransform(source, self._homography)[0, 0]
            if np.isfinite(projected).all():
                result["fieldPoint"] = {
                    "x": float(projected[0]),
                    "y": float(projected[1]),
                }
        return result
