import PointSymbol3D from "@arcgis/core/symbols/PointSymbol3D";
import IconSymbol3DLayer from "@arcgis/core/symbols/IconSymbol3DLayer";
import { airMarker, fireMarker, windMarker } from "./map-symbols";
type Marker =
  | ReturnType<typeof airMarker>
  | ReturnType<typeof fireMarker>
  | ReturnType<typeof windMarker>;
// Screen-sized billboards identify reported/model locations, not flame heights.
export function terrainMarker(
  marker: Marker,
  side: "left" | "right" | "center" = "center",
) {
  const picture = marker.type === "picture-marker";
  return new PointSymbol3D({
    symbolLayers: [
      new IconSymbol3DLayer({
        resource: picture ? { href: marker.url } : { primitive: "circle" },
        size: picture ? Math.max(marker.width, marker.height) : marker.size,
        material: picture ? undefined : { color: marker.color },
        outline: picture ? undefined : { color: "white", size: 1.5 },
        anchor:
          side === "left" ? "right" : side === "right" ? "left" : "bottom",
      }),
    ],
    verticalOffset: { screenLength: 10, minWorldLength: 0, maxWorldLength: 80 },
    callout: { type: "line", color: [255, 255, 255, 0.65], size: 0.6 },
  });
}
