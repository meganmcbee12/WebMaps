import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import geocode from "./api/geocode.js";
const placeSearch: Plugin = {
  name: "local-place-search",
  configureServer(server) {
    server.middlewares.use("/api/geocode", (req, res) => {
      void geocode(req, res);
    });
  },
  configurePreviewServer(server) {
    server.middlewares.use("/api/geocode", (req, res) => {
      void geocode(req, res);
    });
  },
};
export default defineConfig({ plugins: [react(), placeSearch] });
