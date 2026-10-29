import { terrainMarker } from "./scene-symbols";
import { useEffect, useRef, useState } from "react";
import {
  Search,
  LocateFixed,
  Flame,
  CloudFog,
  Gauge,
  Wind,
  MapPin,
  ArrowUpRight,
  LoaderCircle,
} from "lucide-react";
import Point from "@arcgis/core/geometry/Point";
import Graphic from "@arcgis/core/Graphic";
import { type createGIS } from "./gis";
import {
  nearbyFires,
  conditionsAt,
  smokeAt,
  aqiCategory,
  compass,
  type Place,
  type NearbyFire,
  type Conditions,
} from "./place-data";
import MapSymbolControls from "./MapSymbolControls";
import {
  fireMarker,
  symbolPreview,
  smokeTile,
  SMOKE_COLORS,
  type SymbolLayer,
} from "./map-symbols";
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
  scene = false,
}: {
  gis: GIS;
  scene?: boolean;
  chooseTool: (mode: string) => Promise<void>;
}) {
  const [symbolStyles, setSymbolStyles] = useState({
    ...gis.environment.symbolStyles,
  });
  const effectiveStyles = {
    ...symbolStyles,
    smoke: scene ? "shaded" : symbolStyles.smoke,
    wind: scene ? "badges" : symbolStyles.wind,
  };
  function changeSymbols(layer: SymbolLayer, style: string) {
    gis.setSymbolStyle(layer, style);
    setSymbolStyles((previous) => ({ ...previous, [layer]: style }));
  }
  const [query, setQuery] = useState(""),
    [matches, setMatches] = useState<Place[]>([]),
    [searching, setSearching] = useState(false),
    [searchError, setSearchError] = useState("");
  const [place, setPlace] = useState<Place | null>(null),
    [radius, setRadius] = useState(25),
    [fires, setFires] = useState<NearbyFire[]>([]),
    [busy, setBusy] = useState(false),
    [boundaryError, setBoundaryError] = useState(""),
    [fireWarnings, setFireWarnings] = useState<string[]>([]),
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
      .goTo({
        target: new Point({
          longitude: value.longitude,
          latitude: value.latitude,
        }),
        zoom: 10,
      })
      .catch(() => {});
    gis.environment.perimeters.visible = true;
    setVisible((v) => ({ ...v, perimeters: true }));
  }
  useEffect(() => {
    const handle = gis.on("click", (event) => {
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
    setFires([]);
    setFireWarnings([]);
    setBoundaryError("");
    setChecked(null);
    setLimit(10);
    void gis.environment
      .markPlace(place, radius, controller.signal)
      .catch(() => {});
    nearbyFires(place, radius, controller.signal)
      .then((rows) => {
        if (!controller.signal.aborted) {
          setFires(rows.fires);
          setFireWarnings(rows.warnings);
          setChecked(new Date().toISOString());
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setBoundaryError(
            error.message || "Reported fires could not be checked.",
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
  async function focusFire(fire: NearbyFire) {
    await chooseTool("explore");
    const geometry = fire.boundary
      ? gis.environment.selectBoundary(fire.boundary)
      : new Point({ longitude: fire.point![0], latitude: fire.point![1] });
    if (!fire.boundary) {
      gis.environment.selection.elevationInfo = { mode: "relative-to-ground" };
      gis.environment.selection.removeAll();
      gis.environment.selection.add(
        new Graphic({
          geometry,
          symbol: scene
            ? terrainMarker(fireMarker(gis.environment.symbolStyles.fire))
            : fireMarker(gis.environment.symbolStyles.fire),
        }),
      );
    }
    await gis.view
      .goTo(
        fire.boundary
          ? geometry.extent!.expand(1.4)
          : { target: geometry, zoom: 12 },
      )
      .catch(() => {});
    await gis.view.openPopup({
      features: [
        new Graphic({
          geometry,
          attributes: {
            name: fire.name,
            distance: fire.distanceMiles.toFixed(1),
            basis:
              fire.distanceKind === "boundary"
                ? "Reported fire boundary"
                : "Reported fire location (boundary not matched)",
            location: fire.boundary
              ? fire.inside
                ? "Inside reported footprint"
                : "Outside reported footprint"
              : "Footprint not determined from a point",
            updated: date(fire.updated),
            acres: fire.acres ?? "Unavailable",
          },
          popupTemplate: {
            title: "{name}",
            content: [
              {
                type: "fields",
                fieldInfos: [
                  {
                    fieldName: "distance",
                    label:
                      fire.distanceKind === "boundary"
                        ? "Approx. distance to boundary (mi)"
                        : "Approx. distance to reported location (mi)",
                  },
                  { fieldName: "basis", label: "Distance basis" },
                  { fieldName: "location", label: "Your selected place" },
                  {
                    fieldName: "acres",
                    label: fire.boundary
                      ? "Reported perimeter acres"
                      : "Reported incident acres",
                  },
                  {
                    fieldName: "updated",
                    label: fire.boundary
                      ? "Perimeter update"
                      : "Incident update",
                  },
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
      <MapSymbolControls
        styles={effectiveStyles}
        scene={scene}
        onChange={changeSymbols}
      />
      <p className="fire-symbol-key">
        <img src={symbolPreview("fire", symbolStyles.fire)} alt="" /> Reported
        fire location <span className="perimeter-symbol-key" /> Reported
        boundary
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
            <span>{busy ? "…" : fires.length}</span>
          </div>
          {fireWarnings.map((message) => (
            <p className="nearby-error" role="status" key={message}>
              {message}
            </p>
          ))}
          {busy ? (
            <p className="nearby-muted" role="status">
              Checking reported fires…
            </p>
          ) : boundaryError ? (
            <div className="nearby-error" role="alert">
              {boundaryError} Other map layers can still be used.
            </div>
          ) : !fires.length ? (
            <p className="nearby-muted">
              No reported fire locations or perimeters were returned within{" "}
              {radius} miles. This does not mean there are no fires nearby.
            </p>
          ) : (
            <ul className="nearby-fire-list">
              {fires.slice(0, limit).map((fire) => (
                <li key={fire.id}>
                  <button onClick={() => void focusFire(fire)}>
                    <strong>{fire.name}</strong>
                    <b>
                      {fire.inside
                        ? "Inside reported footprint"
                        : `${fire.distanceMiles.toFixed(1)} mi to ${fire.distanceKind === "boundary" ? "boundary" : "reported location"}`}
                    </b>
                    {fire.distanceKind === "location" && (
                      <span>Boundary not matched · location distance</span>
                    )}
                    {fire.inside && (
                      <span>
                        Nearest boundary: {fire.distanceMiles.toFixed(1)} mi
                      </span>
                    )}
                    <small>
                      {date(fire.updated)}
                      {old(fire.updated)
                        ? ` · older ${fire.distanceKind === "boundary" ? "boundary" : "incident update"}`
                        : ""}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {fires.length > limit && (
            <button
              className="more-fires"
              onClick={() => setLimit((value) => value + 10)}
            >
              Show more ({fires.length - limit} remaining)
            </button>
          )}
          {checked && <p className="nearby-muted">Checked {date(checked)}</p>}
          <p className="distance-explainer">
            The circle is your search area. This list includes reported fire
            locations inside it and fire boundaries that intersect it. Distances
            use a matched boundary when available; otherwise they use the
            reported location. Each result labels its distance basis. These are
            approximate straight-line distances, not driving distances. Reports
            and boundaries can lag actual conditions.
          </p>
          <div className="nearby-section-title">
            <CloudFog size={18} />
            <h3>Conditions at this place</h3>
          </div>
          <div className="condition-card">
            <span>
              <Gauge size={16} /> MODELED AIR QUALITY
            </span>
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
            <span>
              <Wind size={16} /> MODELED WIND · 10 METERS
            </span>
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
            <span>
              <CloudFog size={16} /> SATELLITE-OBSERVED SMOKE
            </span>
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
            Icon: Flame,
            title: "Reported fire perimeters",
            note: "NIFC / WFIGS · reported boundaries",
          },
          {
            key: "smoke",
            Icon: CloudFog,
            title: "Satellite smoke",
            note: "NOAA HMS · observed plumes aloft",
          },
          {
            key: "air",
            Icon: Gauge,
            title: "Air quality",
            note: "Modeled US AQI · city-center samples",
          },
          {
            key: "wind",
            Icon: Wind,
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
                <strong>
                  <item.Icon size={16} />
                  {item.title}
                </strong>
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
        <div
          className="environment-key smoke-key"
          aria-label="Smoke density legend"
        >
          {(["Light", "Medium", "Heavy"] as const).map((density) => (
            <span key={density} className="smoke-swatch">
              <span
                style={
                  effectiveStyles.smoke === "clouds"
                    ? {
                        backgroundImage: `url("${smokeTile(density)}")`,
                        backgroundSize: "32px 32px",
                      }
                    : {
                        background: SMOKE_COLORS[density],
                        opacity:
                          density === "Light"
                            ? 0.22
                            : density === "Medium"
                              ? 0.4
                              : 0.58,
                      }
                }
              />
              {density}
            </span>
          ))}
        </div>
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
          {scene
            ? "Wind badges show rounded mph; compass direction is available in each sample popup."
            : symbolStyles.wind === "arrows"
              ? "Blue arrows point where the wind is blowing; larger arrows mean stronger wind."
              : "Wind badges show rounded speed in mph; the small arrow points where the wind is blowing."}{" "}
          An open circle means less than 1 mph. Select a sample for details.
        </p>
      )}
      <p className="nearby-muted">
        Air and wind symbols represent modeled samples at {13} city centers, not
        continuous coverage. Air and wind symbols sit side by side to keep both
        visible. Layers load on demand; toggle to refresh after 15 minutes.
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
