import Point from "@arcgis/core/geometry/Point";
import { useEffect, useRef, useState } from "react";
import NearbyPanel from "./NearbyPanel";
import {
  Flame,
  Layers,
  Plus,
  Minus,
  ChevronRight,
  Search,
  ArrowUpRight,
  Map as MapIcon,
  Ruler,
  Pentagon,
  MousePointer2,
  Navigation,
  X,
  Upload,
  Globe,
  Eye,
  EyeOff,
  Trash2,
  LocateFixed,
  Mountain,
  Check,
  Info,
  LoaderCircle,
  RotateCcw,
  RotateCw,
  Compass,
} from "lucide-react";
import {
  createGIS,
  externalLayer,
  fireService,
  locations,
  nearestFire,
} from "./gis";
import {
  initialViewMode,
  toolNeeds2D,
  TERRAIN_PLACES,
  type ViewMode,
} from "./scene-config";
import "./scene.css";
type GIS = ReturnType<typeof createGIS>;
type Row = { id: string; title: string; visible: boolean; kind: string };
export default function App() {
  const container = useRef<HTMLDivElement>(null),
    gis = useRef<GIS | null>(null);
  const [drawingCount, setDrawingCount] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    initialViewMode(location.search),
  );
  const [viewChanging, setViewChanging] = useState(false),
    [viewNotice, setViewNotice] = useState(""),
    [terrainNotice, setTerrainNotice] = useState(""),
    [cameraTilt, setCameraTilt] = useState(62),
    [cameraHeading, setCameraHeading] = useState(35);
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [collapsed, setCollapsed] = useState(false),
    [showBasemaps, setShowBasemaps] = useState(true),
    [showTools, setShowTools] = useState(true),
    [historicVisible, setHistoricVisible] = useState(false),
    [tab, setTab] = useState("nearby"),
    [search, setSearch] = useState(""),
    [modal, setModal] = useState(false),
    [url, setUrl] = useState(""),
    [loading, setLoading] = useState(false),
    [tool, setTool] = useState("explore"),
    [basemap, setBasemap] = useState(viewMode === "3d" ? "satellite" : "osm"),
    [rows, setRows] = useState<Row[]>([]),
    [coords, setCoords] = useState("37.600° N  120.000° W"),
    [elevationLabel, setElevationLabel] = useState("Terrain elevation"),
    [distance, setDistance] = useState(""),
    [selected, setSelected] = useState<(typeof locations)[number] | null>(null);
  useEffect(() => {
    if (!container.current) return;
    const instance = createGIS(container.current, viewMode);
    gis.current = instance;
    instance.usaWildfires
      .load()
      .then(() => {
        instance.usaWildfires.popupTemplate =
          instance.usaWildfires.createPopupTemplate();
      })
      .catch(() =>
        setError(
          "USA Wildfires could not load. The public service may be unavailable; refresh to try again.",
        ),
      );
    instance
      .initialize()
      .then((notice) => {
        if (notice) setViewNotice(notice);
        setViewMode(instance.mode);
        setReady(true);
        setRows([
          {
            id: instance.drawings.id,
            title: "My drawings",
            visible: true,
            kind: "SKETCH LAYER",
          },
          {
            id: instance.usaWildfires.id,
            title: "USA Wildfires",
            visible: true,
            kind: "PUBLIC FEATURE SERVICE",
          },
        ]);
      })
      .catch((e) => setError(`Map could not start: ${e.message}`));
    const drawingChanges = instance.drawings.graphics.on("change", () =>
      setDrawingCount(instance.drawings.graphics.length),
    );
    const move = instance.on("pointer-move", (e) => {
      const p = e.mapPoint;
      if (p && instance.mode === "3d")
        setElevationLabel(
          !instance.terrainError && Number.isFinite(p.z)
            ? `Elevation ${Math.round(p.z!).toLocaleString()} m`
            : "Elevation unavailable",
        );
      if (p)
        setCoords(
          `${Math.abs(p.latitude ?? 0).toFixed(3)}° ${(p.latitude ?? 0) >= 0 ? "N" : "S"}  ${Math.abs(p.longitude ?? 0).toFixed(3)}° ${(p.longitude ?? 0) >= 0 ? "E" : "W"}`,
        );
    });
    const click = instance.on("click", async (e) => {
      const mode = container.current?.getAttribute("data-tool");
      if (mode === "nearby") {
        const p = e.mapPoint;
        if (p) {
          const n = nearestFire(p.longitude!, p.latitude!);
          setDistance(`${n.miles.toFixed(1)} mi to ${n.name} reference point`);
        }
        return;
      }
      if (mode && mode !== "explore") return;
      try {
        const selectableLayers = instance.map.layers
          .filter(
            (layer) =>
              ((layer.type === "feature" || layer.type === "geojson") &&
                "popupEnabled" in layer &&
                layer.popupEnabled === true) ||
              layer === instance.environment.air ||
              layer === instance.environment.wind,
          )
          .toArray();
        const result = await instance.view.hitTest(e, {
          include: selectableLayers,
        });
        const hit = result.results.find((result) => result.type === "graphic");
        if (!hit || hit.type !== "graphic" || !hit.graphic.geometry) return;
        const geometry = hit.graphic.geometry;
        const layer = hit.graphic.layer;
        const isFire =
          layer === instance.fires ||
          layer === instance.usaWildfires ||
          (layer && "url" in layer && layer.url === fireService);
        const feature = hit.graphic.clone();
        feature.popupTemplate = hit.graphic.getEffectivePopupTemplate(true);
        instance.view.closePopup();
        if (isFire)
          await instance.view.goTo(
            geometry.type === "point"
              ? { target: geometry, zoom: Math.max(instance.view.zoom, 12) }
              : geometry.extent?.expand(1.5) || geometry,
          );
        if (!instance.view.destroyed)
          await instance.view.openPopup({
            features: [feature],
            location: hit.mapPoint || e.mapPoint || undefined,
          });
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError")
          console.warn("Fire selection unavailable", error);
      }
    });
    const observedNotices = { terrain: "", basemap: "" };
    const notices = setInterval(() => {
      if (observedNotices.terrain !== instance.terrainError) {
        observedNotices.terrain = instance.terrainError;
        setTerrainNotice(instance.terrainError);
      }
      if (instance.mode === "3d") {
        setCameraTilt(instance.cameraState.tilt);
        setCameraHeading(instance.cameraState.heading);
      }
      if (observedNotices.basemap !== instance.basemapError) {
        observedNotices.basemap = instance.basemapError;
        if (instance.basemapError) setViewNotice(instance.basemapError);
      }
    }, 1000);
    return () => {
      clearInterval(notices);
      drawingChanges.remove();
      move.remove();
      click.remove();
      instance.destroy();
      gis.current = null;
    };
  }, []);
  async function chooseTool(value: string) {
    const previousMode = gis.current?.mode;
    const changing = toolNeeds2D(value) && previousMode === "3d";
    if (changing) setViewChanging(true);
    setTool(value);
    setDistance("");
    if (gis.current) {
      gis.current.view.popupEnabled = false;
      if (value !== "explore") gis.current.view.closePopup();
    }
    container.current?.removeAttribute("data-tool-ready");
    try {
      await gis.current?.tool(value);
      if (gis.current) {
        if (gis.current.mode !== previousMode && toolNeeds2D(value))
          setViewNotice(
            "Drawing and measurement use 2D. Your layers and place are preserved; select 3D terrain to return.",
          );
        setViewMode(gis.current.mode);
      }
      container.current?.setAttribute("data-tool-ready", value);
    } catch {
      setError("This tool could not start. Please select it again.");
    }
    container.current?.setAttribute("data-tool", value);
    if (changing) setViewChanging(false);
  }
  async function changeView(mode: ViewMode) {
    if (!gis.current || viewChanging) return;
    setViewChanging(true);
    setViewNotice("");
    setTool("explore");
    setDistance("");
    try {
      await gis.current.switchView(mode);
      setViewMode(gis.current.mode);
      container.current?.setAttribute("data-tool", "explore");
    } catch (error) {
      setViewNotice(
        error instanceof Error
          ? error.message
          : "The requested view could not start.",
      );
      setViewMode(gis.current.mode);
    } finally {
      setViewChanging(false);
    }
  }
  async function showMountains(id = "san-gabriel") {
    if (!gis.current) return;
    setViewChanging(true);
    setTool("explore");
    gis.current.clearTool();
    gis.current.view.closePopup();
    container.current?.setAttribute("data-tool", "explore");
    container.current?.setAttribute("data-tool-ready", "explore");
    try {
      await gis.current.mountainView(id);
      setViewMode(gis.current.mode);
      setCameraTilt(65);
    } catch (error) {
      setViewNotice(
        error instanceof Error
          ? error.message
          : "The terrain view could not open.",
      );
    } finally {
      setViewChanging(false);
    }
  }
  async function addLayer(value: string, title?: string) {
    setLoading(true);
    setError("");
    try {
      const layer = await externalLayer(value, title);
      gis.current?.map.add(layer);
      setRows((old) => [
        ...old,
        {
          id: layer.id,
          title: layer.title || "Imported layer",
          visible: true,
          kind: "PUBLIC DATA",
        },
      ]);
      setModal(false);
      setUrl("");
      if (layer.fullExtent && value !== fireService)
        await gis.current?.view.goTo(layer.fullExtent).catch(() => {});
    } catch (e) {
      setError(
        `Unable to load layer. Check the public URL, format and CORS access. ${e instanceof Error ? e.message : ""}`,
      );
    } finally {
      setLoading(false);
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (
        ![
          "FeatureCollection",
          "Feature",
          "Point",
          "LineString",
          "Polygon",
          "MultiPoint",
          "MultiLineString",
          "MultiPolygon",
          "GeometryCollection",
        ].includes(data.type)
      )
        throw Error("Not GeoJSON");
      const blob = URL.createObjectURL(
        new Blob([JSON.stringify(data)], { type: "application/geo+json" }),
      );
      try {
        await addLayer(blob, file.name);
      } finally {
        URL.revokeObjectURL(blob);
      }
    } catch {
      setError("Choose a valid GeoJSON file.");
    }
  }
  function toggle(row: Row) {
    const layer = gis.current?.map.findLayerById(row.id);
    if (layer) layer.visible = !row.visible;
    setRows((old) =>
      old.map((r) => (r.id === row.id ? { ...r, visible: !r.visible } : r)),
    );
  }
  function focus(f: (typeof locations)[number]) {
    setSelected(f);
    gis.current?.view
      .goTo({ target: new Point({ longitude: f.x, latitude: f.y }), zoom: 10 })
      .catch(() => {});
  }
  return (
    <div
      className="app"
      data-view-mode={viewMode}
      data-sidebar-collapsed={collapsed}
    >
      <header>
        <a className="brand" href="/">
          <span className="brand-mark">
            <Flame size={25} />
          </span>
          <span>
            fire<span className="brand-light">atlas</span>
          </span>
        </a>
        <div className="header-center">
          <span className="region-dot" />
          California, United States
          <span className="divider" />
          Wildfire intelligence, in context
        </div>
        <a className="map-home-link" href="/">
          Overview
        </a>
        <a
          className="source-link"
          href="https://www.fire.ca.gov/incidents"
          target="_blank"
          rel="noreferrer"
        >
          CAL FIRE resources <ArrowUpRight size={15} />
        </a>
      </header>
      <main>
        <aside className={collapsed ? "sidebar collapsed" : "sidebar"}>
          <div className="sidebar-inner">
            <div className="sidebar-topline">
              <span className="eyebrow">MAP WORKSPACE</span>
              <button
                className="sidebar-close icon-button"
                aria-label="Close sidebar"
                onClick={() => setCollapsed(true)}
              >
                <X size={19} />
              </button>
            </div>
            <div className="sidebar-region">
              <span className="region-dot" />
              <strong>California</strong>
              <small>36.7783° N, 119.4179° W</small>
            </div>
            <div className="eyebrow">THE GOLDEN STATE</div>
            <h1>California Wildfire Explorer</h1>
            <p className="intro">
              Reported fires, smoke, and conditions in context.
            </p>
            <div className="tabs">
              <button
                className={tab === "nearby" ? "active" : ""}
                onClick={() => setTab("nearby")}
              >
                <LocateFixed size={16} />
                Nearby
              </button>
              <button
                className={tab === "layers" ? "active" : ""}
                onClick={() => setTab("layers")}
              >
                <Layers size={16} />
                Layers
              </button>
              <button
                className={tab === "fires" ? "active" : ""}
                onClick={() => setTab("fires")}
              >
                <Flame size={16} />
                Fire explorer
              </button>
            </div>
            {tab === "layers" ? (
              <>
                <div className="section-head">
                  <h2>
                    Map layers <span>{rows.length}</span>
                  </h2>
                  <button
                    className="icon-button"
                    aria-label="Add layer"
                    onClick={() => {
                      setModal(true);
                      setError("");
                    }}
                  >
                    <Plus size={18} />
                  </button>
                </div>
                <div className="layer-list">
                  {rows.map((row, i) => (
                    <div className="layer" key={row.id}>
                      <span className="layer-symbol">
                        {row.kind === "SKETCH LAYER" ? (
                          <Pentagon size={18} />
                        ) : (
                          <Layers size={18} />
                        )}
                      </span>
                      <div>
                        <strong>{row.title}</strong>
                        <small>
                          {row.kind}
                          {row.kind === "SKETCH LAYER"
                            ? ` · ${drawingCount} ${drawingCount === 1 ? "feature" : "features"}`
                            : ""}
                        </small>
                      </div>
                      <button
                        className="icon-button visibility"
                        aria-label={`${row.visible ? "Hide" : "Show"} ${row.title}`}
                        onClick={() => toggle(row)}
                      >
                        {row.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                      </button>
                      {row.kind === "PUBLIC DATA" && (
                        <button
                          className="icon-button"
                          aria-label={`Remove ${row.title}`}
                          onClick={() => {
                            const l = gis.current?.map.findLayerById(row.id);
                            if (l) gis.current?.map.remove(l);
                            setRows((r) => r.filter((x) => x.id !== row.id));
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  className="add-layer"
                  onClick={() => {
                    setModal(true);
                    setError("");
                  }}
                >
                  <Plus size={17} /> Add a data layer
                </button>
                <div className="legend">
                  <span className="legend-line" />
                  Your drawings
                </div>
                <div className="data-card">
                  <div className="card-icon">
                    <Globe size={21} />
                  </div>
                  <span className="eyebrow">EXPAND YOUR MAP</span>
                  <h3>Bring the landscape to life.</h3>
                  <p>
                    Add public fire perimeters from the National Interagency
                    Fire Center.
                  </p>
                  <button
                    disabled={loading || !ready}
                    onClick={() =>
                      addLayer(fireService, "NIFC current fire perimeters")
                    }
                  >
                    {loading ? "Loading…" : "Add NIFC perimeters"}
                    <ArrowUpRight size={16} />
                  </button>
                  <small>Public service · Coverage and updates vary</small>
                </div>
              </>
            ) : tab === "fires" ? (
              <>
                <button
                  className="historic-toggle"
                  aria-label={`${historicVisible ? "Hide" : "Show"} Historic fire locations`}
                  onClick={() => {
                    const visible = !historicVisible;
                    if (gis.current) gis.current.fires.visible = visible;
                    setHistoricVisible(visible);
                  }}
                >
                  {historicVisible ? <Eye size={16} /> : <EyeOff size={16} />}{" "}
                  Historic reference points
                </button>
                <div className="search">
                  <Search size={16} />
                  <input
                    aria-label="Search historic fires"
                    placeholder="Find a historic fire…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <p className="list-caption">
                  HISTORIC FIRE REFERENCE LOCATIONS
                </p>
                <div className="fire-list">
                  {locations
                    .filter((f) =>
                      f.name.toLowerCase().includes(search.toLowerCase()),
                    )
                    .map((f) => (
                      <button
                        key={f.name}
                        onClick={() => focus(f)}
                        className={selected?.name === f.name ? "selected" : ""}
                      >
                        <span className="fire-list-icon">
                          <Flame size={18} />
                        </span>
                        <span>
                          <strong>{f.name}</strong>
                          <small>
                            {f.county} · {f.year}
                          </small>
                        </span>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                </div>
                {selected && (
                  <div className="selected-card">
                    <span className="eyebrow">HISTORICAL RECORD</span>
                    <h3>{selected.name}</h3>
                    <strong>
                      {selected.acres} <small>acres reported</small>
                    </strong>
                    <p>
                      Approximate reference location. Select its map marker to
                      inspect attributes.
                    </p>
                    <a
                      href="https://www.fire.ca.gov/our-impact/statistics"
                      target="_blank"
                      rel="noreferrer"
                    >
                      CAL FIRE statistics <ArrowUpRight size={13} />
                    </a>
                  </div>
                )}
              </>
            ) : null}
            {ready && gis.current && (
              <div hidden={tab !== "nearby"}>
                <NearbyPanel
                  gis={gis.current}
                  chooseTool={chooseTool}
                  scene={viewMode === "3d"}
                />
              </div>
            )}
            <div className="sidebar-footer">
              <Info size={15} />
              <p>
                For exploration, not emergency guidance.
                <br />
                Historic points do not show fire boundaries.
              </p>
            </div>
          </div>
        </aside>
        {collapsed && (
          <button
            className="sidebar-reopen panel-reopen"
            aria-label="Open sidebar"
            onClick={() => setCollapsed(false)}
          >
            <Layers size={17} /> Layers
          </button>
        )}
        <section className="map-panel" aria-label="Interactive California map">
          <div className="map" ref={container} data-view-mode={viewMode} />
          <div className="view-controls">
            <div
              className="view-mode-switch"
              role="group"
              aria-label="Map perspective"
            >
              <button
                disabled={!ready || viewChanging}
                aria-pressed={viewMode === "2d"}
                onClick={() => void changeView("2d")}
              >
                2D map
              </button>
              <button
                disabled={!ready || viewChanging}
                aria-pressed={viewMode === "3d"}
                onClick={() => void changeView("3d")}
              >
                <Mountain size={16} />
                3D terrain
              </button>
            </div>
            {viewMode === "3d" && (
              <details className="scene-camera">
                <summary>
                  <Compass size={16} /> View controls
                </summary>
                <div>
                  <label>
                    Mountain view
                    <select
                      aria-label="Mountain view"
                      disabled={viewChanging}
                      defaultValue="san-gabriel"
                      onChange={(event) =>
                        void showMountains(event.target.value)
                      }
                    >
                      {TERRAIN_PLACES.map((place) => (
                        <option key={place.id} value={place.id}>
                          {place.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="mountain-reset"
                    disabled={viewChanging}
                    onClick={() => void showMountains()}
                  >
                    <Mountain size={16} /> San Gabriel view
                  </button>
                  <label>
                    Tilt · {cameraTilt}°
                    <input
                      aria-label="Camera tilt"
                      type="range"
                      min="0"
                      max="75"
                      value={cameraTilt}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        setCameraTilt(value);
                        gis.current?.tilt(value);
                      }}
                    />
                  </label>
                  <div className="camera-actions">
                    <button
                      aria-label="Rotate view left"
                      onClick={() => gis.current?.rotate(-15)}
                    >
                      <RotateCcw size={17} />
                    </button>
                    <button
                      aria-label="Face north"
                      onClick={() => gis.current?.north()}
                    >
                      <Compass size={17} /> North
                    </button>
                    <button
                      aria-label="Rotate view right"
                      onClick={() => gis.current?.rotate(15)}
                    >
                      <RotateCw size={17} />
                    </button>
                  </div>
                  <p className="camera-heading">Heading {cameraHeading}°</p>
                  <p>
                    Drag to pan. Right-drag to tilt or rotate; on touch, use two
                    fingers. Satellite imagery is draped over real terrain
                    elevations.
                  </p>
                </div>
              </details>
            )}
          </div>
          {(viewNotice || (viewMode === "3d" && terrainNotice)) && (
            <div className="view-notice" role="status">
              {viewNotice || terrainNotice}
              <button
                aria-label="Dismiss view notice"
                onClick={() => {
                  setViewNotice("");
                  setTerrainNotice("");
                }}
              >
                <X size={15} />
              </button>
            </div>
          )}
          {viewChanging && (
            <div className="view-loading" role="status">
              <LoaderCircle className="spin" size={18} /> Changing map
              perspective…
            </div>
          )}
          {showTools ? (
            <div className="map-tools" role="toolbar" aria-label="Map tools">
              {[
                {
                  id: "explore",
                  icon: MousePointer2,
                  label: "Explore features",
                },
                { id: "draw", icon: Pentagon, label: "Draw on map" },
                { id: "distance", icon: Ruler, label: "Measure distance" },
                { id: "area", icon: MapIcon, label: "Measure area" },
                {
                  id: "nearby",
                  icon: LocateFixed,
                  label: "Distance to historic fire",
                },
              ].map((t) => (
                <button
                  disabled={!ready || viewChanging}
                  key={t.id}
                  className={tool === t.id ? "active" : ""}
                  title={t.label}
                  aria-label={t.label}
                  onClick={() => chooseTool(t.id)}
                >
                  <t.icon size={19} />
                </button>
              ))}
              <button
                aria-label="Close tools"
                title="Close tools"
                onClick={() => {
                  setShowTools(false);
                  void chooseTool("explore");
                }}
              >
                <X size={18} />
              </button>
            </div>
          ) : (
            <button
              className="panel-reopen tools-reopen"
              aria-label="Open tools"
              onClick={() => setShowTools(true)}
            >
              <Ruler size={17} /> Tools
            </button>
          )}
          {tool === "place" && (
            <div className="tool-hint">
              <LocateFixed size={17} />
              Click a place in or near California to check reported fires and
              conditions.
            </div>
          )}
          {(tool === "nearby" || distance) && (
            <div className="tool-hint">
              <LocateFixed size={17} />
              {distance ||
                "Click the map to find the nearest historic fire reference point."}
              <small>
                Straight-line distance to a point, not a fire boundary.
              </small>
            </div>
          )}
          <div className="map-navigation">
            <button
              aria-label="Zoom in"
              onClick={() => {
                if (gis.current) gis.current.view.zoom += 1;
              }}
            >
              <Plus size={20} />
            </button>
            <button
              aria-label="Zoom out"
              onClick={() => {
                if (gis.current) gis.current.view.zoom -= 1;
              }}
            >
              <Minus size={20} />
            </button>
            <span />
            <button
              aria-label="Return to California"
              title="Return to California"
              onClick={() => gis.current?.home().catch(() => {})}
            >
              <Navigation size={18} />
            </button>
          </div>
          {showBasemaps ? (
            <div className="basemaps" aria-label="Basemap options">
              <div className="basemap-heading">
                <Layers size={13} /> BASEMAP
                <button
                  className="panel-close"
                  aria-label="Close basemaps"
                  onClick={() => setShowBasemaps(false)}
                >
                  <X size={15} />
                </button>
              </div>
              <div>
                {[
                  {
                    id: "osm",
                    label: "Streets",
                    cls: "streets",
                    icon: MapIcon,
                  },
                  {
                    id: "satellite",
                    label: "Satellite",
                    cls: "satellite",
                    icon: Globe,
                  },
                  {
                    id: "topo-vector",
                    label: "Terrain",
                    cls: "terrain",
                    icon: Mountain,
                  },
                ].map((b) => (
                  <button
                    key={b.id}
                    className={basemap === b.id ? "selected" : ""}
                    onClick={() => {
                      setBasemap(b.id);
                      gis.current?.setBasemap(b.id);
                    }}
                  >
                    <span className={"basemap-thumb " + b.cls}>
                      <b.icon size={21} />
                      {basemap === b.id && (
                        <i>
                          <Check size={10} />
                        </i>
                      )}
                    </span>
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <button
              className="panel-reopen basemaps-reopen"
              aria-label="Open basemaps"
              onClick={() => setShowBasemaps(true)}
            >
              <Layers size={17} /> Basemaps
            </button>
          )}
          {!ready && !error && (
            <div className="loading-map">
              <LoaderCircle className="spin" size={22} /> Preparing your
              landscape…
            </div>
          )}
          {error && !modal && (
            <div role="alert" className="error-toast">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          <div className="map-bottom">
            <span>
              <span className="status-dot" />{" "}
              {ready ? "EXPLORER READY" : "CONNECTING"}
            </span>
            <span>{coords}</span>
            <span>{viewMode === "3d" ? elevationLabel : "WGS 84"}</span>
          </div>
        </section>
      </main>
      {modal && (
        <div
          className="modal-overlay"
          onClick={() => !loading && setModal(false)}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="Close dialog"
              onClick={() => setModal(false)}
            >
              <X size={20} />
            </button>
            <span className="modal-mark">
              <Layers size={25} />
            </span>
            <span className="eyebrow">YOUR DATA, IN CONTEXT</span>
            <h2 id="modal-title">Add a map layer</h2>
            <p>
              Connect a public ArcGIS feature layer or bring your own GeoJSON.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addLayer(url);
              }}
            >
              <label htmlFor="layer-url">Public layer URL</label>
              <input
                id="layer-url"
                type="url"
                required
                placeholder="https://…/FeatureServer/0 or data.geojson"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <small>
                ArcGIS URLs must end in /FeatureServer/0 (or another layer
                number).
              </small>
              <button
                className="primary"
                disabled={loading || !ready}
                type="submit"
              >
                {loading ? "Loading layer…" : "Add to map"}
                <ArrowUpRight size={16} />
              </button>
            </form>
            <div className="or">or upload a file</div>
            <label className="upload">
              <Upload size={22} />
              <strong>Choose a GeoJSON file</strong>
              <span>.geojson or .json · coordinates in WGS 84</span>
              <input
                disabled={loading}
                type="file"
                accept=".json,.geojson,application/geo+json"
                onChange={(e) => upload(e.target.files?.[0])}
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
