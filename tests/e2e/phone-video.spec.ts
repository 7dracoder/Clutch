import { chromium, expect, test, type Page } from "@playwright/test";
import { networkInterfaces } from "node:os";

test("the phone page hydrates when opened through the LAN address", async ({
  page,
  baseURL,
}) => {
  const lanAddress = getLanAddress();
  test.skip(!lanAddress, "No LAN interface is available in this environment");
  if (!lanAddress) return;
  if (!baseURL) throw new Error("The E2E base URL is not configured");

  const phoneUrl = new URL("/phone?room=E2ETEST0", baseURL);
  phoneUrl.hostname = lanAddress;

  await page.goto(phoneUrl.href);
  await waitForHydration(page);

  await page.locator('input[type="file"]').setInputFiles({
    name: "lan-clip.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("codec is irrelevant to the hydration check"),
  });
  await expect(page.getByText("lan-clip.mp4", { exact: true })).toBeVisible();
});

test("a phone can start a selected clip when metadata preload is deferred", async ({
  page,
}) => {
  await page.goto("/phone?room=E2ETEST1");
  await waitForHydration(page);

  await page.locator('input[type="file"]').setInputFiles({
    name: "mobile-clip.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("metadata intentionally unavailable"),
  });
  await page.getByLabel("License or permission note").fill("Owner permission");

  await expect(
    page.getByRole("button", { name: "Start phone stream" }),
  ).toBeEnabled();
});

test("a phone loads, plays, and relays frames from a supported clip", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === "webkit",
    "Playwright WebKit on Windows cannot decode the generated media fixture",
  );
  await page.goto("/phone?room=E2ETEST2");
  await waitForHydration(page);
  const video = await recordTestVideo(page);
  let uploadedFrames = 0;

  await page.route("**/api/phone-stream/E2ETEST2/frame", async (route) => {
    if (route.request().method() === "POST") uploadedFrames += 1;
    await route.fulfill({ status: 204 });
  });
  await page.locator('input[type="file"]').setInputFiles({
    name: "supported-clip.mp4",
    mimeType: "video/mp4",
    buffer: video,
  });

  await expect(page.getByRole("status")).toContainText("Video ready");
  await page.getByLabel("License or permission note").fill("Owner permission");
  await page.getByRole("button", { name: "Start phone stream" }).click();

  await expect(page.getByRole("status")).toContainText("streaming");
  await expect.poll(() => uploadedFrames).toBeGreaterThan(0);
  await expect(page.getByRole("status")).not.toContainText("0 frames");
  await page.getByRole("button", { name: "Stop" }).click();
});

async function recordTestVideo(page: Page) {
  const canRecord = await page.evaluate(
    () =>
      typeof Reflect.get(window, "MediaRecorder") === "function" &&
      typeof Reflect.get(HTMLCanvasElement.prototype, "captureStream") ===
        "function",
  );
  if (canRecord) return recordCanvas(page);

  const browser = await chromium.launch();
  try {
    const fixturePage = await browser.newPage();
    return await recordCanvas(fixturePage);
  } finally {
    await browser.close();
  }
}

function getLanAddress() {
  return Object.values(networkInterfaces())
    .flat()
    .find(
      (address) =>
        address && address.family === "IPv4" && !address.internal,
    )?.address;
}

async function waitForHydration(page: Page) {
  await page.waitForFunction(() => {
    const input = document.querySelector('input[type="file"]');
    return Boolean(
      input && Object.keys(input).some((key) => key.startsWith("__reactProps$")),
    );
  });
}

async function recordCanvas(page: Page) {
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 90;
    const context = canvas.getContext("2d");
    if (!context || !canvas.captureStream || !window.MediaRecorder) {
      throw new Error("This browser cannot create the E2E video fixture");
    }

    const mimeType = ["video/mp4;codecs=avc1.42E01E", "video/mp4"].find(
      (type) => MediaRecorder.isTypeSupported(type),
    );
    if (!mimeType) throw new Error("This browser has no supported MP4 recorder");

    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(canvas.captureStream(12), { mimeType });
    recorder.addEventListener("dataavailable", (event) => chunks.push(event.data));
    const stopped = new Promise<void>((resolve) =>
      recorder.addEventListener("stop", () => resolve(), { once: true }),
    );

    recorder.start();
    for (let frame = 0; frame < 12; frame += 1) {
      context.fillStyle = frame % 2 === 0 ? "#f0b429" : "#141414";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    recorder.stop();
    await stopped;

    return Array.from(
      new Uint8Array(await new Blob(chunks, { type: mimeType }).arrayBuffer()),
    );
  });

  return Buffer.from(bytes);
}
