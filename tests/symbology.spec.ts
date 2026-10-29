import { test, expect } from "@playwright/test";

test("changes dataset symbols in place, updates legends and resets defaults", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const fields = [
    { name: "OBJECTID", type: "esriFieldTypeOID", alias: "ID" },
    ...["IncidentName", "IrwinID", "Density", "Satellite", "Start", "End_"].map(
      (name) => ({
        name,
        type: "esriFieldTypeString",
        alias: name,
        length: 128,
      }),
    ),
  ];
  const geometry = (url: URL, point: boolean) => {
    const mercator = /3857|102100/.test(url.searchParams.get("outSR") || "");
    const xy = (lon: number, lat: number) =>
      mercator
        ? [
            (lon * 20037508.34) / 180,
            (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) * 20037508.34) /
              Math.PI,
          ]
        : [lon, lat];
    if (point) {
      const [x, y] = xy(-121.58, 39.75);
      return { x, y };
    }
    return {
      rings: [
        [
          [-123, 36],
          [-119, 36],
          [-119, 40],
          [-123, 40],
          [-123, 36],
        ].map(([lon, lat]) => xy(lon, lat)),
      ],
    };
  };
  for (const source of ["USA_Wildfires_v1", "NOAA_Satellite_Smoke_Detection_*"])
    await page.route(`**/${source}/FeatureServer/0**`, (route) => {
      const url = new URL(route.request().url()),
        point = source === "USA_Wildfires_v1";
      if (url.pathname.endsWith("/query")) {
        if (url.searchParams.get("returnIdsOnly") === "true")
          return route.fulfill({ json: { objectIds: [1] } });
        if (url.searchParams.get("returnCountOnly") === "true")
          return route.fulfill({ json: { count: 1 } });
        return route.fulfill({
          json: {
            objectIdFieldName: "OBJECTID",
            geometryType: point ? "esriGeometryPoint" : "esriGeometryPolygon",
            spatialReference: {
              wkid: /3857|102100/.test(url.searchParams.get("outSR") || "")
                ? 3857
                : 4326,
            },
            fields,
            features: [
              {
                attributes: {
                  OBJECTID: 1,
                  IncidentName: "Demo fire",
                  IrwinID: "demo",
                  Density: "Medium",
                  Satellite: "Test satellite",
                  Start: "2026292 1200",
                  End_: "2026292 1300",
                },
                geometry: geometry(url, point),
              },
            ],
          },
        });
      }
      return route.fulfill({
        json: {
          id: 0,
          name: point ? "Demo fires" : "Demo smoke",
          type: "Feature Layer",
          currentVersion: 11.3,
          geometryType: point ? "esriGeometryPoint" : "esriGeometryPolygon",
          objectIdField: "OBJECTID",
          fields,
          extent: {
            xmin: -125,
            ymin: 32,
            xmax: -114,
            ymax: 42,
            spatialReference: { wkid: 4326 },
          },
          spatialReference: { wkid: 4326 },
          capabilities: "Query",
          maxRecordCount: 2000,
          supportedQueryFormats: "JSON",
          advancedQueryCapabilities: {
            supportsPagination: true,
            supportsQueryWithDistance: true,
          },
          drawingInfo: {
            renderer: {
              type: "simple",
              symbol: point
                ? {
                    type: "esriSMS",
                    style: "esriSMSCircle",
                    color: [200, 0, 0, 255],
                    size: 12,
                  }
                : {
                    type: "esriSFS",
                    style: "esriSFSSolid",
                    color: [100, 100, 100, 80],
                  },
            },
          },
        },
      });
    });
  let modelRequests = 0;
  for (const host of ["api.open-meteo.com", "air-quality-api.open-meteo.com"])
    await page.route(`https://${host}/**`, (route) => {
      modelRequests++;
      const url = new URL(route.request().url());
      const count = url.searchParams.get("latitude")!.split(",").length;
      const data = host.startsWith("air-quality")
        ? {
            current: { us_aqi: 42, pm2_5: 8, time: "2026-10-29T12:00" },
            current_units: { pm2_5: "µg/m³" },
          }
        : {
            current: {
              wind_speed_10m: 12,
              wind_gusts_10m: 21,
              wind_direction_10m: 270,
              time: "2026-10-29T12:00",
            },
            current_units: { wind_speed_10m: "mp/h" },
          };
      return route.fulfill({
        json: count === 1 ? data : Array.from({ length: count }, () => data),
      });
    });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/map?view=2d");
  await expect(page.getByText("EXPLORER READY")).toBeVisible({
    timeout: 45000,
  });
  await page.getByText("Map symbols", { exact: true }).click();
  for (const [name, value] of [
    ["Fire", "flames"],
    ["Smoke", "clouds"],
    ["Air quality", "badges"],
    ["Wind", "arrows"],
  ])
    await expect(
      page.getByLabel(`${name} symbols`, { exact: true }),
    ).toHaveValue(value);
  await page.getByLabel("Satellite smoke layer", { exact: true }).check();
  await expect(page.locator(".environment-options")).toContainText(
    "Public service loaded",
  );
  await page.getByLabel("Air quality layer", { exact: true }).check();
  await page.getByLabel("Wind layer", { exact: true }).check();
  await expect(
    page
      .locator(".environment-options")
      .getByText("13 city samples", { exact: true }),
  ).toHaveCount(2);
  await page.getByLabel("Close basemaps").click();
  await page.screenshot({ path: "test-results/symbols-default.png" });
  const requestsBefore = modelRequests;
  await page.getByLabel("Fire symbols", { exact: true }).selectOption("points");
  await page
    .getByLabel("Smoke symbols", { exact: true })
    .selectOption("shaded");
  await page
    .getByLabel("Air quality symbols", { exact: true })
    .selectOption("circles");
  await page.getByLabel("Wind symbols", { exact: true }).selectOption("badges");
  await expect(page.getByText(/Wind badges show rounded speed/)).toBeVisible();
  await expect(page.getByLabel("Smoke density legend")).toContainText("Heavy");
  await expect(
    page
      .locator(".environment-options")
      .getByText("13 city samples", { exact: true }),
  ).toHaveCount(2);
  expect(modelRequests).toBe(requestsBefore);
  await page.screenshot({ path: "test-results/symbols-alternatives.png" });
  await page.getByRole("button", { name: "Reset symbols" }).click();
  for (const [name, value] of [
    ["Fire", "flames"],
    ["Smoke", "clouds"],
    ["Air quality", "badges"],
    ["Wind", "arrows"],
  ])
    await expect(
      page.getByLabel(`${name} symbols`, { exact: true }),
    ).toHaveValue(value);
  await expect(page.getByText(/Blue arrows point where/)).toBeVisible();
  await page.getByText("Map symbols", { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/symbols-controls.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByLabel("Wind symbols", { exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByLabel("Wind symbols", { exact: true }),
  ).toBeInViewport();
  expect(errors).toEqual([]);
});
