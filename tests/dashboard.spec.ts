import { test, expect } from "@playwright/test";
const sourceUrl = "https://www.fire.ca.gov/incidents";
test("homepage presents verified source figures and opens the map", async ({
  page,
}) => {
  await page.route("**/data/calfire-summary.json", (route) =>
    route.fulfill({
      json: {
        schemaVersion: 1,
        sourceUrl,
        fetchedAt: new Date().toISOString(),
        reportingPeriod: "Statewide",
        metrics: {
          emergencyResponses: 495544,
          wildfires: 6202,
          acresBurned: 338615,
          fatalities: 3,
          structuresDestroyed: 169,
        },
      },
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "California Wildfire Explorer" }),
  ).toBeVisible();
  await expect(
    page.getByText("A clearer picture.", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".dashboard-source-note")).toContainText(
    "and is updated once a day.",
  );
  const heading = (await page
    .getByRole("heading", { name: "California Wildfire Explorer", exact: true })
    .boundingBox())!;
  const dashboard = (await page.locator(".summary-section").boundingBox())!;
  expect(dashboard.x).toBeGreaterThan(heading.x + heading.width);
  await expect(
    page.getByRole("heading", { name: "Statewide at a glance", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "California fire dashboard" }),
  ).toHaveCount(0);
  await expect(page.locator(".dash-bottom")).toHaveCount(0);
  await expect(
    page
      .locator(".dash-header")
      .getByRole("link", { name: "CAL FIRE", exact: true }),
  ).toHaveCount(0);
  expect(
    await page
      .locator(".stat-card h3")
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(18);
  await expect(page.getByText("495,544", { exact: true })).toBeVisible();
  await expect(page.getByText("338,615", { exact: true })).toBeVisible();
  await expect(page.getByText(/Last successful refresh:/)).toBeVisible();
  await expect(
    page.getByText("CALIFORNIA EXPLORER", { exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "test-results/homepage-desktop.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Explore the fire map" }).click();
  await expect(page).toHaveURL(/\/map$/);
  await expect(page.getByText("EXPLORER READY")).toBeVisible();
  const close = (await page.getByLabel("Close sidebar").boundingBox())!;
  const pane = (await page.locator(".sidebar").boundingBox())!;
  expect(close.x).toBeGreaterThan(pane.x + 20);
  expect(close.x + close.width).toBeLessThan(pane.x + pane.width - 10);
  await expect(page.locator(".sidebar-region")).toContainText("California");
  await expect(page.locator(".map-label")).toHaveCount(0);
  await expect(page.locator(".brand small")).toHaveCount(0);
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "California Wildfire Explorer" }),
  ).toBeVisible();
});
test("missing and stale data are clearly labeled and mobile homepage fits", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/data/calfire-summary.json", (route) =>
    route.fulfill({
      json: { schemaVersion: 1, sourceUrl, fetchedAt: null, metrics: null },
    }),
  );
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText(
    "No example figures are shown",
  );
  await expect(page.locator(".stat-card strong").first()).toHaveText("—");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "test-results/homepage-mobile.png",
    fullPage: true,
  });
  await page.unroute("**/data/calfire-summary.json");
  await page.route("**/data/calfire-summary.json", (route) =>
    route.fulfill({
      json: {
        schemaVersion: 1,
        sourceUrl,
        fetchedAt: "2020-01-01T00:00:00Z",
        metrics: {
          emergencyResponses: 1,
          wildfires: 2,
          acresBurned: 3,
          fatalities: 0,
          structuresDestroyed: 0,
        },
      },
    }),
  );
  await page.reload();
  await expect(page.getByRole("status")).toContainText("overdue");
});
