// Spherical geodesic distances (miles) to the segments of reported WGS84
// perimeter rings. This measures the boundary, never a centroid or fire point.
const R = 3958.7613;
const rad = (x: number) => (x * Math.PI) / 180;
export type Coordinate = [number, number];
function angular(a: Coordinate, b: Coordinate) {
  const p = rad(a[1]),
    q = rad(b[1]);
  const h =
    Math.sin((q - p) / 2) ** 2 +
    Math.cos(p) * Math.cos(q) * Math.sin(rad(b[0] - a[0]) / 2) ** 2;
  return 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
function bearing(a: Coordinate, b: Coordinate) {
  const d = rad(b[0] - a[0]),
    p = rad(a[1]),
    q = rad(b[1]);
  return Math.atan2(
    Math.sin(d) * Math.cos(q),
    Math.cos(p) * Math.sin(q) - Math.sin(p) * Math.cos(q) * Math.cos(d),
  );
}
export function segmentMiles(p: Coordinate, a: Coordinate, b: Coordinate) {
  const d = angular(a, b);
  if (d < 1e-12) return angular(p, a) * R;
  const dp = angular(a, p),
    theta = bearing(a, p) - bearing(a, b);
  const along = Math.atan2(Math.sin(dp) * Math.cos(theta), Math.cos(dp));
  return along < 0 || along > d
    ? Math.min(angular(p, a), angular(p, b)) * R
    : Math.abs(
        Math.asin(Math.max(-1, Math.min(1, Math.sin(dp) * Math.sin(theta)))),
      ) * R;
}
export function perimeterDistance(point: Coordinate, rings: number[][][]) {
  let boundaryMiles = Infinity,
    inside = false;
  for (const ring of rings) {
    if (ring.length < 3) continue;
    let inRing = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j] as Coordinate,
        b = ring[i] as Coordinate;
      if (![...a.slice(0, 2), ...b.slice(0, 2)].every(Number.isFinite))
        continue;
      boundaryMiles = Math.min(boundaryMiles, segmentMiles(point, a, b));
      if (
        a[1] > point[1] !== b[1] > point[1] &&
        point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
      )
        inRing = !inRing;
    }
    if (inRing) inside = !inside;
  }
  return { boundaryMiles, inside };
}
export function aqiCategory(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    return { label: "Unavailable", color: "#777777" };
  return value <= 50
    ? { label: "Good", color: "#218343" }
    : value <= 100
      ? { label: "Moderate", color: "#a37b00" }
      : value <= 150
        ? { label: "Unhealthy for sensitive groups", color: "#c86717" }
        : value <= 200
          ? { label: "Unhealthy", color: "#b51b2d" }
          : value <= 300
            ? { label: "Very unhealthy", color: "#774181" }
            : { label: "Hazardous", color: "#7e1839" };
}
export function compass(degrees: number) {
  return [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ][Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16];
}
