"""Pluggable detectors for Clutch's sport-specific vision worker.

The OpenCV detector is a dependency-only fallback. ``RFDetrSoccerDetector``
loads an optional research checkpoint locally; it never downloads weights at
runtime. The configured SoccerNet checkpoint is research-only because its
training dataset forbids commercial use.
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

import cv2
import numpy as np


PLAYER_CLASS_ID = 0
BALL_CLASS_ID = 1
OFFICIAL_CLASS_ID = 2
GOALKEEPER_CLASS_ID = 3

SOCCER_MODEL_REPO = "julianzu9612/RFDETR-Soccernet"
SOCCER_MODEL_REVISION = "1e388b922a64f2be39cbf1925e5fd5fc4f7dd771"


@dataclass(frozen=True)
class DetectionBatch:
    xyxy: np.ndarray
    confidence: np.ndarray
    class_id: np.ndarray


class SportsDetector(Protocol):
    name: str
    sport: str
    research_only: bool

    def detect(self, frame: np.ndarray) -> DetectionBatch:
        """Return tracked-role detections for one BGR frame."""


def empty_detection_batch() -> DetectionBatch:
    return DetectionBatch(
        xyxy=np.empty((0, 4), dtype=np.float32),
        confidence=np.empty((0,), dtype=np.float32),
        class_id=np.empty((0,), dtype=int),
    )


class OpenCvSportsDetector:
    """License-safe fallback for integration testing, not accuracy evaluation."""

    research_only = False

    def __init__(self, sport: str = "soccer") -> None:
        self.sport = sport
        self.name = f"opencv-hog-{sport}-ball"
        self._hog = cv2.HOGDescriptor()
        self._hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())

    def detect(self, frame: np.ndarray) -> DetectionBatch:
        boxes: list[list[float]] = []
        scores: list[float] = []
        classes: list[int] = []

        player_boxes, player_scores = self._detect_players(frame)
        boxes.extend(player_boxes)
        scores.extend(player_scores)
        classes.extend([PLAYER_CLASS_ID] * len(player_boxes))

        if self.sport == "basketball":
            ball_boxes, ball_scores = self._detect_orange_ball(frame)
        else:
            ball_boxes, ball_scores = self._detect_soccer_ball(frame)
        boxes.extend(ball_boxes)
        scores.extend(ball_scores)
        classes.extend([BALL_CLASS_ID] * len(ball_boxes))

        if not boxes:
            return empty_detection_batch()

        return DetectionBatch(
            xyxy=np.asarray(boxes, dtype=np.float32),
            confidence=np.asarray(scores, dtype=np.float32),
            class_id=np.asarray(classes, dtype=int),
        )

    def _detect_players(
        self, frame: np.ndarray
    ) -> tuple[list[list[float]], list[float]]:
        scale = min(1.0, 960 / max(frame.shape[:2]))
        working = (
            cv2.resize(frame, None, fx=scale, fy=scale)
            if scale < 1.0
            else frame
        )
        rectangles, weights = self._hog.detectMultiScale(
            working,
            winStride=(8, 8),
            padding=(8, 8),
            scale=1.04,
        )
        if len(rectangles) == 0:
            return [], []

        xywh = [[int(x), int(y), int(w), int(h)] for x, y, w, h in rectangles]
        confidence = [
            float(np.clip(0.45 + float(weight) * 0.2, 0.45, 0.95))
            for weight in np.asarray(weights).reshape(-1)
        ]
        selected = cv2.dnn.NMSBoxes(xywh, confidence, 0.4, 0.35)
        selected_indices = np.asarray(selected).reshape(-1) if len(selected) else []

        boxes: list[list[float]] = []
        scores: list[float] = []
        for index in selected_indices:
            x, y, width, height = xywh[int(index)]
            boxes.append(
                [
                    x / scale,
                    y / scale,
                    (x + width) / scale,
                    (y + height) / scale,
                ]
            )
            scores.append(confidence[int(index)])
        return boxes, scores

    @staticmethod
    def _detect_orange_ball(
        frame: np.ndarray,
    ) -> tuple[list[list[float]], list[float]]:
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        mask = cv2.inRange(
            hsv,
            np.array([5, 100, 80], dtype=np.uint8),
            np.array([25, 255, 255], dtype=np.uint8),
        )
        return OpenCvSportsDetector._ball_candidates(frame, mask)

    @staticmethod
    def _detect_soccer_ball(
        frame: np.ndarray,
    ) -> tuple[list[list[float]], list[float]]:
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        # Low-saturation, high-value pixels are plausible white ball regions.
        mask = cv2.inRange(
            hsv,
            np.array([0, 0, 150], dtype=np.uint8),
            np.array([180, 90, 255], dtype=np.uint8),
        )
        mask = cv2.morphologyEx(
            mask,
            cv2.MORPH_OPEN,
            np.ones((2, 2), dtype=np.uint8),
        )
        return OpenCvSportsDetector._ball_candidates(frame, mask, max_count=1)

    @staticmethod
    def _ball_candidates(
        frame: np.ndarray,
        mask: np.ndarray,
        max_count: int = 3,
    ) -> tuple[list[list[float]], list[float]]:
        contours, _ = cv2.findContours(
            mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )
        candidates: list[tuple[float, list[float], float]] = []
        frame_area = frame.shape[0] * frame.shape[1]
        for contour in contours:
            area = float(cv2.contourArea(contour))
            if area < frame_area * 0.000003 or area > frame_area * 0.002:
                continue
            perimeter = float(cv2.arcLength(contour, True))
            if perimeter <= 0:
                continue
            circularity = 4 * np.pi * area / (perimeter * perimeter)
            if circularity < 0.45:
                continue
            x, y, width, height = cv2.boundingRect(contour)
            aspect = width / max(height, 1)
            if not 0.55 <= aspect <= 1.8:
                continue
            confidence = float(np.clip(0.35 + circularity * 0.5, 0.35, 0.88))
            candidates.append(
                (
                    area,
                    [float(x), float(y), float(x + width), float(y + height)],
                    confidence,
                )
            )

        candidates.sort(key=lambda candidate: candidate[2], reverse=True)
        return (
            [candidate[1] for candidate in candidates[:max_count]],
            [candidate[2] for candidate in candidates[:max_count]],
        )


class RFDetrSoccerDetector:
    """Adapter for the pinned RF-DETR SoccerNet research checkpoint."""

    name = "soccer-rfdetr-soccernet"
    sport = "soccer"
    research_only = True
    _source_to_clutch_class = {
        0: BALL_CLASS_ID,
        1: PLAYER_CLASS_ID,
        2: OFFICIAL_CLASS_ID,
        3: GOALKEEPER_CLASS_ID,
    }

    def __init__(
        self,
        model_path: str | Path,
        device: str = "auto",
        thresholds: dict[int, float] | None = None,
    ) -> None:
        checkpoint_path = Path(model_path)
        if not checkpoint_path.is_file():
            raise FileNotFoundError(
                f"Soccer checkpoint not found at {checkpoint_path}. "
                "Run npm.cmd run vision:soccer:install."
            )

        try:
            import torch
            from PIL import Image
            from rfdetr import RFDETRLarge
        except ImportError as error:
            raise RuntimeError(
                "RF-DETR dependencies are not installed. "
                "Run npm.cmd run vision:soccer:install."
            ) from error

        resolved_device = (
            "cuda" if device == "auto" and torch.cuda.is_available() else device
        )
        if resolved_device == "auto":
            resolved_device = "cpu"
        if resolved_device == "cuda" and not torch.cuda.is_available():
            raise RuntimeError("SOCCER_DEVICE=cuda but CUDA is not available")

        self.model_path = checkpoint_path
        self.device = resolved_device
        self.thresholds = thresholds or {
            # The ball occupies very few pixels in wide broadcast footage.
            BALL_CLASS_ID: 0.25,
            PLAYER_CLASS_ID: 0.5,
            OFFICIAL_CLASS_ID: 0.6,
            GOALKEEPER_CLASS_ID: 0.5,
        }
        self._torch = torch
        self._image_type = Image
        # The pinned checkpoint's args.pretrain_weights is
        # ``rf-detr-large.pth`` (hidden_dim=384). Initializing RFDETRBase
        # creates a 256-wide network and fails with state-dict size errors.
        model = RFDETRLarge()
        model.model.model.reinitialize_detection_head(4)
        checkpoint: Any = torch.load(
            str(checkpoint_path),
            map_location=resolved_device,
            weights_only=False,
        )
        state = checkpoint.get("model", checkpoint.get("model_state_dict", checkpoint))
        try:
            model.model.model.load_state_dict(state)
        except RuntimeError as error:
            raise RuntimeError(
                "The soccer checkpoint is incompatible with RF-DETR Large. "
                "Re-run npm.cmd run vision:soccer:install to restore the "
                "pinned model and dependencies."
            ) from error
        model.model.model.to(resolved_device)
        model.model.model.eval()
        self._model = model

    def detect(self, frame: np.ndarray) -> DetectionBatch:
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        image = self._image_type.fromarray(rgb)
        with self._torch.no_grad():
            detections = self._model.predict(
                image, threshold=min(self.thresholds.values())
            )
        if detections is None or len(detections) == 0:
            return empty_detection_batch()

        boxes: list[list[float]] = []
        scores: list[float] = []
        classes: list[int] = []
        for index in range(len(detections)):
            source_class = int(detections.class_id[index])
            clutch_class = self._source_to_clutch_class.get(source_class)
            if clutch_class is None:
                continue
            confidence = float(detections.confidence[index])
            if confidence < self.thresholds[clutch_class]:
                continue
            boxes.append([float(value) for value in detections.xyxy[index]])
            scores.append(confidence)
            classes.append(clutch_class)

        if not boxes:
            return empty_detection_batch()
        return DetectionBatch(
            xyxy=np.asarray(boxes, dtype=np.float32),
            confidence=np.asarray(scores, dtype=np.float32),
            class_id=np.asarray(classes, dtype=int),
        )
