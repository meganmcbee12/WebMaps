import {
  perimeterDistance,
  pointMiles,
  aqiCategory,
  compass,
  type Coordinate,
} from "./fire-distance.ts";
import { fireService, usaWildfiresService, SMOKE_URL } from "./sources.ts";
export { SMOKE_URL } from "./sources.ts";
export type Place = {
  name: string;
  longitude: number;
  latitude: number;
  source: string;
};
export type Boundary = {
  id: string;
  incidentId: string | null;
  name: string;
  boundaryMiles: number;
  inside: boolean;
  updated: string | null;
  acres: number | null;
  rings: number[][][];
};
export type Conditions = {
  aqi: number | null;
  pm25: number | null;
  airTime: string | null;
  speed: number | null;
  gust: number | null;
  direction: number | null;
  windTime: string | null;
  airError: string;
  windError: string;
};
export async function json(url: URL | string, signal?: AbortSignal) {
  const response = await fetch(url, {
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
      : AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw Error(`Data service returned HTTP ${response.status}`);
  const data = await response.json();
  if (data.error)
    throw Error(
      typeof data.error === "string"
        ? data.error
        : data.error.message ||
            "The data service could not complete this request.",
    );
  return data;
}
function queryUrl(base: string, params: Record<string, string>) {
  const url = new URL(base + "/query");
  url.search = new URLSearchParams({ f: "json", ...params }).toString();
  return url;
}
export function timestamp(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  let date: Date;
  if (typeof value === "number") date = new Date(value);
  else {
    const raw = String(value);
    date = new Date(
      /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?$/.test(raw) ? raw + "Z" : raw,
    );
  }
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
export async function nearbyBoundaries(
  place: Place,
  radius: number,
  signal?: AbortSignal,
  incidentIds?: string[],
): Promise<Boundary[]> {
  const geometry = JSON.stringify({
    x: place.longitude,
    y: place.latitude,
    spatialReference: { wkid: 4326 },
  });
  const ids = await json(
    queryUrl(fireService, {
      where: incidentIds ? incidentWhere(incidentIds) : "1=1",
      ...(incidentIds
        ? {}
        : {
            geometry,
            geometryType: "esriGeometryPoint",
            inSR: "4326",
            distance: String(radius),
            units: "esriSRUnit_StatuteMile",
            spatialRel: "esriSpatialRelIntersects",
          }),
      returnIdsOnly: "true",
    }),
    signal,
  );
  if (!Array.isArray(ids.objectIds))
    throw Error("The perimeter service did not return a valid response.");
  if (ids.objectIds.length > 2000)
    throw Error("Too many reported perimeters. Choose a smaller radius.");
  const grouped = new Map<string, Boundary>();
  for (let start = 0; start < ids.objectIds.length; start += 200) {
    const data = await json(
      queryUrl(fireService, {
        objectIds: ids.objectIds.slice(start, start + 200).join(","),
        outFields: "*",
        outSR: "4326",
        returnGeometry: "true",
      }),
      signal,
    );
    if (data.exceededTransferLimit)
      throw Error(
        "The provider truncated the perimeter response. Try a smaller radius.",
      );
    if (
      !Array.isArray(data.features) ||
      data.features.length !== ids.objectIds.slice(start, start + 200).length
    )
      throw Error("The perimeter response is incomplete. Please retry.");
    for (const feature of data.features) {
      const rings = feature.geometry?.rings;
      if (!Array.isArray(rings))
        throw Error(
          "A reported perimeter was missing geometry. Please retry; results are incomplete.",
        );
      const distance = perimeterDistance(
        [place.longitude, place.latitude],
        rings,
      );
      if (
        !Number.isFinite(distance.boundaryMiles) ||
        (!incidentIds &&
          !distance.inside &&
          distance.boundaryMiles > radius + 0.05)
      )
        continue;
      const a = feature.attributes || {},
        id = String(
          a.poly_IRWINID ||
            a.attr_IrwinID ||
            a.OBJECTID ||
            a.OBJECTID_1 ||
            JSON.stringify(rings[0]?.[0]),
        );
      const incidentId = normalizeIncident(a.poly_IRWINID || a.attr_IrwinID);
      const entry: Boundary = {
        id: incidentId || `perimeter:${id}`,
        incidentId,
        name:
          a.poly_IncidentName || a.attr_IncidentName || "Unnamed reported fire",
        ...distance,
        updated: timestamp(
          a.poly_DateCurrent ||
            a.poly_PolygonDateTime ||
            a.attr_ModifiedOnDateTime_dt,
        ),
        acres: typeof a.poly_GISAcres === "number" ? a.poly_GISAcres : null,
        rings,
      };
      const old = grouped.get(entry.id);
      if (
        !old ||
        (entry.inside && !old.inside) ||
        (entry.inside === old.inside && entry.boundaryMiles < old.boundaryMiles)
      )
        grouped.set(entry.id, entry);
    }
  }
  return [...grouped.values()].sort(
    (a, b) =>
      Number(b.inside) - Number(a.inside) || a.boundaryMiles - b.boundaryMiles,
  );
}
// Match only shared incident IDs, never names: unrelated fires can share a name.
function normalizeIncident(value: unknown): string | null {
  const id =
    typeof value === "string"
      ? value.trim().replace(/[{}]/g, "").toLowerCase()
      : "";
  return id || null;
}
function incidentWhere(ids: string[]) {
  const values = ids
    .flatMap((id) => [id.toUpperCase(), `{${id.toUpperCase()}}`])
    .map((id) => `'${id.replace(/'/g, "''")}'`)
    .join(",");
  return `UPPER(poly_IRWINID) IN (${values}) OR UPPER(attr_IrwinID) IN (${values})`;
}
export type NearbyFire = {
  id: string;
  name: string;
  distanceMiles: number;
  distanceKind: "boundary" | "location";
  inside: boolean;
  updated: string | null;
  acres: number | null;
  boundary?: Boundary;
  point?: Coordinate;
};
type IncidentLocation = {
  id: string;
  incidentId: string | null;
  name: string;
  point: Coordinate;
  distanceMiles: number;
  updated: string | null;
  acres: number | null;
};
async function nearbyLocations(
  place: Place,
  radius: number,
  signal?: AbortSignal,
): Promise<IncidentLocation[]> {
  const ids = await json(
    queryUrl(usaWildfiresService, {
      where: "1=1",
      geometry: JSON.stringify({
        x: place.longitude,
        y: place.latitude,
        spatialReference: { wkid: 4326 },
      }),
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      distance: String(radius),
      units: "esriSRUnit_StatuteMile",
      spatialRel: "esriSpatialRelIntersects",
      returnIdsOnly: "true",
    }),
    signal,
  );
  if (!Array.isArray(ids.objectIds))
    throw Error("The incident service did not return valid IDs.");
  if (ids.objectIds.length > 2000)
    throw Error("Too many incidents. Choose a smaller radius.");
  const grouped = new Map<string, IncidentLocation>();
  for (let start = 0; start < ids.objectIds.length; start += 200) {
    const batch = ids.objectIds.slice(start, start + 200);
    const data = await json(
      queryUrl(usaWildfiresService, {
        objectIds: batch.join(","),
        outFields: "*",
        outSR: "4326",
        returnGeometry: "true",
      }),
      signal,
    );
    if (
      data.exceededTransferLimit ||
      !Array.isArray(data.features) ||
      data.features.length !== batch.length
    )
      throw Error("The incident response is incomplete. Please retry.");
    for (const feature of data.features) {
      const { x, y } = feature.geometry || {};
      if (!Number.isFinite(x) || !Number.isFinite(y))
        throw Error(
          "An incident is missing its location. Results are incomplete.",
        );
      const point: Coordinate = [x, y],
        distanceMiles = pointMiles([place.longitude, place.latitude], point);
      if (distanceMiles > radius + 0.00001) continue;
      const a = feature.attributes || {},
        incidentId = normalizeIncident(a.IrwinID);
      if (!incidentId && a.OBJECTID == null)
        throw Error("An incident is missing its identifier.");
      const id = incidentId || `location:${a.OBJECTID}`;
      const entry: IncidentLocation = {
        id,
        incidentId,
        point,
        distanceMiles,
        name: a.IncidentName || "Unnamed reported fire",
        updated: timestamp(a.ModifiedOnDateTime || a.ICS209ReportDateTime),
        acres: typeof a.DailyAcres === "number" ? a.DailyAcres : null,
      };
      const previous = grouped.get(id);
      if (!previous || (entry.updated || "") > (previous.updated || ""))
        grouped.set(id, entry);
    }
  }
  return [...grouped.values()];
}
export async function nearbyFires(
  place: Place,
  radius: number,
  signal?: AbortSignal,
): Promise<{ fires: NearbyFire[]; warnings: string[] }> {
  const [locations, perimeters] = await Promise.allSettled([
    nearbyLocations(place, radius, signal),
    nearbyBoundaries(place, radius, signal),
  ]);
  if (signal?.aborted) throw signal.reason;
  if (locations.status === "rejected" && perimeters.status === "rejected")
    throw Error(
      "Fire locations and perimeters could not be checked. Please retry.",
    );
  const warnings: string[] = [];
  if (locations.status === "rejected")
    warnings.push(
      "Fire locations are unavailable; this list only includes reported perimeters and may be incomplete.",
    );
  if (perimeters.status === "rejected")
    warnings.push(
      "Perimeter data is unavailable. Distances use reported fire locations; boundary matches may be missing.",
    );
  const boundaries = perimeters.status === "fulfilled" ? perimeters.value : [];
  const points = locations.status === "fulfilled" ? locations.value : [];
  const byIncident = new Map(
    boundaries.filter((b) => b.incidentId).map((b) => [b.incidentId!, b]),
  );
  // A location inside the circle can belong to a perimeter outside it. Look up
  // unmatched IDs as well, so a published boundary still takes precedence.
  if (perimeters.status === "fulfilled") {
    const missing = points.flatMap((p) =>
      p.incidentId && !byIncident.has(p.incidentId) ? [p.incidentId] : [],
    );
    try {
      for (let start = 0; start < missing.length; start += 20) {
        const matches = await nearbyBoundaries(
          place,
          radius,
          signal,
          missing.slice(start, start + 20),
        );
        for (const boundary of matches)
          if (boundary.incidentId)
            byIncident.set(boundary.incidentId, boundary);
      }
    } catch {
      if (signal?.aborted) throw signal.reason;
      warnings.push(
        "Some boundary matches could not be checked. Those fires show distance to their reported location.",
      );
    }
  }
  const fires = new Map<string, NearbyFire>();
  function fromBoundary(b: Boundary): NearbyFire {
    return {
      id: b.id,
      name: b.name,
      distanceMiles: b.boundaryMiles,
      distanceKind: "boundary",
      inside: b.inside,
      updated: b.updated,
      acres: b.acres,
      boundary: b,
    };
  }
  for (const boundary of boundaries)
    fires.set(boundary.id, fromBoundary(boundary));
  for (const point of points) {
    const boundary = point.incidentId
      ? byIncident.get(point.incidentId)
      : undefined;
    fires.set(
      point.id,
      boundary
        ? { ...fromBoundary(boundary), point: point.point }
        : {
            id: point.id,
            name: point.name,
            distanceMiles: point.distanceMiles,
            distanceKind: "location",
            inside: false,
            updated: point.updated,
            acres: point.acres,
            point: point.point,
          },
    );
  }
  return {
    fires: [...fires.values()].sort(
      (a, b) =>
        Number(b.inside) - Number(a.inside) ||
        a.distanceMiles - b.distanceMiles,
    ),
    warnings,
  };
}
const finite = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
export async function conditionsAt(
  places: Place[],
  signal?: AbortSignal,
): Promise<Conditions[]> {
  const coords = {
    latitude: places.map((p) => p.latitude).join(","),
    longitude: places.map((p) => p.longitude).join(","),
    timezone: "UTC",
  };
  const wind = new URL("https://api.open-meteo.com/v1/forecast");
  wind.search = new URLSearchParams({
    ...coords,
    current: "wind_speed_10m,wind_direction_10m,wind_gusts_10m",
    wind_speed_unit: "mph",
  }).toString();
  const air = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
  air.search = new URLSearchParams({
    ...coords,
    current: "us_aqi,pm2_5",
  }).toString();
  const result = await Promise.allSettled([
    json(air, signal),
    json(wind, signal),
  ]);
  return places.map((_, i) => {
    const av =
        result[0].status === "fulfilled"
          ? Array.isArray(result[0].value)
            ? result[0].value[i]
            : places.length === 1
              ? result[0].value
              : null
          : null,
      wv =
        result[1].status === "fulfilled"
          ? Array.isArray(result[1].value)
            ? result[1].value[i]
            : places.length === 1
              ? result[1].value
              : null
          : null;
    const a = av?.current,
      w = wv?.current,
      windUnits = wv?.current_units?.wind_speed_10m,
      airUnits = av?.current_units?.pm2_5;
    const goodWind = windUnits === "mp/h" || windUnits === "mph",
      goodPM =
        airUnits === "μg/m³" || airUnits === "µg/m³" || airUnits === "ug/m3";
    return {
      aqi: finite(a?.us_aqi),
      pm25: goodPM ? finite(a?.pm2_5) : null,
      airTime: timestamp(a?.time),
      speed: goodWind ? finite(w?.wind_speed_10m) : null,
      gust: goodWind ? finite(w?.wind_gusts_10m) : null,
      direction: finite(w?.wind_direction_10m),
      windTime: timestamp(w?.time),
      airError: a ? "" : "Air-quality model unavailable.",
      windError: goodWind
        ? ""
        : "Wind model unavailable or units unrecognized.",
    };
  });
}
export async function smokeAt(place: Place, signal?: AbortSignal) {
  const data = await json(
    queryUrl(SMOKE_URL, {
      where: "1=1",
      geometry: JSON.stringify({
        x: place.longitude,
        y: place.latitude,
        spatialReference: { wkid: 4326 },
      }),
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "Density,Start,End_,Satellite",
      returnGeometry: "false",
    }),
    signal,
  );
  if (data.exceededTransferLimit || !Array.isArray(data.features))
    throw Error("Smoke observations unavailable or incomplete.");
  const levels: Record<string, number> = { Light: 1, Medium: 2, Heavy: 3 };
  const features = data.features
    .map((x: { attributes: Record<string, unknown> }) => x.attributes)
    .sort(
      (a: Record<string, unknown>, b: Record<string, unknown>) =>
        (levels[String(b.Density)] || 0) - (levels[String(a.Density)] || 0),
    );
  const top = features[0];
  const raw = top ? String(top.End_ || top.Start || "") : "";
  const match = raw.match(/^(\d{4})(\d{3})\s*(\d{2})(\d{2})$/);
  return {
    density: top ? String(top.Density || "Mapped plume") : "No plume mapped",
    time: match
      ? new Date(
          Date.UTC(+match[1], 0, +match[2], +match[3], +match[4]),
        ).toISOString()
      : null,
  };
}
export const SAMPLE_PLACES: Place[] = [
  ["San Diego", -117.16, 32.72],
  ["Los Angeles", -118.24, 34.05],
  ["Ventura", -119.29, 34.28],
  ["Palm Springs", -116.55, 33.83],
  ["Bakersfield", -119.02, 35.37],
  ["San Luis Obispo", -120.66, 35.28],
  ["Fresno", -119.79, 36.74],
  ["San Francisco", -122.42, 37.77],
  ["Sacramento", -121.49, 38.58],
  ["South Lake Tahoe", -119.98, 38.94],
  ["Chico", -121.84, 39.73],
  ["Redding", -122.39, 40.59],
  ["Eureka", -124.16, 40.8],
].map(([name, longitude, latitude]) => ({
  name: String(name),
  longitude: Number(longitude),
  latitude: Number(latitude),
  source: "Reference city center",
}));
export { aqiCategory, compass };
