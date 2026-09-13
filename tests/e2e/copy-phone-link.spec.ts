import { expect, test } from "@playwright/test";

test("Command Center uses a centered AirServer capture surface", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /Tap to capture AirServer/i }),
  ).toBeVisible();
  await expect(page.getByText("AirServer Live")).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect AirServer" })).toHaveCount(
    0,
  );
  await expect(page.getByText("Footage source URL")).toHaveCount(0);
  await expect(page.getByText("License or permission note")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Sports" })).toHaveCount(0);
});
