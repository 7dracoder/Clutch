from pathlib import Path
from contextlib import nullcontext

import numpy as np
import pytest

from services.vision.detector import (
    BALL_CLASS_ID,
    GOALKEEPER_CLASS_ID,
    OFFICIAL_CLASS_ID,
    PLAYER_CLASS_ID,
    RFDetrSoccerDetector,
)


def test_rfdetr_source_roles_map_to_clutch_roles() -> None:
    assert RFDetrSoccerDetector._source_to_clutch_class == {
        0: BALL_CLASS_ID,
        1: PLAYER_CLASS_ID,
        2: OFFICIAL_CLASS_ID,
        3: GOALKEEPER_CLASS_ID,
    }


def test_rfdetr_reports_actionable_missing_checkpoint(tmp_path: Path) -> None:
    missing = tmp_path / "checkpoint.pth"
    with pytest.raises(FileNotFoundError, match="vision:soccer:install"):
        RFDetrSoccerDetector(missing)


def test_rfdetr_applies_class_mapping_and_thresholds() -> None:
    class FakeDetections:
        class_id = np.asarray([0, 1, 2, 3])
        confidence = np.asarray([0.45, 0.49, 0.7, 0.8])
        xyxy = np.asarray(
            [[1, 1, 2, 2], [2, 2, 3, 3], [3, 3, 4, 4], [4, 4, 5, 5]],
            dtype=np.float32,
        )

        def __len__(self):
            return 4

    class FakeModel:
        def predict(self, image, threshold):
            assert threshold == 0.25
            return FakeDetections()

    class FakeImage:
        @staticmethod
        def fromarray(array):
            return array

    class FakeTorch:
        @staticmethod
        def no_grad():
            return nullcontext()

    detector = RFDetrSoccerDetector.__new__(RFDetrSoccerDetector)
    detector.thresholds = {
        BALL_CLASS_ID: 0.25,
        PLAYER_CLASS_ID: 0.5,
        OFFICIAL_CLASS_ID: 0.6,
        GOALKEEPER_CLASS_ID: 0.5,
    }
    detector._model = FakeModel()
    detector._image_type = FakeImage
    detector._torch = FakeTorch

    result = detector.detect(np.zeros((10, 10, 3), dtype=np.uint8))
    assert result.class_id.tolist() == [
        BALL_CLASS_ID,
        OFFICIAL_CLASS_ID,
        GOALKEEPER_CLASS_ID,
    ]
