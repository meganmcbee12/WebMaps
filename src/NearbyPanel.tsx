import { useEffect, useRef, useState } from "react";
import {
  Search,
  LocateFixed,
  Flame,
  CloudFog,
  Wind,
  MapPin,
  ArrowUpRight,
  LoaderCircle,
} from "lucide-react";
import Graphic from "@arcgis/core/Graphic";
import { type createGIS } from "./gis";
import {
  nearbyBoundaries,
  conditionsAt,
  smokeAt,
  aqiCategory,
  compass,
  type Place,
  type Boundary,
  type Conditions,
} from "./place-data";
import "./nearby.css";
type GIS = ReturnType<typeof createGIS>;
const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/Los_Angeles",
      }).format(new Date(value)) + " PT"
    : "Update time unavailable";
const old = (value: string | null) =>
  !!value && Date.now() - Date.parse(value) > 24 * 60 * 60 * 1000;
type LayerKey = "smoke" | "air" | "wind" | "perimeters";
export default function NearbyPanel({
  gis,
  chooseTool,
}: {
  gis: GIS;
  chooseTool: (mode: string) => Promise<void>;
}) {
  const [query, setQuery] = useState(""),
    [matches, setMatches] = useState<Place[]>([]),
    [searching, setSearching] = useState(false),
    [searchError, setSearchError] = useState("");
  const [place, setPlace] = useState<Place | null>(null),
    [radius, setRadius] = useState(25),
    [boundaries, setBoundaries] = useState<Boundary[]>([]),
    [busy, setBusy] = useState(false),
    [boundaryError, setBoundaryError] = useState(""),
    [checked, setChecked] = useState<string | null>(null),
    [limit, setLimit] = useState(10);
  const [conditions, setConditions] = useState<Conditions | null>(null),
    [smoke, setSmoke] = useState<{
      density: string;
      time: string | null;
    } | null>(null),
    [conditionBusy, setConditionBusy] = useState(false),
    [smokeError, setSmokeError] = useState("");
  const [visible, setVisible] = useState<Record<LayerKey, boolean>>({
      smoke: gis.environment.smoke.visible,
      air: gis.environment.air.visible,
      wind: gis.environment.wind.visible,
      perimeters: gis.environment.perimeters.visible,
    }),
    [layerStatus, setLayerStatus] = useState<Partial<Record<LayerKey, string>>>(
      {},
    );
  const searchAbort = useRef<AbortController | null>(null),
    mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
      searchAbort.current?.abort();
    },
    [],
  );
  function selectPlace(value: Place) {
    setPlace(value);
    setMatches([]);
    setSearchError("");
    setLimit(10);
    void chooseTool("explore");
    void gis.view
      .goTo({ center: [value.longitude, value.latitude], zoom: 10 })
      .catch(() => {});
    gis.environment.perimeters.visible = true;
    setVisible((v) => ({ ...v, perimeters: true }));
  }
  useEffect(() => {
    const handle = gis.view.on("click", (event) => {
      if (gis.view.container?.getAttribute("data-tool") !== "place") return;
      const point = event.mapPoint;
      if (!point) return;
      const longitude = point.longitude!,
        latitude = point.latitude!;
      if (
        longitude < -125 ||
        longitude > -113 ||
        latitude < 32 ||
        latitude > 43
      ) {
        setSearchError("Choose a point in or near California.");
        return;
      }
      selectPlace({
        name: `Map location · ${latitude.toFixed(3)}, ${longitude.toFixed(3)}`,
        longitude,
        latitude,
        source: "Selected on map",
      });
    });
    return () => handle.remove();
  }, [gis]);
  useEffect(() => {
    if (!place) return;
    const controller = new AbortController();
    setBusy(true);
    setBoundaries([]);
    setBoundaryError("");
    setChecked(null);
    setLimit(10);
    void gis.environment
      .markPlace(place, radius, controller.signal)
      .catch(() => {});
    nearbyBoundaries(place, radius, controller.signal)
      .then((rows) => {
        if (!controller.signal.aborted) {
          setBoundaries(rows);
          setChecked(new Date().toISOString());
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setBoundaryError(
            error.message || "Reported perimeters could not be checked.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [gis, place, radius]);
  useEffect(() => {
    if (!place) return;
    const controller = new AbortController();
    setConditions(null);
    setSmoke(null);
    setSmokeError("");
    setConditionBusy(true);
    void conditionsAt([place], controller.signal)
      .then((rows) => {
        if (!controller.signal.aborted) setConditions(rows[0]);
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setConditionBusy(false);
      });
    void smokeAt(place, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setSmoke(value);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setSmokeError("NOAA smoke observations are unavailable.");
      });
    return () => controller.abort();
  }, [place]);
  async function search(event: React.FormEvent) {
    event.preventDefault();
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    setSearching(true);
    setSearchError("");
    setMatches([]);
    try {
      const response = await fetch(
        `/api/geocode?q=${encodeURIComponent(query)}`,
        { signal: controller.signal },
      );
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Place search failed.");
      if (!controller.signal.aborted) {
        setMatches(data.results);
        if (!data.results.length)
          setSearchError(
            "No California matches. Try a town, a full address with city and ZIP, or pick a map point.",
          );
      }
    } catch (error) {
      if (!controller.signal.aborted)
        setSearchError(
          error instanceof Error
            ? error.message
            : "Search unavailable. Pick a point on the map.",
        );
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }
  async function toggleLayer(key: LayerKey) {
    const layer = gis.environment[key],
      next = !layer.visible;
    layer.visible = next;
    setVisible((v) => ({ ...v, [key]: next }));
    if (!next) return;
    setLayerStatus((s) => ({ ...s, [key]: "Loading…" }));
    try {
      if (key === "air" || key === "wind") {
        const result = await gis.environment.fillSamples(key);
        if (mounted.current)
          setLayerStatus((s) => ({
            ...s,
            [key]: `${result.count} city samples${result.partial ? " · partial coverage" : ""}`,
          }));
      } else {
        await layer.load();
        if (mounted.current)
          setLayerStatus((s) => ({ ...s, [key]: "Public service loaded" }));
      }
    } catch {
      layer.visible = false;
      if (mounted.current) {
        setVisible((v) => ({ ...v, [key]: false }));
        setLayerStatus((s) => ({
          ...s,
          [key]: "Service unavailable. Toggle again to retry.",
        }));
      }
    }
  }
  async function focusBoundary(boundary: Boundary) {
    await chooseTool("explore");
    const geometry = gis.environment.selectBoundary(boundary);
    await gis.view.goTo(geometry.extent!.expand(1.4)).catch(() => {});
    await gis.view.openPopup({
      features: [
        new Graphic({
          geometry,
          attributes: {
            name: boundary.name,
            distance: boundary.boundaryMiles.toFixed(1),
            location: boundary.inside
              ? "Inside reported footprint"
              : "Outside reported footprint",
            updated: date(boundary.updated),
            acres: boundary.acres ?? "Unavailable",
          },
          popupTemplate: {
            title: "{name}",
            content: [
              {
                type: "fields",
                fieldInfos: [
                  {
                    fieldName: "distance",
                    label: "Approx. distance to boundary (mi)",
                  },
                  { fieldName: "location", label: "Your selected place" },
                  { fieldName: "acres", label: "Reported perimeter acres" },
                  { fieldName: "updated", label: "Perimeter update" },
                ],
              },
            ],
          },
        }),
      ],
    });
  }
  const airValid =
    conditions?.aqi !== null &&
    conditions?.aqi !== undefined &&
    !!conditions.airTime;
  const category = aqiCategory(airValid ? conditions!.aqi : null);
  return (
    <div className="nearby-panel">
      <h2>Around your place</h2>
      <p className="nearby-intro">
        Find reported fires near a California address or town.
      </p>
      <form onSubmit={search} className="place-form">
        <label htmlFor="place-query">Town or street address</label>
        <div>
          <input
            id="place-query"
            type="search"
            placeholder="Sacramento or a full address"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            minLength={2}
            maxLength={300}
            required
          />
          <button aria-label="Search places" disabled={searching} type="submit">
            {searching ? (
              <LoaderCircle size={18} className="spin" />
            ) : (
              <Search size={18} />
            )}
          </button>
        </div>
      </form>
      <button className="pick-place" onClick={() => void chooseTool("place")}>
        <LocateFixed size={17} /> Pick a place on the map
      </button>
      {searchError && (
        <p className="nearby-error" role="alert">
          {searchError}
        </p>
      )}
      {!!matches.length && (
        <ul className="place-matches" aria-label="Place search results">
          {matches.map((match, i) => (
            <li key={`${match.longitude}-${match.latitude}-${i}`}>
              <button onClick={() => selectPlace(match)}>
                <MapPin size={15} />
                <span>
                  {match.name}
                  <small>{match.source}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {place && (
        <>
          <div className="chosen-place">
            <MapPin size={18} />
            <span>
              <strong>{place.name}</strong>
              <small>
                {place.latitude.toFixed(4)}, {place.longitude.toFixed(4)}
              </small>
            </span>
          </div>
          <div className="radius-control">
            <label htmlFor="fire-radius">Search radius</label>
            <select
              id="fire-radius"
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
            >
              {[10, 25, 50, 100].map((value) => (
                <option value={value} key={value}>
                  {value} miles
                </option>
              ))}
            </select>
          </div>
          <div className="nearby-section-title">
            <Flame size={18} />
            <h3>Nearby reported fires</h3>
            <span>{busy ? "…" : boundaries.length}</span>
          </div>
          {busy ? (
            <p className="nearby-muted" role="status">
              Checking reported perimeters…
            </p>
          ) : boundaryError ? (
            <div className="nearby-error" role="alert">
              {boundaryError} Other map layers can still be used.
            </div>
          ) : !boundaries.length ? (
            <p className="nearby-muted">
              No reported perimeters were returned within {radius} miles. This
              does not mean there are no fires nearby.
            </p>
          ) : (
            <ul className="nearby-fire-list">
              {boundaries.slice(0, limit).map((fire) => (
                <li key={fire.id}>
                  <button onClick={() => void focusBoundary(fire)}>
                    <strong>{fire.name}</strong>
                    <b>
                      {fire.inside
                        ? "Inside reported footprint"
                        : `${fire.boundaryMiles.toFixed(1)} mi to boundary`}
                    </b>
                    {fire.inside && (
                      <span>
                        Nearest boundary: {fire.boundaryMiles.toFixed(1)} mi
                      </span>
                    )}
                    <small>
                      {date(fire.updated)}
                      {old(fire.updated) ? " · older boundary" : ""}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {boundaries.length > limit && (
            <button
              className="more-fires"
              onClick={() => setLimit((value) => value + 10)}
            >
              Show more ({boundaries.length - limit} remaining)
            </button>
          )}
          {checked && <p className="nearby-muted">Checked {date(checked)}</p>}
          <p className="distance-explainer">
            Approximate geodesic distance to the reported perimeter—not a fire
            center or driving distance. Fires without published perimeters are
            missing from this list. Boundaries can lag actual conditions.
          </p>
          <div className="nearby-section-title">
            <CloudFog size={18} />
            <h3>Conditions at this place</h3>
          </div>
          <div className="condition-card">
            <span>MODELED AIR QUALITY</span>
            <strong style={{ color: category.color }}>
              {conditionBusy
                ? "Loading…"
                : airValid
                  ? `${Math.round(conditions!.aqi!)} · ${category.label}`
                  : "Unavailable"}
            </strong>
            <p>
              US AQI · PM2.5{" "}
              {conditions?.pm25 !== null && conditions?.pm25 !== undefined
                ? `${conditions.pm25.toFixed(1)} µg/m³`
                : "unavailable"}
            </p>
            <small>
              {date(conditions?.airTime || null)}
              {old(conditions?.airTime || null) ? " · older model time" : ""}
            </small>
            <p className="condition-note">
              Open-Meteo / CAMS model estimate, not a monitoring-station
              reading.
            </p>
          </div>
          <div className="condition-card">
            <span>MODELED WIND · 10 METERS</span>
            <strong>
              {conditionBusy
                ? "Loading…"
                : conditions?.speed !== null && conditions?.speed !== undefined
                  ? `${conditions.speed.toFixed(1)} mph`
                  : "Unavailable"}
            </strong>
            <p>
              {conditions?.direction !== null &&
              conditions?.direction !== undefined
                ? `From ${compass(conditions.direction)} (${Math.round(conditions.direction)}°)`
                : "Direction unavailable"}{" "}
              · Gusts{" "}
              {conditions?.gust !== null && conditions?.gust !== undefined
                ? `${conditions.gust.toFixed(1)} mph`
                : "unavailable"}
            </p>
            <small>
              {date(conditions?.windTime || null)}
              {old(conditions?.windTime || null) ? " · older model time" : ""}
            </small>
            <p className="condition-note">
              Open-Meteo weather model. Local terrain and gusts can differ.
            </p>
          </div>
          <div className="condition-card">
            <span>SATELLITE-OBSERVED SMOKE</span>
            <strong>
              {smoke ? smoke.density : smokeError ? "Unavailable" : "Checking…"}
            </strong>
            <small>
              {smoke?.time
                ? date(smoke.time)
                : smoke
                  ? smoke.density === "No plume mapped"
                    ? "No plume returned at this point"
                    : "Observation time unavailable"
                  : smokeError}
            </small>
            <p className="condition-note">
              NOAA HMS detects smoke aloft during daylight. No mapped plume does
              not mean smoke-free air.
            </p>
          </div>
          <p className="nearby-caution">
            Distance, modeled conditions, and mapped smoke are not a safety
            assessment. Follow official evacuation instructions.
          </p>
        </>
      )}
      <div className="nearby-section-title">
        <LayersIcon />
        <h3>Smoke, air & wind layers</h3>
      </div>
      <div className="environment-options">
        {[
          {
            key: "perimeters",
            title: "Reported fire perimeters",
            note: "NIFC / WFIGS · reported boundaries",
          },
          {
            key: "smoke",
            title: "Satellite smoke",
            note: "NOAA HMS · observed plumes aloft",
          },
          {
            key: "air",
            title: "Air quality",
            note: "Modeled US AQI · city-center samples",
          },
          {
            key: "wind",
            title: "Wind",
            note: "Modeled 10 m wind · city-center samples",
          },
        ].map((item) => (
          <div key={item.key}>
            <label>
              <input
                type="checkbox"
                aria-label={`${item.title} layer`}
                checked={visible[item.key as LayerKey]}
                onChange={() => void toggleLayer(item.key as LayerKey)}
              />
              <span>
                <strong>{item.title}</strong>
                <small>{item.note}</small>
              </span>
            </label>
            {layerStatus[item.key as LayerKey] && (
              <small className="layer-state" role="status">
                {layerStatus[item.key as LayerKey]}
              </small>
            )}
          </div>
        ))}
      </div>
      {visible.smoke && (
        <p className="environment-key smoke-key">
          <span />
          Light <span />
          Medium <span />
          Heavy
        </p>
      )}
      {visible.air && (
        <div className="environment-key aqi-key">
          {[
            [50, "Good"],
            [100, "Moderate"],
            [150, "Sensitive groups"],
            [200, "Unhealthy"],
            [300, "Very unhealthy"],
            [301, "Hazardous"],
          ].map(([value, label]) => (
            <span
              key={label}
              style={{
                borderLeft: `8px solid ${aqiCategory(Number(value)).color}`,
              }}
            >
              {label}
            </span>
          ))}
        </div>
      )}
      {visible.wind && (
        <p className="nearby-muted">
          Blue arrows point where the wind is blowing; size increases with
          speed. Select a sample for details.
        </p>
      )}
      <p className="nearby-muted">
        Air and wind layers are samples at {13} city centers, not continuous
        coverage. Layers load on demand; toggle to refresh after 15 minutes.
      </p>
      <div className="nearby-credits">
        <a
          href="https://www.nifc.gov/nicc/incident-information"
          target="_blank"
          rel="noreferrer"
        >
          NIFC / WFIGS <ArrowUpRight size={12} />
        </a>
        <a
          href="https://www.arcgis.com/home/item.html?id=ab7a5fbd76e3499296350eabf599fc63"
          target="_blank"
          rel="noreferrer"
        >
          NOAA HMS <ArrowUpRight size={12} />
        </a>
        <a
          href="https://open-meteo.com/en/docs/air-quality-api"
          target="_blank"
          rel="noreferrer"
        >
          Open-Meteo / CAMS · CC BY 4.0 <ArrowUpRight size={12} />
        </a>
        <a
          href="https://open-meteo.com/en/docs"
          target="_blank"
          rel="noreferrer"
        >
          Open-Meteo wind · CC BY 4.0 <ArrowUpRight size={12} />
        </a>
        <small>
          Address search: US Census. Towns: GeoNames / Open-Meteo. Searches are
          sent to those providers; this app does not save your search history.
        </small>
      </div>
    </div>
  );
}
function LayersIcon() {
  return <Wind size={18} />;
}
