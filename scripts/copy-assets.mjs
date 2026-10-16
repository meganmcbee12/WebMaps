import { cpSync } from "node:fs";
cpSync("node_modules/@arcgis/core/assets", "public/arcgis-assets", {
  recursive: true,
});
