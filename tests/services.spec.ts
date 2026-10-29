import { test, expect } from "@playwright/test";
test("loads the real public NIFC feature service and satellite tiles", async ({
  page,
}) => {
  await page.goto("/map?view=2d");
  await expect(page.getByText("EXPLORER READY")).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page.getByRole("button", { name: "Add NIFC perimeters" }).click();
  await expect(
    page.getByText("NIFC current fire perimeters", { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole("alert")).toHaveCount(0);
  const imagery = page.waitForResponse(
    (r) =>
      r.url().includes("World_Imagery/MapServer/tile/") && r.status() === 200,
    { timeout: 30000 },
  );
  await page.getByRole("button", { name: "Satellite", exact: true }).click();
  await imagery;
  await page.getByLabel("Return to California").click();
  await page.screenshot({ path: "test-results/satellite.png" });
});

test("shows USA Wildfires by default and requests its feature data", async ({
  page,
}) => {
  const metadata = page.waitForResponse(
    (r) =>
      r
        .url()
        .includes(
          "services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/USA_Wildfires_v1/FeatureServer/0?",
        ) && r.status() === 200,
  );
  const features = page.waitForResponse(
    (r) =>
      r.url().includes("USA_Wildfires_v1/FeatureServer/0/query?") &&
      r.status() === 200,
  );
  await page.goto("/map?view=2d");
  await expect(page.getByText("EXPLORER READY")).toBeVisible();
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Hide USA Wildfires", exact: true }),
  ).toBeVisible();
  const info = await (await metadata).json();
  expect(info.type).toBe("Feature Layer");
  expect(info.error).toBeUndefined();
  await features;
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Hide USA Wildfires", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Show USA Wildfires", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Show USA Wildfires", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Hide USA Wildfires", exact: true }),
  ).toBeVisible();
});

test("uses live California geocoding, NOAA smoke, modeled AQI and wind", async ({
  page,
}) => {
  await page.goto("/map?view=2d");
  await expect(page.getByText("EXPLORER READY")).toBeVisible();
  await page.getByLabel("Town or street address").fill("Sacramento");
  await page.getByRole("button", { name: "Search places" }).click();
  await expect(page.locator(".place-matches button").first()).toBeVisible({
    timeout: 25000,
  });
  await page.locator(".place-matches button").first().click();
  await expect(
    page.locator(".condition-card").nth(0).locator("strong"),
  ).toHaveText(/\d+ · /, { timeout: 30000 });
  await expect(
    page.locator(".condition-card").nth(1).locator("strong"),
  ).toHaveText(/\d+\.\d mph/, { timeout: 30000 });
  await expect(
    page.locator(".condition-card").nth(2).locator("strong"),
  ).toHaveText(/No plume mapped|Light|Medium|Heavy/, { timeout: 30000 });
  await expect(page.getByText(/^Checked /)).toBeVisible({ timeout: 30000 });
  await page.getByLabel("Satellite smoke layer", { exact: true }).check();
  await expect(page.locator(".environment-options")).toContainText(
    "Public service loaded",
    { timeout: 30000 },
  );
  await page.getByLabel("Air quality layer", { exact: true }).check();
  await page.getByLabel("Wind layer", { exact: true }).check();
  await expect(
    page
      .locator(".environment-options")
      .getByText("13 city samples", { exact: true }),
  ).toHaveCount(2, { timeout: 30000 });
  await page.screenshot({
    path: "test-results/live-environment-layers.png",
    fullPage: true,
  });
});
