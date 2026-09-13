import { expect, test } from "@playwright/test";

test("the capture controls hydrate without React mismatches", async ({
  page,
}) => {
  const hydrationErrors: string[] = [];

  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /hydration|hydrated|server rendered html/i.test(message.text())
    ) {
      hydrationErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    if (/hydration|hydrated|server rendered html/i.test(error.message)) {
      hydrationErrors.push(error.message);
    }
  });

  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /Tap to capture AirServer/i }),
  ).toBeVisible();
  await expect(page.getByText("Live Treasury / Soccer")).toBeVisible();
  await expect(page.getByText(/Pitch Twin/)).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Sports" })).toHaveCount(0);
  await expect.poll(() => hydrationErrors).toEqual([]);
});
