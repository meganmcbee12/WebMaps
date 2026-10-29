import test from "node:test";
import assert from "node:assert/strict";
import {
  initialViewMode,
  toolNeeds2D,
  INITIAL_CAMERA,
  TERRAIN_PLACES,
  ELEVATION_URL,
} from "../../src/scene-config.ts";
test("terrain is the default and the 2D link remains explicit", () => {
  assert.equal(initialViewMode(""), "3d");
  assert.equal(initialViewMode("?view=2d"), "2d");
  assert.equal(initialViewMode("?view=invalid"), "3d");
});
test("only drawing and measurement require 2D", () => {
  for (const name of ["draw", "distance", "area"])
    assert.equal(toolNeeds2D(name), true);
  for (const name of ["explore", "place", "nearby"])
    assert.equal(toolNeeds2D(name), false);
});
test("mountain presets use valid California coordinates and bounded tilt", () => {
  assert.ok(INITIAL_CAMERA.tilt > 0 && INITIAL_CAMERA.tilt <= 75);
  assert.ok(INITIAL_CAMERA.position.z > 3000);
  assert.equal(new URL(ELEVATION_URL).hostname, "elevation3d.arcgis.com");
  for (const place of TERRAIN_PLACES) {
    assert.ok(place.longitude >= -125 && place.longitude <= -114);
    assert.ok(place.latitude >= 32 && place.latitude <= 43);
  }
});
