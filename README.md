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

- **USA Wildfires** is visible automatically on opening the map, using [this public feature layer](https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/USA_Wildfires_v1/FeatureServer/0). Flame icons identify reported incident locations (they do not encode containment); simple circles are also available. Its original attributes are available in popups, and it refreshes every five minutes. Coverage and freshness are determined by the provider. The map opens in California; zoom out to explore the national data.
- Pan, zoom, and switch Streets (OpenStreetMap), Satellite, or Terrain basemaps.
- Close the sidebar, tools, or basemap chooser with their **X** buttons; use the Layers, Tools, or Basemaps buttons to reopen them. Tools sit at the upper right; closing them returns the map to Explore mode.
- Toggle layers in the sidebar; add public ArcGIS layer URLs ending in `/FeatureServer/<number>`, a public GeoJSON URL, or a local GeoJSON file. Remote services must permit anonymous access and CORS; additional cloud network domains may need approval.
- Select **Fire explorer** to search six historical fires and navigate to a reference location. Historic reference points start hidden and are managed within Fire explorer, rather than the main layer list or legend. Click a fire feature in Explore mode to zoom to it and inspect its popup; point fires zoom to at least level 12, and fire perimeters fit to their bounds. Other imported features still support normal attribute popups.
- Use the polygon icon for the ArcGIS Sketch toolbar: draw, select/edit, or delete points, lines, and polygons. Drawings and imported layers are session-only and reset on reload.
- Use the ruler for distance or the area icon for polygon measurement. Click vertices and double-click the last vertex to finish. Units can be changed in the tool.
- Use the target icon and click anywhere for geodesic distance in miles to the nearest of the six bundled historical reference points. This is **not distance to a fire perimeter**, active hazard, or evacuation zone.
- **Add NIFC perimeters** loads the public national service. The built-in action filters the national service to California origin state (`attr_POOState = US-CA`); cross-border fire geometries can extend beyond California. Data availability and update timing are controlled by NIFC. Use Return to California to restore the initial map extent.

## Nearby fires, smoke, air quality and wind

The **Nearby** tab opens by default on the map in both 2D and 3D. Search for a California town or full street address, or pick a location directly on the map. Choose a 10, 25, 50 or 100 mile radius. Selecting a nearby fire highlights and zooms to its matched boundary or reported location.

- The list combines USA Wildfires incident locations inside the search circle with WFIGS boundaries intersecting it. Shared IRWIN IDs match incidents across services (case and braces are normalized); matching uses IDs rather than potentially ambiguous names. A published boundary takes precedence, including when a location inside the circle has a boundary outside it. Otherwise, the result is labeled **distance to reported location** and **boundary not matched**. Boundary-only incidents remain in the list, and matched incidents appear once.
- Distances are approximate spherical geodesic distances, not driving distances or estimates of fire arrival. Locations inside matched polygons are labeled separately. Provider failures preserve results from the available source and display a partial-data warning; an empty list does not mean no fires. Both feeds depend on provider coverage and update timing.
- **Reported fire perimeters** use the public NIFC WFIGS service and display provider update times.
- **Satellite smoke** uses [NOAA/NESDIS HMS Smoke Detection](https://www.arcgis.com/home/item.html?id=ab7a5fbd76e3499296350eabf599fc63), with Light, Medium and Heavy plume polygons. HMS observes smoke aloft during daylight; it does not measure ground-level pollution. No plume returned at a point does not mean smoke-free air.
- **Air quality** shows Open-Meteo / CAMS modeled US AQI and PM2.5, not monitoring-station readings. **Wind** shows Open-Meteo modeled 10 m speed, gusts and direction in mph. Cards show conditions for the selected location. Optional map layers show samples at 13 named California city centers, with an AQI legend and wind arrows pointing where wind is blowing. These samples are not continuous statewide coverage.
- Air and wind are fetched on demand and cached for 15 minutes for the map samples. Cards show model valid times; older times are flagged. Provider failures show unavailable states, never invented zero values. Source links and CC BY 4.0 attribution are in the panel. Public Open-Meteo endpoints require no API key for this initial noncommercial use; review their terms before commercial publication.
- Town search uses GeoNames through Open-Meteo. Full street addresses use the US Census Geocoder through `/api/geocode`, a small same-origin server endpoint. Searches go to the relevant provider; the application does not store search history or cache address responses. Picking a point requires no geocoding provider.

Run `npm run test:gis` with Node 24 to test distance calculations, polygon holes, AQI categories, geocoder filtering, incomplete perimeter responses and model units/missing values. `tests/nearby.spec.ts` exercises the panel with intercepted provider responses; fixture tests do not establish live provider uptime.

## Fire boundary motion and view distances

In the Nearby pane, **Perimeter boundary style** offers a static outline or **Flickering fire glow**. The orange/gold animation decorates the published boundary; it does not show observed flames, spread direction, speed or a forecast. Reduced-motion preferences keep the outline static. Animation pauses in hidden browser tabs and is cleaned up with the map.

Select a fire on the map or in the nearby results, then open **Pan to selected fire** above the map. **Close**, **Surroundings** and **Regional** recenter the selected fire at progressively wider distances in either 2D or 3D. Polygon views account for the whole published footprint; point-only incidents use fixed map scales. The last chosen distance also applies to the next fire selected.

## 3D satellite terrain

`/map` now opens in an angled **3D terrain** view of California's San Gabriel Mountains, inspired by a satellite terrain workspace. It uses the ArcGIS SceneView, public Esri World Imagery, and the public [WorldElevation3D Terrain3D service](https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer). No paid API key is required for these initial services. Satellite image acquisition dates and terrain detail depend on the providers; imagery is not a live wildfire feed.

- Use **2D map / 3D terrain** to change perspective. Both views share the same layers, imports, drawings, selected place, radius and nearby results. Current reported perimeters are visible by default in the 3D entry view.
- **View controls** offers tilt, rotation, North, and mountain presets for the San Gabriel Mountains, Sierra Nevada and Lake Tahoe. **Return to California** restores a statewide overview.
- Drawing and measurement tools automatically open 2D at your current area. Their completed drawings remain in the shared map when returning to 3D. Nearby boundary/location distances still use the same geodesic calculations in either view.
- In 3D, fire and modeled-weather markers are screen-sized billboards. Smoke is shown as shaded NOAA plume footprints draped over terrain, not invented smoke-column heights. Wind badges show mph; the popup gives the geographic direction FROM. Patterned smoke and directional wind arrows remain available in 2D.
- If 3D cannot initialize, the application falls back to 2D. Elevation-service failures are reported instead of presenting flat terrain as verified relief. Legacy links and 2D-specific tests can use `/map?view=2d`.

Cloud development needs `elevation3d.arcgis.com` in its allowed domains. A saved environment draft must be reviewed/saved and published before it establishes that access. Browser scene tests use an explicitly synthetic LERC elevation fixture under `tests/fixtures/`; it never ships as application elevation data. Fixture success does not establish live elevation access.

## Map symbol options

Open **Nearby → Map symbols** to change the display without reloading the map or fetching new samples:

- **Fire:** flame icons (default) or simple circles, for the provided USA Wildfires layer and the optional historic reference points. Symbol colors identify the dataset; consult popups for incident attributes.
- **Smoke:** cloud-patterned plumes (default) or shaded gray plume areas. Both retain NOAA polygon geometry and distinguish Light, Medium and Heavy density. Pattern clouds are a fill texture, not observation stations or surface AQI readings.
- **Air quality:** lungs badges with the rounded US AQI number (default) or color circles. Colors and category names follow the displayed integer AQI.
- **Wind:** direction arrows (default) or wind-icon badges with rounded mph. Arrows point toward where the wind is blowing, while popups retain the meteorological direction FROM. Less than 1 mph uses an open calm circle. Air and wind markers are offset slightly so both remain visible at a city sample.

The legends change with the chosen style. Previews use example values; map samples use provider data. Choices last for the session; **Reset symbols** restores defaults. Custom symbols are local SVGs and require no extra service or API key.

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

Tests use `/usr/bin/chromium` in the cloud machine. On another machine, set `CHROMIUM_PATH` to your Chromium/Chrome executable, or use Playwright's downloaded browser (automatically selected when system Chromium is absent). Tests cover import validation, layer management, fire search, responsive controls and GIS interactions. The live-service test verifies real NIFC loading and satellite tile responses. Public service access requires Internet connectivity and the required domains in environment settings. In this cloud machine, the test configuration routes Chromium through the platform proxy and prepares an ignored NSS trust store using only the platform CA. An existing `~/.pki/nssdb` takes precedence; the setup step must import that same CA there. HTTPS verification stays enabled. Use `NODE_USE_ENV_PROXY=1` with Node 24 cloud commands so server-side fetches also honor the platform proxy. Direct live provider checks passed in this image; Chromium 154 still rejected the proxy certificate despite the platform CA being trusted, so live browser tests remain limited here. The provider-fixture browser tests pass.

## Publish online

Run `npm run build`. Vercel is the recommended host: it serves **dist/** and automatically deploys `api/geocode.js` as a server function. Use `npm ci` as the install command, `npm run build` as the build command, and `dist` as the output directory. No API secrets are needed. The build includes ArcGIS runtime assets copied by `scripts/copy-assets.mjs`. A purely static host supports the map and map-point selection; town/address search additionally requires deploying an equivalent `/api/geocode` backend.

For a straightforward first deployment, connect your GitHub repository to Vercel, configure those commands, and deploy. The host supplies the public URL and supports a custom domain. Prefer a root-domain deployment; subpath hosting (such as GitHub Pages project URLs) requires configuring Vite's base and the absolute data/asset paths in `src/gis.ts`.

## Extend

- `src/App.tsx`: application shell, sidebar, import dialog and tool controls.
- `src/gis.ts`: map lifecycle, layer factories, datasets, measurement and drawing widgets, geodesic calculations. Register new GIS tool widgets here and add a toolbar entry in App.
- `src/NearbyPanel.tsx`: location search, nearby results, conditions and environmental controls.
- `src/place-data.ts`, `src/fire-distance.ts`: provider requests, validation and boundary distances.
- `src/environment-layers.ts`: smoke/perimeter layers, modeled sample symbology and selected-place graphics.
- `api/geocode.js`: public California town/address search endpoint.
- `src/style.css` and `src/nearby.css`: responsive visual system.
- `public/data/`: local public demonstration data.
- `tests/`: browser workflow checks.

Possible next tools: historical perimeter filtering, export/share, and persistent saved maps. These are not implemented in this version.

## Homepage and daily CAL FIRE dashboard

The website opens on the overview dashboard at `/`. The interactive map is at `/map`, with a return link to the overview. Vercel's SPA rewrite for `/map` is included in `vercel.json`; other static hosts need an equivalent fallback. The map sidebar's close button and California coordinates live inside the pane rather than on its scrollbar. The logo no longer has a subtitle.

Dashboard figures are read from `public/data/calfire-summary.json`. No example totals are published: until the first successful source refresh, cards show an unavailable state and link to CAL FIRE. Older verified figures are retained when a refresh fails; the homepage flags snapshots older than 36 hours. The displayed timestamp means when Fire Atlas successfully retrieved the summary, not CAL FIRE's original incident-update time. These are the provider's statewide summary figures, not a count of currently active fires.

- `npm run data:update` fetches and validates the public CAL FIRE incidents HTML directly, using the final figures/counter targets supplied in that page. Temporary network errors, HTTP 429 and HTTP 5xx are retried up to three times. Changed or invalid markup fails immediately. Only a fully validated result atomically replaces the snapshot; a failure exits nonzero and leaves the last saved snapshot untouched.
- `npm run data:update -- --browser` is an optional browser diagnostic, not the daily job. It requires Playwright's Chromium (`npx playwright install --with-deps chromium`). The scheduled refresh does not install or launch a browser.
- `npm run build` also attempts an HTML refresh. If CAL FIRE cannot be reached or the page format is unrecognized, the build continues with the last saved snapshot or the explicit unavailable state.
- `.github/workflows/refresh-calfire.yml` runs on the initial script/workflow push to `main`, once daily at 15:00 UTC, and on manual dispatch from GitHub Actions. Scheduled runs can be delayed by GitHub. The workflow commits only fully validated figures; the connected Vercel project then redeploys. No third-party API key or hosting cron plan is needed. GitHub Actions must be enabled and permitted to write repository contents.
- `npm run test:data` tests extraction, animated-counter targets, missing fields, placeholder rejection, transient retries, atomic writes and retention of the last good snapshot using fixtures. Browser tests cover the dashboard, its missing/stale states, navigation, and sidebar placement.

Source: https://www.fire.ca.gov/incidents. If CAL FIRE changes its markup, the job deliberately fails rather than publishing guessed totals. Inspect the failed GitHub Actions run, update the parser in `scripts/lib/calfire.mjs`, and rerun the workflow. Source access and a successful real refresh must be verified separately from fixture tests; the cloud workspace may require `www.fire.ca.gov` to be allowed in its network settings.
