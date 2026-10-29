export type ViewMode = "2d" | "3d";
export const ELEVATION_URL =
  "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer";
export const TERRAIN_PLACES = [
  {
    id: "san-gabriel",
    name: "San Gabriel Mountains",
    longitude: -118.03,
    latitude: 34.25,
    zoom: 12,
    heading: 25,
  },
  {
    id: "sierra",
    name: "Sierra Nevada",
    longitude: -119.52,
    latitude: 37.72,
    zoom: 11.5,
    heading: 25,
  },
  {
    id: "tahoe",
    name: "Lake Tahoe",
    longitude: -120.06,
    latitude: 39.02,
    zoom: 11,
    heading: 20,
  },
];
export const INITIAL_CAMERA = {
  position: { longitude: -118.105, latitude: 34.19, z: 4500 },
  tilt: 66,
  heading: 35,
};
export function initialViewMode(search: string): ViewMode {
  return new URLSearchParams(search).get("view") === "2d" ? "2d" : "3d";
}
export function toolNeeds2D(tool: string) {
  return ["draw", "distance", "area"].includes(tool);
}
