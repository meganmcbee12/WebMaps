import { aqiCategory } from "./fire-distance.ts";
export type SymbolLayer = "fire" | "smoke" | "air" | "wind";
export const DEFAULT_SYMBOL_STYLES: Record<SymbolLayer, string> = {
  fire: "flames",
  smoke: "clouds",
  air: "badges",
  wind: "arrows",
};
export const SYMBOL_OPTIONS: Record<
  SymbolLayer,
  { value: string; label: string }[]
> = {
  fire: [
    { value: "flames", label: "Flame icons" },
    { value: "points", label: "Simple circles" },
  ],
  smoke: [
    { value: "clouds", label: "Smoke cloud pattern" },
    { value: "shaded", label: "Shaded plume areas" },
  ],
  air: [
    { value: "badges", label: "Lungs + AQI number" },
    { value: "circles", label: "AQI color circles" },
  ],
  wind: [
    { value: "arrows", label: "Direction arrows" },
    { value: "badges", label: "Wind icon + mph" },
  ],
};
const svg = (body: string, width = 64, height = 64) =>
  `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`)}`;
const flame =
  '<path d="M34 8c3 13 15 16 15 29a17 17 0 1 1-34 0c0-7 4-12 10-18-1 8 2 12 5 13 4-6 6-14 4-24Z" fill="#ea5729" stroke="white" stroke-width="3" stroke-linejoin="round"/><path d="M32 33c1 7 8 10 7 16-1 8-14 8-15 0 0-6 5-9 8-16Z" fill="#ffdb71"/>';
const windLines =
  '<path d="M9 17h21c9 0 8-12 0-10M9 24h31c10 0 10 13 1 13M9 31h13" fill="none" stroke="#234d73" stroke-width="3" stroke-linecap="round"/>';
const arrow =
  '<path d="M32 53V12m-12 13 12-13 12 13" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
export function fireMarker(style: string) {
  return style === "points"
    ? {
        type: "simple-marker" as const,
        style: "circle" as const,
        size: 14,
        color: "#d84422",
        outline: { color: "white", width: 2 },
      }
    : {
        type: "picture-marker" as const,
        url: svg(flame),
        width: 28,
        height: 28,
      };
}
export function airMarker(aqi: number, style: string) {
  const color = aqiCategory(aqi).color;
  if (style === "circles")
    return {
      type: "simple-marker" as const,
      style: "circle" as const,
      size: 19,
      xoffset: -18,
      color,
      outline: { color: "white", width: 2 },
    };
  const number = Math.round(aqi);
  return {
    type: "picture-marker" as const,
    width: 36,
    height: 42,
    xoffset: -18,
    url: svg(
      `<rect x="3" y="2" width="58" height="60" rx="16" fill="${color}" stroke="white" stroke-width="3"/><g fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M32 9v13m0-4-6 5m6-5 6 5M27 17c-3-7-7-4-11 5s-4 14 2 14c4 0 9-3 9-7Zm10 0c3-7 7-4 11 5s4 14-2 14c-4 0-9-3-9-7Z"/></g><text x="32" y="54" text-anchor="middle" fill="white" font-family="sans-serif" font-weight="bold" font-size="${number > 999 ? 15 : 19}">${number}</text>`,
    ),
  };
}
export function windMarker(speed: number, from: number, style: string) {
  const towards = (((from + 180) % 360) + 360) % 360;
  const calm = speed < 1;
  if (style === "badges")
    return {
      type: "picture-marker" as const,
      width: 48,
      height: 44,
      xoffset: 24,
      angle: 0,
      url: svg(
        `<rect x="2" y="2" width="60" height="60" rx="14" fill="white" stroke="#234d73" stroke-width="2"/><g transform="translate(0 -1)">${windLines}</g>${calm ? '<circle cx="52" cy="14" r="5" fill="none" stroke="#234d73" stroke-width="2"/>' : `<path d="M52 21V7m-5 5 5-5 5 5" fill="none" stroke="#234d73" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" transform="rotate(${towards} 52 14)"/>`}<text x="32" y="55" text-anchor="middle" fill="#234d73" font-family="sans-serif" font-weight="bold" font-size="${speed >= 100 ? 13 : 16}">${calm ? "&lt;1 mph" : `${Math.round(speed)} mph`}</text>`,
      ),
    };
  return {
    type: "picture-marker" as const,
    xoffset: 20,
    width: calm ? 20 : 24 + Math.min(speed, 40) / 4,
    height: calm ? 20 : 24 + Math.min(speed, 40) / 4,
    angle: calm ? 0 : towards,
    url: svg(
      calm
        ? '<circle cx="32" cy="32" r="17" fill="white" stroke="#234d73" stroke-width="5"/>'
        : `<g stroke="white" stroke-width="10">${arrow}</g><g stroke="#234d73" stroke-width="5">${arrow}</g>`,
    ),
  };
}
export const SMOKE_COLORS = {
  Light: "#94a3b8",
  Medium: "#64748b",
  Heavy: "#334155",
};
export function smokeTile(density: keyof typeof SMOKE_COLORS) {
  const color = SMOKE_COLORS[density];
  return svg(
    `<rect width="64" height="64" fill="${color}" fill-opacity="${density === "Light" ? 0.13 : density === "Medium" ? 0.25 : 0.42}"/><g stroke="${color}" stroke-width="2.5" fill="white" fill-opacity=".55" stroke-linecap="round"><path d="M19 37h26a9 9 0 0 0 0-18 14 14 0 0 0-26-2 10 10 0 0 0 0 20Z"/><path d="M17 44h28m-23 6h18" fill="none"/></g>`,
  );
}
export function symbolPreview(layer: SymbolLayer, style: string) {
  if (layer === "fire")
    return style === "flames"
      ? svg(flame)
      : svg(
          '<circle cx="32" cy="32" r="17" fill="#d84422" stroke="white" stroke-width="4"/>',
        );
  if (layer === "smoke")
    return style === "clouds"
      ? smokeTile("Medium")
      : svg(
          '<rect x="7" y="14" width="50" height="38" rx="12" fill="#64748b" fill-opacity=".5" stroke="#334155" stroke-width="2"/>',
        );
  if (layer === "air") {
    const marker = airMarker(42, style);
    return marker.type === "picture-marker"
      ? marker.url
      : svg(
          '<circle cx="32" cy="32" r="21" fill="#218343" stroke="white" stroke-width="3"/>',
        );
  }
  return windMarker(12, 270, style).url;
}
