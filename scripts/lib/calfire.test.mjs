import test from "node:test";
import assert from "node:assert/strict";
import { parseCalFireSummary } from "./calfire.mjs";
// Representative fixtures, not live CAL FIRE data and never shipped as figures.
const labels = [
  "Total Emergency Responses",
  "Wildfires",
  "Acres Burned",
  "Fatalities",
  "Structures Destroyed",
];
const values = ["495,544", "6,202", "338,615", "3", "169"];
function fixture(render) {
  return `<html><body><nav>2026</nav><h1>Current Emergency Incidents</h1><div>${labels.map((label, i) => `<article>${render(values[i])}<h2>${label}</h2></article>`).join("")}</div></body></html>`;
}
test("extracts all five figures and records provenance without combining cards", () => {
  const result = parseCalFireSummary(
    fixture((v) => `<strong>${v}</strong>`),
    new Date("2026-10-19T15:00:00Z"),
  );
  assert.deepEqual(result.metrics, {
    emergencyResponses: 495544,
    wildfires: 6202,
    acresBurned: 338615,
    fatalities: 3,
    structuresDestroyed: 169,
  });
  assert.equal(result.fetchedAt, "2026-10-19T15:00:00.000Z");
  assert.equal(result.sourceUrl, "https://www.fire.ca.gov/incidents");
});
test("reads authoritative counter targets instead of animated starting zeros", () => {
  const result = parseCalFireSummary(
    fixture((v) => `<strong data-count="${v.replaceAll(",", "")}">0</strong>`),
  );
  assert.equal(result.metrics.wildfires, 6202);
});
test("rejects an incomplete page rather than mixing in unrelated year or incident numbers", () => {
  assert.throws(
    () =>
      parseCalFireSummary(
        "<h1>2026 Wildfires</h1><p>338,615 acres burned during previous seasons</p>",
      ),
    /missing a verified/,
  );
  assert.throws(
    () =>
      parseCalFireSummary(
        fixture((v) => `<strong>${v}</strong>`).replace(
          "<strong>169</strong>",
          "",
        ),
      ),
    /structuresDestroyed/,
  );
});
test("rejects unpopulated counters but retains genuine zero fatalities", () => {
  assert.throws(
    () => parseCalFireSummary(fixture(() => "<strong>0</strong>")),
    /unpopulated/,
  );
  assert.equal(
    parseCalFireSummary(
      fixture((v) => `<strong>${v === "3" ? "0" : v}</strong>`),
    ).metrics.fatalities,
    0,
  );
});
