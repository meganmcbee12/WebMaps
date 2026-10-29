import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("3D terrain opens, camera controls work and 2D tools preserve the session", async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // This DEM is a synthetic fixture for scene rendering, never production elevation.
  let elevationTiles = 0;
  const dem = await readFile(
    new URL("./fixtures/synthetic-terrain.lerc", import.meta.url),
  );
  const spatialReference = { wkid: 102100, latestWkid: 3857 };
  const extent = {
    xmin: -20037508.3427892,
    ymin: -20037508.3427892,
    xmax: 20037508.3427892,
    ymax: 20037508.3427892,
    spatialReference,
  };
  await page.route("https://elevation3d.arcgis.com/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes("/tile/")) {
      elevationTiles++;
      return route.fulfill({
        body: dem,
        contentType: "application/octet-stream",
      });
    }
    if (url.pathname.includes("/tilemap/"))
      return route.fulfill({
        json: {
          location: { left: 0, top: 0, width: 32, height: 32 },
          valid: true,
          data: Array(1024).fill(1),
        },
      });
    return route.fulfill({
      json: {
        currentVersion: 11.3,
        name: "Synthetic test elevation",
        serviceDataType: "esriImageServiceDataTypeElevation",
        capabilities: "Image",
        pixelType: "F32",
        bandCount: 1,
        minValues: [400],
        maxValues: [2000],
        meanValues: [1200],
        extent,
        fullExtent: extent,
        spatialReference,
        tileInfo: {
          rows: 256,
          cols: 256,
          dpi: 96,
          format: "LERC",
          origin: { x: -20037508.3427892, y: 20037508.3427892 },
          spatialReference,
          lods: Array.from({ length: 21 }, (_, level) => ({
            level,
            resolution: 156543.03392804097 / 2 ** level,
            scale: 591657527.591555 / 2 ** level,
          })),
        },
      },
    });
  });
  let imageryTiles = 0;
  // Node uses the trusted platform CA. Forward only these approved public basemap
  // responses without disabling browser or Node HTTPS verification.
  await page.route("https://*.arcgisonline.com/**", async (route) => {
    try {
      const url = route.request().url();
      const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (r.ok && url.includes("/tile/")) imageryTiles++;
      await route.fulfill({
        status: r.status,
        contentType:
          r.headers.get("content-type") || "application/octet-stream",
        headers: {
          "access-control-allow-origin":
            r.headers.get("access-control-allow-origin") || "*",
        },
        body: Buffer.from(await r.arrayBuffer()),
      });
    } catch {
      await route.fulfill({ status: 503, body: "Basemap unavailable" });
    }
  });
  const fields = [
    { name: "OBJECTID", type: "esriFieldTypeOID", alias: "ID" },
    ...["IncidentName", "IrwinID", "poly_IncidentName", "poly_IRWINID"].map(
      (name) => ({
        name,
        type: "esriFieldTypeString",
        length: 128,
        alias: name,
      }),
    ),
  ];
  for (const [service, point] of [
    ["USA_Wildfires_v1", true],
    ["WFIGS_Interagency_Perimeters_Current", false],
  ] as const)
    await page.route(`**/${service}/FeatureServer/0**`, (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/query")) {
        if (url.searchParams.get("returnIdsOnly") === "true")
          return route.fulfill({ json: { objectIds: point ? [1] : [] } });
        if (url.searchParams.get("returnCountOnly") === "true")
          return route.fulfill({ json: { count: point ? 1 : 0 } });
        return route.fulfill({
          json: {
            objectIdFieldName: "OBJECTID",
            geometryType: point ? "esriGeometryPoint" : "esriGeometryPolygon",
            spatialReference: { wkid: 4326 },
            fields,
            features: point
              ? [
                  {
                    attributes: {
                      OBJECTID: 1,
                      IrwinID: "scene-fire",
                      IncidentName: "Scene test fire",
                      ModifiedOnDateTime: Date.now(),
                    },
                    geometry: { x: -118.02, y: 34.255 },
                  },
                ]
              : [],
          },
        });
      }
      return route.fulfill({
        json: {
          id: 0,
          name: "Test incidents",
          type: "Feature Layer",
          geometryType: point ? "esriGeometryPoint" : "esriGeometryPolygon",
          objectIdField: "OBJECTID",
          fields,
          spatialReference: { wkid: 4326 },
          extent: {
            xmin: -125,
            ymin: 32,
            xmax: -114,
            ymax: 42,
            spatialReference: { wkid: 4326 },
          },
          capabilities: "Query",
          maxRecordCount: 2000,
          supportedQueryFormats: "JSON",
          advancedQueryCapabilities: {
            supportsPagination: true,
            supportsQueryWithDistance: true,
          },
        },
      });
    });
  await page.route("**/api/geocode?**", (route) =>
    route.fulfill({
      json: {
        results: [
          {
            name: "San Gabriel Mountains, California",
            longitude: -118.03,
            latitude: 34.25,
            source: "Test place",
          },
        ],
      },
    }),
  );
  for (const host of ["api.open-meteo.com", "air-quality-api.open-meteo.com"])
    await page.route(`https://${host}/**`, (route) => {
      const count = new URL(route.request().url()).searchParams
        .get("latitude")!
        .split(",").length;
      const current = host.startsWith("air-quality")
        ? { us_aqi: 42, pm2_5: 8, time: "2026-10-29T12:00" }
        : {
            wind_speed_10m: 12,
            wind_gusts_10m: 21,
            wind_direction_10m: 270,
            time: "2026-10-29T12:00",
          };
      const value = {
        current,
        current_units: { pm2_5: "µg/m³", wind_speed_10m: "mp/h" },
      };
      return route.fulfill({
        json: count === 1 ? value : Array.from({ length: count }, () => value),
      });
    });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/map");
  await expect(page.getByText("EXPLORER READY")).toBeVisible({
    timeout: 45000,
  });
  await expect(page.locator(".map")).toHaveAttribute("data-view-mode", "3d");
  await expect(
    page.getByRole("button", { name: "3D terrain", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Satellite", exact: true }),
  ).toHaveClass("selected");
  await expect.poll(() => imageryTiles, { timeout: 30000 }).toBeGreaterThan(0);
  await page.getByLabel("Close sidebar").click();
  await page.getByLabel("Close basemaps").click();
  const modeBox = (await page
    .getByRole("button", { name: "2D map", exact: true })
    .boundingBox())!;
  const reopenBox = (await page.getByLabel("Open sidebar").boundingBox())!;
  expect(modeBox.x).toBeGreaterThan(reopenBox.x + reopenBox.width);
  const mapBox = (await page.locator(".map").boundingBox())!;
  let sampleStep = 0;
  await expect
    .poll(
      async () => {
        await page.mouse.move(
          mapBox.x + mapBox.width * 0.5 + (sampleStep++ % 3),
          mapBox.y + mapBox.height * 0.6,
        );
        const text = await page.locator(".map-bottom").innerText();
        const match = text.match(/Elevation ([\d,]+) m/);
        return match ? Number(match[1].replaceAll(",", "")) : 0;
      },
      { timeout: 20000 },
    )
    .toBeGreaterThan(100);

  expect(elevationTiles).toBeGreaterThan(0);
  await page.screenshot({ path: "test-results/terrain-3d.png" });
  await page.getByText("View controls", { exact: true }).click();
  await page.getByLabel("Camera tilt").focus();
  await page.getByLabel("Camera tilt").press("Home");
  await page.getByLabel("Camera tilt").press("ArrowRight");
  await expect(page.getByLabel("Camera tilt")).toHaveValue("1");
  await page.getByLabel("Rotate view right").click();
  await page.getByLabel("Face north").click();
  await expect(page.locator(".camera-heading")).toHaveText("Heading 0°");
  await page.getByLabel("Open sidebar").click();
  await page.getByLabel("Town or street address").fill("San Gabriel");
  await page.getByRole("button", { name: "Search places" }).click();
  await page
    .getByRole("button", {
      name: "San Gabriel Mountains, California Test place",
    })
    .click();
  await expect(page.locator(".nearby-fire-list")).toContainText(
    "Scene test fire",
  );
  await page.getByRole("button", { name: /Scene test fire/ }).click();
  await expect(page.locator(".esri-popup")).toContainText(
    "Approx. distance to reported location",
    { timeout: 15000 },
  );
  await page.getByText("Map symbols", { exact: true }).click();
  await expect(
    page.getByLabel("Smoke symbols", { exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel("Wind symbols", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "2D map", exact: true }).click();
  await expect(page.locator(".map")).toHaveAttribute("data-view-mode", "2d");
  await expect(page.locator(".chosen-place")).toContainText(
    "San Gabriel Mountains",
  );
  await expect(page.locator(".nearby-fire-list")).toContainText(
    "Scene test fire",
  );
  await expect(page.getByLabel("Wind symbols", { exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "3D terrain", exact: true }).click();
  await expect(page.locator(".map")).toHaveAttribute("data-view-mode", "3d");
  await page.getByLabel("Measure distance", { exact: true }).click();
  await expect(page.locator(".map")).toHaveAttribute("data-view-mode", "2d");
  await expect(page.locator(".esri-distance-measurement-2d")).toBeVisible();
  await expect(page.locator(".chosen-place")).toContainText(
    "San Gabriel Mountains",
  );
  await page.getByLabel("Draw on map").click();
  await page.getByRole("button", { name: "Draw a point" }).click();
  await page.locator(".map").click({ position: { x: 300, y: 350 } });
  await expect(page.locator(".esri-sketch")).toContainText("1");
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await expect(
    page.locator(".layer").filter({ hasText: "My drawings" }),
  ).toContainText("1 feature");
  await page.getByRole("button", { name: "3D terrain", exact: true }).click();
  await expect(page.locator(".map")).toHaveAttribute("data-view-mode", "3d");
  await page.getByLabel("Draw on map").click();
  await expect(page.locator(".map")).toHaveAttribute("data-view-mode", "2d");
  await expect(page.locator(".esri-sketch")).toBeVisible();
  await expect(
    page.locator(".layer").filter({ hasText: "My drawings" }),
  ).toContainText("1 feature");
  await page.getByRole("button", { name: "3D terrain", exact: true }).click();
  await expect(page.locator(".map")).toHaveAttribute("data-view-mode", "3d");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Close sidebar").click();
  await expect(
    page.getByRole("button", { name: "2D map", exact: true }),
  ).toBeInViewport();
  await page.getByText("View controls", { exact: true }).click();
  await expect(page.getByLabel("Camera tilt")).toBeInViewport();
  expect(errors).toEqual([]);
});
