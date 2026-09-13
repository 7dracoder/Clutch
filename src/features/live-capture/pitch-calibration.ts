import type { CalibrationPoint } from "@/features/live-capture/types";

export type CalibrationPresetId = "full_pitch" | "attacking_box";

export type CalibrationLandmark = {
  label: string;
  field: { x: number; y: number };
};

/** Soccer landmarks in meters (attacking toward x=105). */
export const SOCCER_CALIBRATION_PRESETS: Record<
  CalibrationPresetId,
  { title: string; hint: string; landmarks: CalibrationLandmark[] }
> = {
  full_pitch: {
    title: "Full pitch",
    hint: "Click the four pitch corners visible in this camera angle.",
    landmarks: [
      { label: "Corner · near left", field: { x: 0, y: 0 } },
      { label: "Corner · far left", field: { x: 105, y: 0 } },
      { label: "Corner · far right", field: { x: 105, y: 68 } },
      { label: "Corner · near right", field: { x: 0, y: 68 } },
    ],
  },
  attacking_box: {
    title: "Attacking box",
    hint: "Best for zoomed final-third feeds. Click the four penalty-area corners.",
    landmarks: [
      { label: "Box · near arc-left", field: { x: 88.5, y: 13.84 } },
      { label: "Box · goal-line left", field: { x: 105, y: 13.84 } },
      { label: "Box · goal-line right", field: { x: 105, y: 54.16 } },
      { label: "Box · near arc-right", field: { x: 88.5, y: 54.16 } },
    ],
  },
};

/** Map a click on an object-fit:contain video to native frame pixels. */
export function videoClickToFramePoint(
  video: HTMLVideoElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  if (!video.videoWidth || !video.videoHeight) return null;
  const rect = video.getBoundingClientRect();
  const videoRatio = video.videoWidth / video.videoHeight;
  const elementRatio = rect.width / Math.max(rect.height, 1);
  let contentWidth = rect.width;
  let contentHeight = rect.height;
  let offsetX = 0;
  let offsetY = 0;
  if (elementRatio > videoRatio) {
    contentWidth = rect.height * videoRatio;
    offsetX = (rect.width - contentWidth) / 2;
  } else {
    contentHeight = rect.width / videoRatio;
    offsetY = (rect.height - contentHeight) / 2;
  }
  const localX = clientX - rect.left - offsetX;
  const localY = clientY - rect.top - offsetY;
  if (
    localX < 0 ||
    localY < 0 ||
    localX > contentWidth ||
    localY > contentHeight
  ) {
    return null;
  }
  return {
    x: (localX / contentWidth) * video.videoWidth,
    y: (localY / contentHeight) * video.videoHeight,
  };
}

export function buildCalibrationPoints(
  landmarks: CalibrationLandmark[],
  videoPoints: Array<{ x: number; y: number }>,
): CalibrationPoint[] {
  if (landmarks.length !== 4 || videoPoints.length !== 4) {
    throw new Error("Pitch calibration requires exactly four points");
  }
  return landmarks.map((landmark, index) => ({
    video: videoPoints[index],
    field: landmark.field,
  }));
}
