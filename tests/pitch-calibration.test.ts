import { describe, expect, it } from "vitest";
import {
  SOCCER_CALIBRATION_PRESETS,
  buildCalibrationPoints,
} from "../src/features/live-capture/pitch-calibration";

describe("pitch calibration helpers", () => {
  it("builds four video→field pairs for the attacking box preset", () => {
    const landmarks = SOCCER_CALIBRATION_PRESETS.attacking_box.landmarks;
    const points = buildCalibrationPoints(landmarks, [
      { x: 10, y: 20 },
      { x: 200, y: 20 },
      { x: 200, y: 180 },
      { x: 10, y: 180 },
    ]);
    expect(points).toHaveLength(4);
    expect(points[0].field).toEqual({ x: 88.5, y: 13.84 });
    expect(points[3].video).toEqual({ x: 10, y: 180 });
  });
});
