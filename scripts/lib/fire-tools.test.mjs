import test from "node:test";
import assert from "node:assert/strict";
import {
  perimeterDistance,
  segmentMiles,
  aqiCategory,
  compass,
} from "../../src/fire-distance.ts";
import {
  nearbyBoundaries,
  conditionsAt,
  smokeAt,
} from "../../src/place-data.ts";
import { findPlaces } from "../../api/geocode.js";
const square = [
  [-122, 38],
  [-121, 38],
  [-121, 39],
  [-122, 39],
  [-122, 38],
];
test("distance uses a segment interior, not a centroid or vertex", () => {
  const d = segmentMiles([-121.5, 37.99], [-122, 38], [-121, 38]);
  assert.ok(d < 1);
  const result = perimeterDistance([-121.5, 38.01], [square]);
  assert.equal(result.inside, true);
  assert.ok(result.boundaryMiles < 1);
  assert.equal(perimeterDistance([-120.9, 38.5], [square]).inside, false);
});
test("polygon holes are outside the reported footprint", () => {
  const hole = [
    [-121.6, 38.4],
    [-121.4, 38.4],
    [-121.4, 38.6],
    [-121.6, 38.6],
  ];
  assert.equal(perimeterDistance([-121.5, 38.5], [square, hole]).inside, false);
});
test("AQI boundaries and meteorological direction", () => {
  assert.equal(aqiCategory(null).label, "Unavailable");
  assert.equal(aqiCategory(-1).label, "Unavailable");
  for (const [v, label] of [
    [50, "Good"],
    [51, "Moderate"],
    [101, "Unhealthy for sensitive groups"],
    [151, "Unhealthy"],
    [201, "Very unhealthy"],
    [301, "Hazardous"],
  ])
    assert.equal(aqiCategory(v).label, label);
  assert.equal(compass(270), "W");
  assert.equal(compass(360), "N");
});
test("address and town searches filter out other states and preserve encoded input", async () => {
  let requested;
  const town = await findPlaces("LA", async (url) => {
    requested = url;
    return {
      ok: true,
      json: async () => ({
        results: [
          {
            name: "Los Angeles",
            admin1: "California",
            country_code: "US",
            longitude: -118,
            latitude: 34,
          },
          {
            name: "Other",
            admin1: "Texas",
            country_code: "US",
            longitude: -100,
            latitude: 30,
          },
        ],
      }),
    };
  });
  assert.equal(requested.searchParams.get("name"), "Los Angeles");
  assert.equal(town.length, 1);
  const matches = await findPlaces("123 Main & First, CA", async (url) => {
    requested = url;
    return {
      ok: true,
      json: async () => ({
        result: {
          addressMatches: [
            {
              matchedAddress: "CA match",
              addressComponents: { state: "CA" },
              coordinates: { x: -121, y: 38 },
            },
            {
              addressComponents: { state: "NV" },
              coordinates: { x: -115, y: 36 },
            },
          ],
        },
      }),
    };
  });
  assert.equal(matches.length, 1);
  assert.equal(requested.searchParams.get("address"), "123 Main & First, CA");
  await assert.rejects(
    () => findPlaces("Sacramento", async () => ({ ok: false })),
    /unavailable/,
  );
});
const place = {
  name: "Test",
  latitude: 38.01,
  longitude: -121.5,
  source: "Test",
};
async function mocked(fn, run) {
  const previous = globalThis.fetch;
  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () => fn(new URL(url)),
  });
  try {
    await run();
  } finally {
    globalThis.fetch = previous;
  }
}
test("perimeter query uses miles and geometry, sorts boundary distances and excludes distant geometry", async () => {
  await mocked(
    (url) =>
      url.searchParams.get("returnIdsOnly")
        ? { objectIds: [1, 2] }
        : {
            features: [
              {
                attributes: { OBJECTID: 1, poly_IncidentName: "Near boundary" },
                geometry: { rings: [square] },
              },
              {
                attributes: { OBJECTID: 2 },
                geometry: {
                  rings: [
                    [
                      [-100, 30],
                      [-99, 30],
                      [-99, 31],
                      [-100, 31],
                    ],
                  ],
                },
              },
            ],
          },
    async () => {
      const rows = await nearbyBoundaries(place, 25);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].inside, true);
      assert.ok(rows[0].boundaryMiles < 1);
    },
  );
});
test("truncated geometry is an error, never silently reported as no fires", async () => {
  await mocked(
    (url) =>
      url.searchParams.get("returnIdsOnly")
        ? { objectIds: [1] }
        : { exceededTransferLimit: true, features: [] },
    () => assert.rejects(() => nearbyBoundaries(place, 25), /truncated/),
  );
});
test("model data preserves missing values and validates units", async () => {
  await mocked(
    (url) =>
      url.hostname.startsWith("air-quality")
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
          },
    async () => {
      const [v] = await conditionsAt([place]);
      assert.equal(v.aqi, 42);
      assert.equal(v.speed, 12);
      assert.equal(v.airTime, "2026-10-19T12:00:00.000Z");
    },
  );
  await mocked(
    () => ({
      current: { wind_speed_10m: 12 },
      current_units: { wind_speed_10m: "km/h" },
    }),
    async () => {
      const [v] = await conditionsAt([place]);
      assert.equal(v.speed, null);
      assert.equal(v.aqi, null);
      assert.equal(v.pm25, null);
    },
  );
});
test("smoke distinguishes no mapped plume from service failure, selects strongest plume", async () => {
  await mocked(
    () => ({ features: [] }),
    async () => assert.equal((await smokeAt(place)).density, "No plume mapped"),
  );
  await mocked(
    () => ({
      features: [
        { attributes: { Density: "Light", End_: "2026292 1200" } },
        { attributes: { Density: "Heavy", End_: "2026292 1300" } },
      ],
    }),
    async () => {
      const v = await smokeAt(place);
      assert.equal(v.density, "Heavy");
      assert.equal(v.time, "2026-10-19T13:00:00.000Z");
    },
  );
});
