# AI Agent demo

A browser-based geospatial data workspace by Megan McBee. This is a standalone copy of the public ChatGPT Sites demo, ready to deploy on Vercel.

## Features

- CSV, JSON records, and GeoJSON Point file imports, up to 50 MB and 100,000 records.
- Public ArcGIS FeatureServer and MapServer layer imports with batch queries.
- Inferred metadata, field dictionary, suggested uses, and source update timestamps when available.
- QA/QC checks for missing fields, duplicates, numeric outliers, and coordinate bounds.
- Street, topographic, and satellite basemaps, feature details, and imagery coverage fallback.
- Local questions for counts, generalized U.S. state point locations, numeric summaries, missing values, QA/QC, and great-circle distances.
- JSON report export.

Question answering is deterministic and rule-based. No AI model, API key, or model usage fees are required. It does not answer unrestricted questions or predict outcomes.

## Run locally

No dependencies or build step are required. Use a local HTTP server rather than opening `index.html` as a file:

```sh
python3 -m http.server 8080
```

Then open http://localhost:8080. Run the command from the `ai-agent-demo` folder; files are served directly from that folder.

## Deploy on Vercel

1. Create a **new** Vercel project connected to `meganmcbee12/WebMaps`, using the `ai-agent-demo` branch. Keep the existing wildfire Vercel project unchanged.
2. Use the **Other** framework preset and set **Root Directory** to `ai-agent-demo`. Set the new project's production branch to `ai-agent-demo`.
3. No install or build command is needed. The output directory is `.` (configured in `vercel.json`).
4. Deploy. GitHub changes can trigger subsequent deployments when the integration is enabled.

No environment variables are required. Do not add credentials to browser JavaScript.

## Data and privacy

Imported datasets are kept in the current browser's IndexedDB, with a legacy localStorage fallback. There is no shared dataset database or upload endpoint. Browser storage belongs to a hostname: data stored under the ChatGPT Sites URL will not automatically appear under the Vercel URL. Re-import the original source file or service on the new site. The JSON report contains source records and metadata, but is not currently accepted directly as an import file; extract its `records` array first if needed.

The app makes external requests for Leaflet assets, fonts, map tiles, imagery coverage, and any feature service the visitor selects. Map requests can reveal the area being viewed to the basemap provider. Use only public service URLs without tokens; CORS must permit the browser requests.

## Methods and limits

- Coordinates are displayed as WGS 84 longitude/latitude; verify the source CRS.
- State counts use generalized boundaries bundled in `states.geojson`, downloaded from the [Esri Census sample service](https://sampleserver6.arcgisonline.com/arcgis/rest/services/Census/MapServer/3). Counts near boundaries are approximate. State attributes are used as a labeled fallback when point geometry is absent.
- Distance uses the Haversine formula on a spherical Earth; it is not a driving route and excludes elevation.
- QA/QC findings suggest review and do not change records or prove they are erroneous.
- Large or complex geometries can require significant browser memory.
- Third-party basemaps, fonts, and CDNs require connectivity and remain subject to their providers' terms and availability.

## Repository layout

This app is a standalone folder on the `ai-agent-demo` branch of `meganmcbee12/WebMaps`. The existing wildfire app on `main` is unchanged. A new repository could not be created with the current GitHub integration permissions. The folder can later be copied to its own repository without changing the application files.

## Project files

- `index.html`: interface and styles.
- `app.js`: import, profiling, metadata, QA/QC, mapping, browser storage, and exports.
- `questions.js`: local question engine, UI integration, and background worker.
- `states.geojson`: generalized U.S. state boundaries.
- `vercel.json`: static Vercel hosting configuration.

## Third-party components

Leaflet (BSD-2-Clause), Google Fonts (DM Sans and Manrope; SIL Open Font License), OpenStreetMap data (ODbL), and Esri map services/boundaries retain their respective licenses and terms. Keep map attribution visible. This repository does not bundle secret keys, user-imported datasets, ChatGPT Sites credentials, or the Sites-specific hosting manifest.
