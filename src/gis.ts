import { terrainMarker } from "./scene-symbols";
import SimpleRenderer from "@arcgis/core/renderers/SimpleRenderer";
import {
  fireMarker,
  DEFAULT_SYMBOL_STYLES,
  type SymbolLayer,
} from "./map-symbols";
import esriConfig from "@arcgis/core/config";
esriConfig.assetsPath = "/arcgis-assets";
import Map from "@arcgis/core/Map";
import SceneView from "@arcgis/core/views/SceneView";
import ElevationLayer from "@arcgis/core/layers/ElevationLayer";
import {
  ELEVATION_URL,
  INITIAL_CAMERA,
  TERRAIN_PLACES,
  toolNeeds2D,
  type ViewMode,
} from "./scene-config";
import MapView from "@arcgis/core/views/MapView";
import GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import Sketch from "@arcgis/core/widgets/Sketch";
import Measurement from "@arcgis/core/widgets/Measurement";
import { whenOnce } from "@arcgis/core/core/reactiveUtils";
import * as geodesicUtils from "@arcgis/core/geometry/support/geodesicUtils";
import Point from "@arcgis/core/geometry/Point";
import { fireService } from "./sources";
import { createEnvironmentLayers } from "./environment-layers";
export { fireService, usaWildfiresService } from "./sources";
import { usaWildfiresService } from "./sources";
export const locations = [
  {
    name: "Park Fire",
    year: 2024,
    county: "Butte & Tehama",
    acres: "429,603",
    x: -121.68,
    y: 39.96,
  },
  {
    name: "Dixie Fire",
    year: 2021,
    county: "Plumas region",
    acres: "963,309",
    x: -121.05,
    y: 40.02,
  },
  {
    name: "Camp Fire",
    year: 2018,
    county: "Butte",
    acres: "153,336",
    x: -121.58,
    y: 39.76,
  },
  {
    name: "Caldor Fire",
    year: 2021,
    county: "El Dorado & Amador",
    acres: "221,835",
    x: -120.4,
    y: 38.73,
  },
  {
    name: "Thomas Fire",
    year: 2017,
    county: "Ventura & Santa Barbara",
    acres: "281,893",
    x: -119.1,
    y: 34.43,
  },
  {
    name: "Woolsey Fire",
    year: 2018,
    county: "Los Angeles & Ventura",
    acres: "96,949",
    x: -118.8,
    y: 34.15,
  },
];
type MapEvent = { x: number; y: number; mapPoint: Point | null };
export function createGIS(
  container: HTMLDivElement,
  initialMode: ViewMode = "2d",
) {
  const fires = new GeoJSONLayer({
    url: `${location.origin}/data/california-fires.geojson`,
    title: "Historic fire reference points",
    visible: false,
    renderer: new SimpleRenderer({
      symbol: fireMarker(DEFAULT_SYMBOL_STYLES.fire),
    }),
    popupTemplate: {
      title: "{name} · {year}",
      content: [
        {
          type: "fields",
          fieldInfos: [
            { fieldName: "county", label: "County" },
            {
              fieldName: "acres",
              label: "Acres reported",
              format: { digitSeparator: true, places: 0 },
            },
            { fieldName: "note", label: "About this location" },
          ],
        },
      ],
    },
  });
  const usaWildfires = new FeatureLayer({
    url: usaWildfiresService,
    title: "USA Wildfires",
    renderer: new SimpleRenderer({
      symbol: fireMarker(DEFAULT_SYMBOL_STYLES.fire),
    }),
    visible: true,
    outFields: ["*"],
    refreshInterval: 5,
    popupEnabled: true,
  });
  const drawings = new GraphicsLayer({
    title: "My drawings",
    elevationInfo: { mode: "on-the-ground" },
  });
  const context = new GeoJSONLayer({
    url: `${location.origin}/data/western-states.geojson`,
    title: "Western states context",
    listMode: "hide",
    popupEnabled: false,
    renderer: {
      type: "simple",
      symbol: {
        type: "simple-fill",
        color: [225, 232, 208, 0.3],
        outline: { color: [116, 134, 101, 0.65], width: 1 },
      },
    } as any,
    labelsVisible: false,
    labelingInfo: [
      {
        labelExpressionInfo: { expression: "Upper($feature.name)" },
        symbol: {
          type: "text",
          color: [90, 112, 80, 0.8],
          font: { size: 11, family: "sans-serif" },
          haloColor: [250, 251, 245, 0.8],
          haloSize: 1,
        } as any,
      },
    ],
  });
  const environment = createEnvironmentLayers();
  if (initialMode === "3d") environment.perimeters.visible = true;
  const elevation = new ElevationLayer({
    url: ELEVATION_URL,
    title: "Esri World Elevation",
  });
  const map = new Map({
    basemap: initialMode === "3d" ? "satellite" : "osm",
    ground: { layers: [elevation], surfaceColor: "#c9b799" },
    layers: [
      context,
      fires,
      environment.smoke,
      environment.perimeters,
      usaWildfires,
      environment.air,
      environment.wind,
      environment.analysis,
      environment.selection,
      drawings,
    ],
  });
  const view2d = new MapView({
    container: initialMode === "2d" ? container : null,
    map,
    center: [-120, 37.6],
    zoom: 6,
    constraints: { minZoom: 3 },
    popupEnabled: false,
    popup: {
      dockEnabled: true,
      dockOptions: { position: "bottom-right", breakpoint: false },
    },
    ui: { components: ["attribution"] },
  });
  type ActiveView = MapView | SceneView;
  let scene: SceneView | null = null;
  let active: ActiveView = view2d;
  let disposed = false;
  let terrainError = "";
  let basemapError = "";
  let switching = false;
  let startupNotice = "";
  const subscriptions = new Set<{
    kind: "click" | "pointer-move";
    callback: (event: MapEvent) => void;
    handles: { remove: () => void }[];
  }>();
  function attach(
    view: ActiveView,
    subscription: {
      kind: "click" | "pointer-move";
      callback: (event: MapEvent) => void;
      handles: { remove: () => void }[];
    },
  ) {
    const callback = (event: { x: number; y: number }) => {
      if (view === active && view.ready)
        subscription.callback({
          x: event.x,
          y: event.y,
          mapPoint: view.toMap({ x: event.x, y: event.y }) ?? null,
        });
    };
    // Both view types expose these screen events; keeping registrations on each
    // view preserves place picking and feature inspection across mode switches.
    const handle =
      view.type === "2d"
        ? subscription.kind === "click"
          ? view.on("click", callback)
          : view.on("pointer-move", callback)
        : subscription.kind === "click"
          ? view.on("click", callback)
          : view.on("pointer-move", callback);
    subscription.handles.push(handle);
  }
  function on(
    kind: "click" | "pointer-move",
    callback: (event: MapEvent) => void,
  ) {
    const subscription = {
      kind,
      callback,
      handles: [] as { remove: () => void }[],
    };
    subscriptions.add(subscription);
    attach(view2d, subscription);
    if (scene) attach(scene, subscription);
    return {
      remove() {
        subscription.handles.forEach((handle) => handle.remove());
        subscriptions.delete(subscription);
      },
    };
  }
  function updateModeLayers() {
    context.visible = active.type === "2d" && map.basemap?.id === "osm";
    environment.setSceneMode(active.type === "3d");
    applyFireSymbols();
  }
  function makeScene() {
    const result = new SceneView({
      container: null,
      map,
      qualityProfile: "medium",
      camera: INITIAL_CAMERA,
      constraints: {
        tilt: { max: 75, mode: "manual" },
        altitude: { min: 100 },
      },
      environment: {
        atmosphereEnabled: true,
        starsEnabled: false,
        lighting: { type: "virtual", directShadowsEnabled: true },
      },
      popupEnabled: false,
      popup: {
        dockEnabled: true,
        dockOptions: { position: "bottom-right", breakpoint: false },
      },
      ui: { components: ["attribution"] },
    });
    for (const subscription of subscriptions) attach(result, subscription);
    void elevation.load().catch(() => {
      terrainError =
        "Elevation data could not load. Terrain may appear flat; retry 3D when the service is available.";
    });
    return result;
  }
  if (initialMode === "3d") {
    try {
      scene = makeScene();
      active = scene;
      scene.container = container;
    } catch {
      detachFailedScene();
      active = view2d;
      view2d.container = container;
      startupNotice =
        "3D could not start on this device. The map opened in 2D.";
    }
  }
  updateModeLayers();
  async function readyView(view: ActiveView) {
    let timer: ReturnType<typeof setTimeout>;
    try {
      await Promise.race([
        view.when(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(Error("The 3D view took too long to start.")),
            25000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer!);
    }
    if (disposed) throw Error("Map closed");
  }
  function detachFailedScene() {
    if (scene) {
      scene.container = null;
      scene.map = null;
      scene.destroy();
      scene = null;
    }
  }
  async function initialize() {
    try {
      await readyView(active);
    } catch (error) {
      if (active.type === "2d" || disposed) throw error;
      detachFailedScene();
      active = view2d;
      view2d.container = container;
      updateModeLayers();
      await readyView(view2d);
      return "3D is unavailable on this device or connection. The map opened in 2D; you can try 3D again.";
    }
    void map.basemap?.loadAll().catch(() => {
      basemapError =
        "The selected basemap could not load. Try another basemap or refresh the page.";
    });
    return startupNotice;
  }
  async function switchView(mode: ViewMode) {
    if (switching) throw Error("A view change is already in progress.");
    if (active.type === mode) return;
    switching = true;
    clearTool();
    active.closePopup();
    const previous = active;
    const center = previous.center?.clone();
    const scale = previous.scale;
    try {
      if (mode === "3d" && !scene) scene = makeScene();
      const next = mode === "2d" ? view2d : scene!;
      previous.container = null;
      active = next;
      next.container = container;
      if (center) {
        next.center = center;
        next.scale = scale;
      }
      updateModeLayers();
      await readyView(next);
      if (next.type === "3d")
        await next.goTo(
          { target: center, scale, tilt: 62, heading: next.camera.heading },
          { animate: false },
        );
    } catch (error) {
      active.container = null;
      if (active.type === "3d") detachFailedScene();
      active = previous;
      previous.container = container;
      updateModeLayers();
      throw error;
    } finally {
      switching = false;
    }
  }
  function setBasemap(id: string) {
    map.basemap = id as __esri.BasemapProperties;
    basemapError = "";
    updateModeLayers();
    void map.basemap?.loadAll().catch(() => {
      basemapError =
        "The selected basemap could not load. Try another basemap or refresh the page.";
    });
  }
  async function mountainView(id = "san-gabriel") {
    if (active.type !== "3d") await switchView("3d");
    const place =
      TERRAIN_PLACES.find((place) => place.id === id) || TERRAIN_PLACES[0];
    await active.goTo({
      target: new Point({
        longitude: place.longitude,
        latitude: place.latitude,
      }),
      zoom: place.zoom,
      tilt: 65,
      heading: place.heading,
    });
  }
  async function home() {
    await active.goTo({
      target: new Point({ longitude: -120, latitude: 37.6 }),
      zoom: 6,
      ...(active.type === "3d" ? { tilt: 40, heading: 0 } : {}),
    });
  }
  function tilt(value: number) {
    if (active.type === "3d")
      void active
        .goTo({ tilt: Math.max(0, Math.min(75, value)) }, { animate: false })
        .catch(() => {});
  }
  function rotate(delta: number) {
    if (active.type === "3d")
      void active
        .goTo(
          { heading: (active.camera.heading + delta + 360) % 360 },
          { animate: false },
        )
        .catch(() => {});
  }
  function north() {
    if (active.type === "3d")
      void active.goTo({ heading: 0 }, { animate: false }).catch(() => {});
  }
  const sketch = new Sketch({
    view: view2d,
    layer: drawings,
    creationMode: "update",
    availableCreateTools: [
      "point",
      "polyline",
      "polygon",
      "rectangle",
      "circle",
    ],
  });
  const measurement = new Measurement({
    view: view2d,
    linearUnit: "miles",
    areaUnit: "square-miles",
  });
  function clearTool() {
    sketch.cancel();
    view2d.ui.remove(sketch);
    view2d.ui.remove(measurement);
    measurement.clear();
  }
  async function tool(name: string) {
    if (toolNeeds2D(name) && active.type !== "2d") await switchView("2d");
    clearTool();
    if (name === "draw") view2d.ui.add(sketch, "top-right");
    if (name === "distance" || name === "area") {
      view2d.ui.add(measurement, "top-right");
      measurement.activeTool = name;
      await whenOnce(
        () =>
          measurement.activeWidget != null &&
          !measurement.activeWidget.destroyed,
      );
    }
  }
  function applyFireSymbols() {
    const marker = fireMarker(environment.symbolStyles.fire);
    const symbol = active.type === "3d" ? terrainMarker(marker) : marker;
    usaWildfires.renderer = new SimpleRenderer({ symbol });
    fires.renderer = new SimpleRenderer({ symbol });
    usaWildfires.elevationInfo = { mode: "relative-to-ground" };
    fires.elevationInfo = { mode: "relative-to-ground" };
    environment.selection.graphics.forEach((g) => {
      if (g.geometry?.type === "point") g.set("symbol", symbol);
    });
  }
  function setSymbolStyle(layer: SymbolLayer, style: string) {
    environment.setSymbolStyle(layer, style);
    if (layer === "fire") applyFireSymbols();
  }
  let selectedFireGeometry: __esri.Geometry | null = null;
  let fireView: "close" | "area" | "regional" = "close";
  async function panToFire(geometry?: __esri.Geometry, level = fireView) {
    if (geometry) selectedFireGeometry = geometry;
    fireView = level;
    if (!selectedFireGeometry) return false;
    const target = selectedFireGeometry;
    const extent = target.extent;
    const scale = { close: 24000, area: 150000, regional: 650000 }[level];
    if (target.type === "point") await active.goTo({ target, scale });
    else if (extent) {
      await active.goTo(extent.expand({ close: 1.4, area: 3, regional: 8 }[level]));
      if (active.scale < scale) await active.goTo({ target: extent.center, scale });
    }
    return true;
  }
  return {
    map,
    get view() {
      return active;
    },
    get mode() {
      return active.type as ViewMode;
    },
    get cameraState() {
      return active.type === "3d"
        ? {
            tilt: Math.round(active.camera.tilt),
            heading: Math.round(active.camera.heading),
          }
        : { tilt: 0, heading: 0 };
    },
    get terrainError() {
      return terrainError;
    },
    get basemapError() {
      return basemapError;
    },
    panToFire,
    initialize,
    switchView,
    on,
    setBasemap,
    mountainView,
    home,
    tilt,
    rotate,
    north,
    elevation,
    fires,
    usaWildfires,
    drawings,
    environment,
    setSymbolStyle,
    tool,
    clearTool,
    destroy() {
      environment.dispose();
      clearTool();
      sketch.destroy();
      measurement.destroy();
      disposed = true;
      for (const subscription of subscriptions)
        subscription.handles.forEach((handle) => handle.remove());
      subscriptions.clear();
      view2d.container = null;
      view2d.map = null;
      view2d.destroy();
      detachFailedScene();
      map.destroy();
    },
  };
}
export async function externalLayer(url: string, title?: string) {
  const parsed = new URL(url);
  if (!["https:", "http:", "blob:"].includes(parsed.protocol))
    throw new Error("Use a public HTTPS URL.");
  const layer = /\/FeatureServer\/\d+\/?$/i.test(parsed.pathname)
    ? new FeatureLayer({ url, title, outFields: ["*"], popupEnabled: true })
    : new GeoJSONLayer({ url, title, popupEnabled: true });
  if (layer instanceof FeatureLayer && url === fireService) {
    layer.definitionExpression = "attr_POOState = 'US-CA'";
  }
  await layer.load();
  if (!layer.popupTemplate)
    layer.popupTemplate = {
      title: layer.title || "Feature attributes",
      content: [
        {
          type: "fields",
          fieldInfos: layer.fields
            .filter((f) => f.type !== "geometry")
            .map((f) => ({ fieldName: f.name, label: f.alias || f.name })),
        },
      ],
    };
  return layer;
}
export function nearestFire(longitude: number, latitude: number) {
  const point = new Point({ longitude, latitude });
  return locations
    .map((f) => ({
      ...f,
      miles:
        geodesicUtils.geodesicDistance(
          point,
          new Point({ longitude: f.x, latitude: f.y }),
          "miles",
        )?.distance ?? Infinity,
    }))
    .sort((a, b) => a.miles - b.miles)[0];
}
