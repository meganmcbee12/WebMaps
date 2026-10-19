import { test, expect } from "@playwright/test";

test("searches a place, measures a real boundary, inspects conditions and toggles modeled layers", async ({
  page,
}) => {
  await page.route("**/api/geocode?**", (route) =>
    route.fulfill({
      json: {
        results: [
          {
            name: "Sacramento, California",
            longitude: -121.49,
            latitude: 38.58,
            source: "Test search provider",
          },
        ],
      },
    }),
  );
  await page.route(
    "**/WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query?**",
    (route) => {
      const url = new URL(route.request().url());
      return route.fulfill({
        json:
          url.searchParams.get("returnIdsOnly") === "true"
            ? { objectIds: [1] }
            : {
                features: [
                  {
                    attributes: {
                      OBJECTID: 1,
                      poly_IncidentName: "Fixture Boundary Fire",
                      poly_DateCurrent: Date.now(),
                      poly_GISAcres: 100,
                    },
                    geometry: {
                      rings: [
                        [
                          [-121.48, 38.57],
                          [-121.46, 38.57],
                          [-121.46, 38.59],
                          [-121.48, 38.59],
                          [-121.48, 38.57],
                        ],
                      ],
                    },
                  },
                ],
              },
      });
    },
  );
  await page.route(
    "**/NOAA_Satellite_Smoke_Detection_*/FeatureServer/0/query?**",
    (route) =>
      route.fulfill({
        json: {
          features: [
            { attributes: { Density: "Heavy", End_: "2026292 1300" } },
          ],
        },
      }),
  );
  for (const host of ["api.open-meteo.com", "air-quality-api.open-meteo.com"])
    await page.route(`https://${host}/**`, (route) => {
      const url = new URL(route.request().url());
      const count = url.searchParams.get("latitude")!.split(",").length;
      const value = host.startsWith("air-quality")
        ? {
            current: { us_aqi: 42, pm2_5: 8, time: "2026-10-19T12:00" },
            current_units: { pm2_5: "µg/m³" },
          }
        : {
            current: {
              wind_speed_10m: 12,
              wind_gusts_10m: 21,
              wind_direction_10m: 270,
              time: "2026-10-19T12:00",
            },
            current_units: { wind_speed_10m: "mp/h" },
          };
      return route.fulfill({
        json: count === 1 ? value : Array.from({ length: count }, () => value),
      });
    });
  await page.goto("/map");
  await expect(page.getByText("EXPLORER READY")).toBeVisible();
  await page.getByLabel("Town or street address").fill("Sacramento");
  await page.getByRole("button", { name: "Search places" }).click();
  await page
    .getByRole("button", {
      name: "Sacramento, California Test search provider",
    })
    .click();
  await expect(page.locator(".nearby-fire-list")).toContainText(
    "Fixture Boundary Fire",
  );
  await expect(page.locator(".nearby-fire-list")).toContainText(
    "0.5 mi to boundary",
  );
  await expect(page.locator(".condition-card").nth(0)).toContainText(
    "42 · Good",
  );
  await expect(page.locator(".condition-card").nth(1)).toContainText(
    "From W (270°)",
  );
  await expect(page.locator(".condition-card").nth(2)).toContainText("Heavy");
  await page.getByRole("button", { name: /Fixture Boundary Fire/ }).click();
  await expect(page.locator(".esri-popup")).toContainText(
    "Approx. distance to boundary",
  );
  await page.getByLabel("Search radius", { exact: true }).selectOption("10");
  await expect(page.locator(".nearby-fire-list")).toContainText(
    "Fixture Boundary Fire",
  );
  await page.getByLabel("Air quality layer", { exact: true }).check();
  await expect(page.locator(".environment-options")).toContainText(
    "13 city samples",
  );
  await page.getByLabel("Wind layer", { exact: true }).check();
  await expect(
    page
      .locator(".environment-options")
      .getByText("13 city samples", { exact: true }),
  ).toHaveCount(2);
  await expect(page.locator(".aqi-key")).toContainText("Hazardous");
  await page.screenshot({
    path: "test-results/nearby-conditions.png",
    fullPage: true,
  });
});

test("empty perimeter results and failed conditions do not report zero pollution or no fires", async ({
  page,
}) => {
  await page.route("**/api/geocode?**", (route) =>
    route.fulfill({
      json: {
        results: [
          {
            name: "Test California town",
            longitude: -121.49,
            latitude: 38.58,
            source: "Fixture",
          },
        ],
      },
    }),
  );
  await page.route(
    "**/WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query?**",
    (route) => route.fulfill({ json: { objectIds: [] } }),
  );
  for (const host of ["api.open-meteo.com", "air-quality-api.open-meteo.com"])
    await page.route(`https://${host}/**`, (route) =>
      route.fulfill({ status: 503, body: "Unavailable" }),
    );
  await page.route(
    "**/NOAA_Satellite_Smoke_Detection_*/FeatureServer/0/query?**",
    (route) => route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("/map");
  await expect(page.getByText("EXPLORER READY")).toBeVisible();
  await page.getByLabel("Town or street address").fill("Test town");
  await page.getByRole("button", { name: "Search places" }).click();
  await page
    .getByRole("button", { name: "Test California town Fixture" })
    .click();
  await expect(
    page.getByText("No reported perimeters were returned", { exact: false }),
  ).toContainText("does not mean there are no fires");
  await expect(page.locator(".condition-card").nth(0)).toContainText(
    "Unavailable",
  );
  await expect(page.locator(".condition-card").nth(1)).toContainText(
    "Unavailable",
  );
  await expect(page.locator(".condition-card").nth(2)).toContainText(
    "Unavailable",
  );
  await page.getByLabel("Wind layer", { exact: true }).check();
  await expect(
    page.getByLabel("Wind layer", { exact: true }),
  ).not.toBeChecked();
  await expect(page.locator(".environment-options")).toContainText(
    "Service unavailable",
  );
});

test("local geocoder endpoint rejects invalid requests without contacting a provider", async ({
  request,
}) => {
  const response = await request.get("/api/geocode?q=a");
  expect(response.status()).toBe(400);
  expect(response.headers()["cache-control"]).toBe("no-store");
  const invalidMethod = await request.post("/api/geocode?q=Sacramento");
  expect(invalidMethod.status()).toBe(405);
});
