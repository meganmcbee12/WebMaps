import test from "node:test";
import assert from "node:assert/strict";
import {
  airMarker,
  fireMarker,
  windMarker,
  smokeTile,
  DEFAULT_SYMBOL_STYLES,
  SYMBOL_OPTIONS,
} from "../../src/map-symbols.ts";
import { aqiCategory } from "../../src/fire-distance.ts";
const svg = (marker) =>
  decodeURIComponent(marker.url.split(",").slice(1).join(","));
test("wind arrows point TO the direction opposite meteorological FROM", () => {
  for (const [from, to] of [
    [0, 180],
    [90, 270],
    [180, 0],
    [270, 90],
    [360, 180],
  ])
    assert.equal(windMarker(12, from, "arrows").angle, to);
  const badge = windMarker(12, 270, "badges");
  assert.equal(badge.angle, 0);
  assert.match(svg(badge), /rotate\(90 52 14\)/);
  assert.match(svg(badge), /12 mph/);
});
test("calm winds use a circle rather than a misleading direction arrow", () => {
  const marker = windMarker(0.6, 270, "arrows");
  assert.equal(marker.angle, 0);
  assert.match(svg(marker), /<circle/);
  assert.doesNotMatch(svg(marker), /<path/);
  assert.match(svg(windMarker(0.6, 270, "badges")), /&lt;1 mph/);
});
test("both air styles use the category of the displayed rounded AQI", () => {
  for (const aqi of [0, 42, 50.4, 50.6, 100.4, 150.6, 201, 301]) {
    const color = aqiCategory(Math.round(aqi)).color;
    assert.equal(airMarker(aqi, "circles").color, color);
    assert.ok(svg(airMarker(aqi, "badges")).includes(color));
    assert.ok(
      svg(airMarker(aqi, "badges")).includes(`>${Math.round(aqi)}</text>`),
    );
  }
});
test("air and wind sample markers sit on opposite sides without changing sample coordinates", () => {
  assert.ok(airMarker(42, "badges").xoffset < 0);
  assert.ok(windMarker(12, 270, "arrows").xoffset > 0);
  assert.ok(windMarker(12, 270, "badges").xoffset > 0);
});
test("fire styles are point symbols and smoke textures encode ordinal density", () => {
  assert.equal(fireMarker("flames").type, "picture-marker");
  assert.equal(fireMarker("points").type, "simple-marker");
  const opacity = (d) =>
    Number(svg({ url: smokeTile(d) }).match(/fill-opacity="([\d.]+)"/)[1]);
  assert.ok(opacity("Light") < opacity("Medium"));
  assert.ok(opacity("Medium") < opacity("Heavy"));
});
test("every default style is available in its dataset selector", () => {
  for (const [layer, style] of Object.entries(DEFAULT_SYMBOL_STYLES))
    assert.ok(SYMBOL_OPTIONS[layer].some((option) => option.value === style));
});

test("3D wind badges show speed without a screen-relative compass arrow", () => {
  const source = svg(windMarker(12, 270, "arrows", true));
  assert.match(source, /12 mph/);
  assert.doesNotMatch(source, /rotate\(/);
});
