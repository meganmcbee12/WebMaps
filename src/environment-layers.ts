import { terrainMarker } from "./scene-symbols";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import Graphic from "@arcgis/core/Graphic";
import Point from "@arcgis/core/geometry/Point";
import Polygon from "@arcgis/core/geometry/Polygon";
import PictureFillSymbol from "@arcgis/core/symbols/PictureFillSymbol";
import {
  DEFAULT_SYMBOL_STYLES,
  SYMBOL_OPTIONS,
  SMOKE_COLORS,
  airMarker,
  fireMarker,
  windMarker,
  smokeTile,
  type SymbolLayer,
} from "./map-symbols";
import SimpleFillSymbol from "@arcgis/core/symbols/SimpleFillSymbol";
import UniqueValueRenderer from "@arcgis/core/renderers/UniqueValueRenderer";
import { fireService, SMOKE_URL } from "./sources";
import {
  conditionsAt,
  SAMPLE_PLACES,
  aqiCategory,
  compass,
  type Place,
  type Boundary,
  type Conditions,
} from "./place-data";
function smokeRenderer(style: string) {
  return new UniqueValueRenderer({
    field: "Density",
    uniqueValueInfos: (["Light", "Medium", "Heavy"] as const).map(
      (density) => ({
        value: density,
        label: density,
        symbol:
          style === "clouds"
            ? new PictureFillSymbol({
                url: smokeTile(density),
                width: 36,
                height: 36,
                outline: { color: SMOKE_COLORS[density], width: 0.8 },
              })
            : new SimpleFillSymbol({
                color:
                  density === "Light"
                    ? [148, 163, 184, 0.22]
                    : density === "Medium"
                      ? [100, 116, 139, 0.4]
                      : [51, 65, 85, 0.58],
                outline: { color: SMOKE_COLORS[density], width: 0.8 },
              }),
      }),
    ),
  });
}
export function createEnvironmentLayers() {
  const symbolStyles = { ...DEFAULT_SYMBOL_STYLES };
  let sceneMode = false;
  const smoke = new FeatureLayer({
    id: "noaa-smoke",
    url: SMOKE_URL,
    title: "NOAA satellite smoke",
    visible: false,
    outFields: ["*"],
    refreshInterval: 15,
    renderer: smokeRenderer(DEFAULT_SYMBOL_STYLES.smoke),
    popupTemplate: {
      title: "NOAA satellite smoke · {Density}",
      content: [
        {
          type: "text",
          text: "Satellite-observed smoke aloft. This is not a measurement of air quality at ground level.",
        },
        {
          type: "fields",
          fieldInfos: [
            { fieldName: "Density", label: "Plume density" },
            { fieldName: "Satellite", label: "Satellite" },
            { fieldName: "Start", label: "Start (YYYYDDD HHMM UTC)" },
            { fieldName: "End_", label: "End (YYYYDDD HHMM UTC)" },
          ],
        },
      ],
    },
  });
  const perimeters = new FeatureLayer({
    id: "reported-perimeters",
    url: fireService,
    title: "Reported fire perimeters",
    visible: false,
    outFields: ["*"],
    refreshInterval: 5,
    renderer: {
      type: "simple",
      symbol: {
        type: "simple-fill",
        color: [179, 8, 36, 0.1],
        outline: { color: "#b30824", width: 1.7 },
      },
    } as __esri.SimpleRendererProperties & { type: "simple" },
    popupTemplate: {
      title: "{poly_IncidentName}",
      content: [
        {
          type: "fields",
          fieldInfos: [
            {
              fieldName: "poly_GISAcres",
              label: "Reported perimeter acres",
              format: { digitSeparator: true, places: 0 },
            },
            {
              fieldName: "poly_DateCurrent",
              label: "Perimeter update",
              format: { dateFormat: "short-date-short-time" },
            },
          ],
        },
      ],
    },
  });
  const air = new GraphicsLayer({
    id: "modeled-air",
    title: "Modeled air-quality samples",
    visible: false,
  });
  const wind = new GraphicsLayer({
    id: "modeled-wind",
    title: "Modeled wind samples",
    visible: false,
  });
  const analysis = new GraphicsLayer({
    id: "place-analysis",
    title: "Your place and search radius",
    listMode: "hide",
  });
  const selection = new GraphicsLayer({
    id: "selected-boundary",
    title: "Selected reported perimeter",
    listMode: "hide",
  });
  let samples: Promise<Conditions[]> | null = null,
    at = 0;
  async function fillSamples(kind: "air" | "wind") {
    if (!samples || Date.now() - at > 15 * 60 * 1000) {
      at = Date.now();
      samples = conditionsAt(SAMPLE_PLACES);
    }
    const values = await samples;
    const layer = kind === "air" ? air : wind;
    const graphics: Graphic[] = [];
    values.forEach((value, i) => {
      const p = SAMPLE_PLACES[i];
      if (kind === "air" && value.aqi !== null && value.airTime) {
        const category = aqiCategory(value.aqi);
        graphics.push(
          new Graphic({
            geometry: new Point({
              longitude: p.longitude,
              latitude: p.latitude,
            }),
            symbol: sceneMode
              ? terrainMarker(airMarker(value.aqi, symbolStyles.air), "left")
              : airMarker(value.aqi, symbolStyles.air),
            attributes: {
              name: p.name,
              aqi: Math.round(value.aqi),
              category: category.label,
              pm25: value.pm25 ?? "Unavailable",
              time: value.airTime,
            },
            popupTemplate: {
              title: "{name} · Modeled air quality",
              content: [
                {
                  type: "fields",
                  fieldInfos: [
                    { fieldName: "aqi", label: "US AQI (model)" },
                    { fieldName: "category", label: "AQI category" },
                    { fieldName: "pm25", label: "PM2.5 (µg/m³)" },
                    { fieldName: "time", label: "Model valid time (UTC)" },
                  ],
                },
                {
                  type: "text",
                  text: "Open-Meteo / CAMS modeled estimates at selected city centers, not readings from a monitoring station. CC BY 4.0.",
                },
              ],
            },
          }),
        );
      }
      if (
        kind === "wind" &&
        value.speed !== null &&
        value.direction !== null &&
        value.windTime
      ) {
        graphics.push(
          new Graphic({
            geometry: new Point({
              longitude: p.longitude,
              latitude: p.latitude,
            }),
            symbol: sceneMode
              ? terrainMarker(
                  windMarker(value.speed, value.direction, "badges", true),
                  "right",
                )
              : windMarker(value.speed, value.direction, symbolStyles.wind),
            attributes: {
              name: p.name,
              speed: value.speed,
              direction: value.direction,
              gust: value.gust ?? "Unavailable",
              from: `${compass(value.direction)} (${Math.round(value.direction)}°)`,
              time: value.windTime,
            },
            popupTemplate: {
              title: "{name} · Modeled 10 m wind",
              content: [
                {
                  type: "fields",
                  fieldInfos: [
                    { fieldName: "speed", label: "Wind speed (mph)" },
                    { fieldName: "gust", label: "Gust (mph)" },
                    { fieldName: "from", label: "Wind FROM" },
                    { fieldName: "time", label: "Model valid time (UTC)" },
                  ],
                },
                {
                  type: "text",
                  text: "Arrow points toward the direction the wind is blowing. Open-Meteo weather model, not a local station observation. CC BY 4.0.",
                },
              ],
            },
          }),
        );
      }
    });
    if (!graphics.length) {
      samples = null;
      throw Error(
        `The ${kind === "air" ? "air-quality" : "wind"} model did not return usable samples. Please retry later.`,
      );
    }
    layer.removeAll();
    layer.addMany(graphics);
    return {
      count: graphics.length,
      partial: graphics.length < SAMPLE_PLACES.length,
    };
  }
  function setSymbolStyle(layer: SymbolLayer, style: string) {
    if (!SYMBOL_OPTIONS[layer].some((option) => option.value === style))
      throw Error("Unknown symbol style");
    symbolStyles[layer] = style;
    if (layer === "smoke")
      smoke.renderer = smokeRenderer(sceneMode ? "shaded" : style);
    if (layer === "air")
      air.graphics.forEach((graphic) =>
        graphic.set(
          "symbol",
          sceneMode
            ? terrainMarker(airMarker(graphic.attributes.aqi, style), "left")
            : airMarker(graphic.attributes.aqi, style),
        ),
      );
    if (layer === "wind")
      wind.graphics.forEach((g) =>
        g.set(
          "symbol",
          sceneMode
            ? terrainMarker(
                windMarker(
                  g.attributes.speed,
                  g.attributes.direction,
                  "badges",
                  true,
                ),
                "right",
              )
            : windMarker(g.attributes.speed, g.attributes.direction, style),
        ),
      );
  }
  function setSceneMode(enabled: boolean) {
    sceneMode = enabled;
    air.graphics.forEach((g) =>
      g.set(
        "symbol",
        enabled
          ? terrainMarker(airMarker(g.attributes.aqi, symbolStyles.air), "left")
          : airMarker(g.attributes.aqi, symbolStyles.air),
      ),
    );
    wind.graphics.forEach((g) =>
      g.set(
        "symbol",
        enabled
          ? terrainMarker(
              windMarker(
                g.attributes.speed,
                g.attributes.direction,
                "badges",
                true,
              ),
              "right",
            )
          : windMarker(
              g.attributes.speed,
              g.attributes.direction,
              symbolStyles.wind,
            ),
      ),
    );
    selection.graphics.forEach((g) => {
      if (g.geometry?.type === "point")
        g.set(
          "symbol",
          enabled
            ? terrainMarker(fireMarker(symbolStyles.fire))
            : fireMarker(symbolStyles.fire),
        );
    });
    smoke.renderer = smokeRenderer(enabled ? "shaded" : symbolStyles.smoke);
    perimeters.renderer = {
      type: "simple",
      symbol: {
        type: "simple-fill",
        color: enabled ? [139, 48, 23, 0.2] : [179, 8, 36, 0.1],
        outline: {
          color: enabled ? "#ffad50" : "#b30824",
          width: enabled ? 2.5 : 1.7,
        },
      },
    };
    for (const layer of [analysis, selection])
      layer.elevationInfo = { mode: "on-the-ground" };
    air.elevationInfo = { mode: "relative-to-ground" };
    wind.elevationInfo = { mode: "relative-to-ground" };
    selection.elevationInfo = {
      mode:
        selection.graphics.getItemAt(0)?.geometry?.type === "point"
          ? "relative-to-ground"
          : "on-the-ground",
    };
    smoke.elevationInfo = { mode: "on-the-ground" };
    perimeters.elevationInfo = { mode: "on-the-ground" };
  }
  async function markPlace(place: Place, radius: number, signal?: AbortSignal) {
    const point = new Point({
      longitude: place.longitude,
      latitude: place.latitude,
    });
    const engine = await import("@arcgis/core/geometry/geometryEngine");
    if (signal?.aborted) return;
    const buffer = engine.geodesicBuffer(point, radius, "miles");
    analysis.removeAll();
    selection.removeAll();
    if (buffer && !Array.isArray(buffer))
      analysis.add(
        new Graphic({
          geometry: buffer,
          symbol: {
            type: "simple-fill",
            color: [181, 138, 44, 0.06],
            outline: { color: "#b58a2c", width: 1.2, style: "dash" },
          },
        }),
      );
    analysis.add(
      new Graphic({
        geometry: point,
        symbol: {
          type: "simple-marker",
          size: 13,
          color: "#202124",
          outline: { color: "#f4cb65", width: 3 },
        },
      }),
    );
  }
  function selectBoundary(boundary: Boundary) {
    selection.elevationInfo = { mode: "on-the-ground" };
    const geometry = new Polygon({
      rings: boundary.rings,
      spatialReference: { wkid: 4326 },
    });
    selection.removeAll();
    selection.add(
      new Graphic({
        geometry,
        symbol: {
          type: "simple-fill",
          color: [179, 8, 36, 0.18],
          outline: { color: sceneMode ? "#ffad50" : "#b30824", width: 3 },
        },
      }),
    );
    return geometry;
  }
  return {
    symbolStyles,
    setSceneMode,
    setSymbolStyle,
    smoke,
    perimeters,
    air,
    wind,
    analysis,
    selection,
    fillSamples,
    markPlace,
    selectBoundary,
  };
}
