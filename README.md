# Fire Atlas · California

A responsive wildfire GIS workspace built with React, TypeScript, Vite, and the ArcGIS Maps SDK for JavaScript. No ArcGIS account or paid API key is required for the initial public layers and basemaps.

## Preview locally

Requires Node.js 20.19+ or 22.12+ (validated with Node 24).

```sh
npm ci
npm run dev
```

Open `http://localhost:5173` in a browser on your own computer. In a remote development environment, use its port forwarding feature for port **5173** if available. The server binds to all interfaces. This cloud onboarding interface does not itself provide a website preview link; clone/download this project and run the commands locally if port forwarding is unavailable.

## Explore

- Pan, zoom, and switch Streets (OpenStreetMap), Satellite, or Terrain basemaps.
- Toggle layers in the sidebar; add public ArcGIS layer URLs ending in `/FeatureServer/<number>`, a public GeoJSON URL, or a local GeoJSON file. Remote services must permit anonymous access and CORS; additional cloud network domains may need approval.
- Select **Fire explorer** to search six historical fires and navigate to a reference location. Click map features in Explore mode to inspect their attributes in a popup.
- Use the polygon icon for the ArcGIS Sketch toolbar: draw, select/edit, or delete points, lines, and polygons. Drawings and imported layers are session-only and reset on reload.
- Use the ruler for distance or the area icon for polygon measurement. Click vertices and double-click the last vertex to finish. Units can be changed in the tool.
- Use the target icon and click anywhere for geodesic distance in miles to the nearest of the six bundled historical reference points. This is **not distance to a fire perimeter**, active hazard, or evacuation zone.
- **Add NIFC perimeters** loads the public national service. The built-in action filters the national service to California origin state (`attr_POOState = US-CA`); cross-border fire geometries can extend beyond California. Data availability and update timing are controlled by NIFC. Use Return to California to restore the initial map extent.

## Data and interpretation

`public/data/california-fires.geojson` contains six deliberately approximate historical reference points with year, county and reported final acreage. They are educational examples, not precise origins, perimeter geometries, active incident locations, or an exhaustive catalog. Acreages come from public CAL FIRE incident/statistics records: [CAL FIRE statistics](https://www.fire.ca.gov/our-impact/statistics), [incident archive](https://www.fire.ca.gov/incidents).

Optional public perimeter layer: [NIFC WFIGS current interagency perimeters](https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0). The app does not guarantee service uptime or freshness and does not poll continuously.

Bundled simplified state context: [PublicaMundi US states GeoJSON](https://github.com/PublicaMundi/MappingAPI/blob/master/data/geojson/us-states.json), with only six western states retained. Context outlines and historical points work without online tiles. Fonts and SDK runtime assets are served locally; online basemaps still require Internet access. OpenStreetMap and Esri attribution remains visible on the map. Review provider terms before high-traffic publication.

This application is for exploration. Use official local emergency and CAL FIRE information for safety decisions.

## Validate

```sh
npm run build
npx playwright install chromium
npm test
```

Tests use `/usr/bin/chromium` in the cloud machine. On another machine, set `CHROMIUM_PATH` to your Chromium/Chrome executable, or use Playwright's downloaded browser (automatically selected when system Chromium is absent). Tests cover import validation, layer management, fire search, responsive controls and GIS interactions. The live-service test verifies real NIFC loading and satellite tile responses. Public service access requires Internet connectivity and the required domains in environment settings. In this cloud machine, the test configuration creates a local NSS trust store using only the platform-supplied proxy CA; HTTPS verification stays enabled.

## Publish online

Run `npm run build`. Deploy the generated **dist/** directory to Netlify, Vercel, Cloudflare Pages, or another HTTPS static host. Use `npm ci` as the install command and `npm run build` as the build command; output directory is `dist`. No backend or secrets are needed. The build includes ArcGIS runtime assets copied by `scripts/copy-assets.mjs`.

For a straightforward first deployment, connect your GitHub repository to Netlify or Vercel, configure those commands, and deploy. The host supplies the public URL and supports a custom domain. Prefer a root-domain deployment; subpath hosting (such as GitHub Pages project URLs) requires configuring Vite's base and the absolute data/asset paths in `src/gis.ts`.

## Extend

- `src/App.tsx`: application shell, sidebar, import dialog and tool controls.
- `src/gis.ts`: map lifecycle, layer factories, datasets, measurement and drawing widgets, geodesic calculations. Register new GIS tool widgets here and add a toolbar entry in App.
- `src/style.css`: responsive visual system.
- `public/data/`: local public demonstration data.
- `tests/`: browser workflow checks.

Possible next tools: actual point-to-perimeter distance, historical perimeter filtering, address search, export/share, and persistent saved maps. These are not implemented in this version.
