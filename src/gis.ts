import esriConfig from "@arcgis/core/config";
esriConfig.assetsPath = "/arcgis-assets";
import Map from "@arcgis/core/Map";
import MapView from "@arcgis/core/views/MapView";
import GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import Sketch from "@arcgis/core/widgets/Sketch";
import Measurement from "@arcgis/core/widgets/Measurement";
import { whenOnce } from "@arcgis/core/core/reactiveUtils";
import * as geodesicUtils from "@arcgis/core/geometry/support/geodesicUtils";
import Point from "@arcgis/core/geometry/Point";
export const fireService =
  "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0";
export const usaWildfiresService =
  "https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/USA_Wildfires_v1/FeatureServer/0";
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
export function createGIS(container: HTMLDivElement) {
  const fires = new GeoJSONLayer({
    url: `${location.origin}/data/california-fires.geojson`,
    title: "Historic fire reference points",
    renderer: {
      type: "simple",
      symbol: {
        type: "simple-marker",
        size: 13,
        color: "#ed764b",
        outline: { color: "#fff0d7", width: 2 },
      },
    } as any,
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
    visible: true,
    outFields: ["*"],
    refreshInterval: 5,
    popupEnabled: true,
  });
  const drawings = new GraphicsLayer({ title: "My drawings" });
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
  const map = new Map({
    basemap: "osm",
    layers: [context, fires, usaWildfires, drawings],
  });
  const view = new MapView({
    container,
    map,
    center: [-120, 37.6],
    zoom: 6,
    constraints: { minZoom: 3 },
    popup: {
      dockEnabled: true,
      dockOptions: { position: "bottom-right", breakpoint: false },
    },
    ui: { components: ["attribution"] },
  });
  const sketch = new Sketch({
    view,
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
    view,
    linearUnit: "miles",
    areaUnit: "square-miles",
  });
  function clearTool() {
    sketch.cancel();
    view.ui.remove(sketch);
    view.ui.remove(measurement);
    measurement.clear();
  }
  async function tool(name: string) {
    clearTool();
    if (name === "draw") view.ui.add(sketch, "top-right");
    if (name === "distance" || name === "area") {
      view.ui.add(measurement, "top-right");
      measurement.activeTool = name;
      await whenOnce(
        () =>
          measurement.activeWidget != null &&
          !measurement.activeWidget.destroyed,
      );
    }
  }
  return {
    map,
    view,
    fires,
    usaWildfires,
    drawings,
    tool,
    clearTool,
    destroy() {
      clearTool();
      sketch.destroy();
      measurement.destroy();
      view.destroy();
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
