import { test, expect } from "@playwright/test";
test("closes and reopens panels with tools on the right and no historic legend", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/map");
  await expect(page.getByText("EXPLORER READY")).toBeVisible({
    timeout: 45000,
  });
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await expect(page.locator(".layer-list")).not.toContainText("Historic");
  await expect(page.locator(".legend")).not.toContainText("Historic");
  const map = (await page.locator(".map-panel").boundingBox())!;
  const tools = (await page
    .getByRole("toolbar", { name: "Map tools" })
    .boundingBox())!;
  expect(map.x + map.width - tools.x - tools.width).toBeLessThan(30);
  await page.getByLabel("Close tools").click();
  await expect(page.getByRole("toolbar", { name: "Map tools" })).toHaveCount(0);
  await page.getByLabel("Open tools").click();
  await expect(page.getByRole("toolbar", { name: "Map tools" })).toBeVisible();
  await page.getByLabel("Close basemaps").click();
  await expect(
    page.getByRole("button", { name: "Streets", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Open basemaps").click();
  await expect(
    page.getByRole("button", { name: "Streets", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Close sidebar").click();
  await page.getByLabel("Open sidebar").click();
  await expect(
    page.getByRole("button", { name: "Layers", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => (await page.locator(".sidebar").boundingBox())!.width)
    .toBeGreaterThan(365);
  await page.screenshot({ path: "test-results/panels-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Close sidebar").click();
  await page.getByLabel("Close basemaps").click();
  await page.getByLabel("Close tools").click();
  await expect(page.getByLabel("Open basemaps")).toBeInViewport();
  await expect(page.getByLabel("Open tools")).toBeInViewport();
  await page.screenshot({ path: "test-results/panels-mobile.png" });
});

test("clicking a fire zooms to it and preserves its popup", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/map");
  await expect(page.getByText("EXPLORER READY")).toBeVisible({
    timeout: 45000,
  });
  await page.getByRole("button", { name: "Fire explorer" }).click();
  await page.getByLabel("Show Historic fire locations").click();
  await page.getByRole("button", { name: "Camp Fire Butte · 2018" }).click();
  await page.waitForTimeout(1800);
  const box = (await page.locator(".map").boundingBox())!;
  async function longitudeOffset() {
    await page.mouse.move(box.x + box.width / 2 + 100, box.y + 200);
    await expect(page.locator(".map-bottom")).toContainText("° W");
    await page.waitForTimeout(100);
    const text = await page.locator(".map-bottom").innerText();
    return Math.abs(Number(text.match(/([\d.]+)° W/)![1]) - 121.58);
  }
  const before = await longitudeOffset();
  // Canvas features can render after the view and camera are ready. Wait for
  // a selectable fire rather than assuming its symbol exists on a fixed frame.
  await expect(async () => {
    await page
      .locator(".map")
      .click({ position: { x: box.width / 2, y: box.height / 2 } });
    await expect(page.locator(".esri-popup")).toContainText("Camp Fire", {
      timeout: 2500,
    });
  }).toPass({ timeout: 20000, intervals: [1000] });
  await page.waitForTimeout(1800);
  const after = await longitudeOffset();
  expect(after).toBeLessThan(before / 2);
  await expect(page.locator(".esri-popup")).toContainText("153,336", {
    timeout: 15000,
  });
});
