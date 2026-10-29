import { test, expect } from "@playwright/test";
test("loads map, explores fires, changes basemaps and manages imported GeoJSON", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/map?view=2d");
  await expect(page.getByText("EXPLORER READY")).toBeVisible({
    timeout: 45000,
  });
  await page.getByRole("button", { name: "Fire explorer" }).click();
  await expect(page.getByLabel("Show Historic fire locations")).toBeVisible();
  await page.getByLabel("Show Historic fire locations").click();
  await expect(page.getByLabel("Hide Historic fire locations")).toBeVisible();
  await page.getByRole("button", { name: "Fire explorer" }).click();
  await page.getByLabel("Search historic fires").fill("Camp");
  await page.getByRole("button", { name: "Camp Fire Butte · 2018" }).click();
  await expect(page.getByText("153,336")).toBeVisible();
  await page.getByRole("button", { name: "Satellite", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Satellite", exact: true }),
  ).toHaveClass("selected");
  await page.getByRole("button", { name: "Streets", exact: true }).click();
  // Let the SDK's fire-location navigation finish before sending a map click.
  await page.waitForTimeout(1800);
  await page.getByLabel("Distance to historic fire").click();
  await expect(page.locator(".map")).toHaveAttribute(
    "data-tool-ready",
    "nearby",
  );
  await page.locator(".map").click({ position: { x: 350, y: 350 } });
  await expect(page.getByText(/mi to .* reference point/)).toBeVisible();
  await page.getByLabel("Measure distance", { exact: true }).click();
  await expect(page.locator(".esri-distance-measurement-2d")).toBeVisible();
  await page.getByLabel("Draw on map").click();
  await expect(page.locator(".esri-sketch")).toBeVisible();
  await page.getByLabel("Explore features").click();
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page.getByRole("button", { name: "Add a data layer" }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "test.geojson",
    mimeType: "application/geo+json",
    buffer: Buffer.from(
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { name: "Test point" },
            geometry: { type: "Point", coordinates: [-121, 38] },
          },
        ],
      }),
    ),
  });
  await expect(page.getByText("test.geojson", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  await page.getByLabel("Remove test.geojson").click();
  await expect(page.getByText("test.geojson", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  expect(errors).toEqual([]);
});
test("mobile sidebar and invalid import feedback", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/map?view=2d");
  await page.getByLabel("Close sidebar").click();
  await expect(page.getByLabel("Open sidebar")).toBeVisible();
  await page.getByLabel("Open sidebar").click();
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page.getByRole("button", { name: "Add a data layer" }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from("{broken"),
  });
  await expect(page.getByRole("alert")).toContainText("valid GeoJSON");
  await page.getByLabel("Close dialog").click();
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
});
test("inspects a fire popup and completes map measurements and a drawing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/map?view=2d");
  await expect(page.getByText("EXPLORER READY")).toBeVisible();
  await page.getByRole("button", { name: "Fire explorer" }).click();
  await page.getByLabel("Show Historic fire locations").click();
  await page.getByRole("button", { name: "Camp Fire Butte · 2018" }).click();
  // Wait for the SDK's animated navigation to settle before clicking the centered feature.
  await page.waitForTimeout(1800);
  const map = page.locator(".map");
  const box = (await map.boundingBox())!;
  await map.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect(page.locator(".esri-popup")).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".esri-popup")).toContainText("Camp Fire");
  await expect(page.locator(".esri-popup")).toContainText("153,336");
  await page.getByLabel("Measure distance", { exact: true }).click();
  await expect(map).toHaveAttribute("data-tool-ready", "distance");
  // GIS tools sample pointer positions on animation frames. Move, let the
  // view render, then click as a user would instead of teleporting clicks.
  async function vertex(x: number, y: number, finish = false) {
    await page.mouse.move(box.x + x, box.y + y);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await page.mouse.click(box.x + x, box.y + y, {
      clickCount: finish ? 2 : 1,
      delay: 150,
    });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
  }
  await vertex(200, 350);
  await vertex(400, 450, true);
  await expect(
    page
      .locator(".esri-distance-measurement-2d")
      .getByRole("button", { name: "New measurement" }),
  ).toBeVisible();
  await expect(page.locator(".esri-distance-measurement-2d")).toContainText(
    "mi",
  );
  await page.getByLabel("Measure area", { exact: true }).click();
  await expect(map).toHaveAttribute("data-tool-ready", "area");
  await vertex(200, 350);
  await vertex(300, 350);
  await vertex(300, 450);
  await vertex(200, 450, true);
  await expect(
    page
      .locator(".esri-area-measurement-2d")
      .getByRole("button", { name: "New measurement" }),
  ).toBeVisible();
  await expect(page.locator(".esri-area-measurement-2d")).toContainText("mi");
  await page.getByLabel("Draw on map").click();
  await page.getByRole("button", { name: "Draw a point" }).click();
  await map.click({ position: { x: 250, y: 400 } });
  await expect(page.locator(".esri-sketch")).toContainText("1");
});
