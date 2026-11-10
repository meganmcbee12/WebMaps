export const MAP_STYLES = {
  classic: { label: "Classic topographic", effect: "", description: "Labeled terrain, contours, roads and waterways" },
  parchment: { label: "Warm atlas", effect: "sepia(65%) saturate(70%)", description: "Warm paper tones with labeled terrain" },
  ink: { label: "Black & white", effect: "grayscale(100%) contrast(125%)", description: "High-contrast monochrome for printing" },
  vivid: { label: "Vivid terrain", effect: "saturate(180%) contrast(110%)", description: "Enhanced colors for topographic features" },
} as const;
export const LANDSAT_URL = "https://landsat2.arcgis.com/arcgis/rest/services/Landsat8_Views/ImageServer";
export function boundaryGeoJSON(data: any) {
  const features = data.type === "FeatureCollection" ? data.features : data.type === "Feature" ? [data] : [{ geometry: data }];
  if (!Array.isArray(features) || !features.length || features.length > 100) throw Error("Choose 1–100 polygon features.");
  let vertices = 0;
  for (const feature of features) {
    const g = feature.geometry;
    if (!g || !["Polygon", "MultiPolygon"].includes(g.type)) throw Error("Boundary files must contain only polygons or multipolygons in WGS 84.");
    const polygons = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    if (!Array.isArray(polygons) || !polygons.length) throw Error("Empty boundary.");
    for (const polygon of polygons) {
      if (!Array.isArray(polygon) || !polygon.length) throw Error("Empty polygon.");
      for (const ring of polygon) {
        if (!Array.isArray(ring) || ring.length < 4) throw Error("Each ring needs at least four coordinates.");
        for (const p of ring) {
          if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 85) throw Error("Use longitude/latitude coordinates between ±180° and ±85°.");
          if (++vertices > 100000) throw Error("Simplify the boundary to fewer than 100,000 vertices.");
        }
        if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) throw Error("Polygon rings must be closed.");
      }
    }
  }
  return features.flatMap((f: any) => f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates);
}
export function bboxBoundary(value: string) {
  const b = value.split(",").map((n) => n.trim() ? Number(n) : NaN);
  if (b.length !== 4 || b.some((n) => !Number.isFinite(n)) || b[0] >= b[2] || b[1] >= b[3]) throw Error("Enter west, south, east, north as four increasing coordinates.");
  const [w,s,e,n] = b;
  const geometry = { type: "Polygon", coordinates: [[[w,s],[e,s],[e,n],[w,n],[w,s]]] };
  boundaryGeoJSON(geometry);
  return geometry;
}
export function csvPoints(text: string) {
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i <= text.length; i++) {
    const c = text[i] ?? "\n";
    if (c === '"') { if (quoted && text[i+1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && (c === "," || c === "\n")) {
      row.push(cell.replace(/\r$/, "")); cell = "";
      if (c === "\n") { if (row.some((s) => s.trim())) rows.push(row); row = []; }
    } else cell += c;
  }
  if (quoted) throw Error("Unclosed quoted CSV field.");
  const headers = rows.shift()?.map((s) => s.trim().replace(/^\uFEFF/, "")) ?? [];
  if (new Set(headers).size !== headers.length || headers.some((s) => !s)) throw Error("CSV headers must be unique and nonempty.");
  const lat = headers.findIndex((s) => /^(lat|latitude)$/i.test(s));
  const lon = headers.findIndex((s) => /^(lon|lng|longitude)$/i.test(s));
  if (lat < 0 || lon < 0 || !rows.length || rows.length > 10000) throw Error("CSV needs latitude and longitude columns and 1–10,000 rows.");
  const features = rows.map((r, i) => {
    const x = r[lon]?.trim() ? Number(r[lon]) : NaN, y = r[lat]?.trim() ? Number(r[lat]) : NaN;
    if (r.length !== headers.length || !Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 180 || Math.abs(y) > 90) throw Error(`Invalid coordinates or column count on CSV row ${i+2}.`);
    return { type: "Feature", geometry: { type: "Point", coordinates: [x,y] }, properties: Object.fromEntries(headers.map((h,j) => [h,r[j]])) };
  });
  return { type: "FeatureCollection", features };
}
// GeoJSON uses counterclockwise exteriors; ArcGIS rings use clockwise exteriors.
export function arcgisRings(rings: number[][][]) {
  return rings.map((ring, index) => {
    const area = ring.slice(0,-1).reduce((sum, p, i) => sum + p[0]*ring[i+1][1] - ring[i+1][0]*p[1], 0);
    return (index === 0 ? area > 0 : area < 0) ? [...ring].reverse() : ring;
  });
}
