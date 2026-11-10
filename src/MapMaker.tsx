import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import Basemap from "@arcgis/core/Basemap";
import TileLayer from "@arcgis/core/layers/TileLayer";
import ImageryLayer from "@arcgis/core/layers/ImageryLayer";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import Graphic from "@arcgis/core/Graphic";
import Polygon from "@arcgis/core/geometry/Polygon";
import SketchViewModel from "@arcgis/core/widgets/Sketch/SketchViewModel";
import { geodesicDistance } from "@arcgis/core/geometry/support/geodesicUtils";
import { webMercatorToGeographic } from "@arcgis/core/geometry/support/webMercatorUtils";
import TimeExtent from "@arcgis/core/time/TimeExtent";
import { whenOnce } from "@arcgis/core/core/reactiveUtils";
import { MAP_STYLES, LANDSAT_URL, boundaryGeoJSON, bboxBoundary, arcgisRings } from "./map-maker-data";
import type { createGIS } from "./gis";
import "./map-maker.css";
type GIS = ReturnType<typeof createGIS>;
type PrintMap = { image: string; scale: number; sources: string; layers: string[]; bounds: string; style: string; scaleBar: { miles: number; percent: number } | null };
export default function MapMaker({ gis, chooseTool, addData, active }: { gis: GIS; chooseTool: (mode: string) => Promise<void>; addData: () => void; active: boolean }) {
  const [style, setStyle] = useState<keyof typeof MAP_STYLES>("classic");
  const [title, setTitle] = useState("My topographic vicinity map"), [bbox, setBbox] = useState(""), [boundary, setBoundary] = useState(false);
  const [status, setStatus] = useState(""), [busy, setBusy] = useState(false), [preview, setPreview] = useState<PrintMap | null>(null);
  const [functions, setFunctions] = useState<string[]>([]), [band, setBand] = useState(""), [landsatOn, setLandsatOn] = useState(false);
  const [start, setStart] = useState(""), [end, setEnd] = useState("");
  const boundaryLayer = useRef<GraphicsLayer | null>(null), sketch = useRef<SketchViewModel | null>(null), imagery = useRef<ImageryLayer | null>(null);
  const topo = useRef<TileLayer | null>(null), alive = useRef(true);
  const styleRef = useRef(style); styleRef.current = style;
  useEffect(() => {
    alive.current = true;
    const layer = new GraphicsLayer({ title: "Map maker boundary", listMode: "hide", elevationInfo: { mode: "on-the-ground" } });
    boundaryLayer.current = layer; gis.map.add(layer);
    return () => { alive.current = false; sketch.current?.destroy(); gis.map.remove(layer); layer.destroy(); if (imagery.current) { gis.map.remove(imagery.current); imagery.current.destroy(); } };
  }, [gis]);
  useEffect(() => {
    if (!active) {
      sketch.current?.cancel();
      const element = gis.view.container;
      if (element instanceof HTMLElement && element.getAttribute("data-tool") === "boundary") element.setAttribute("data-tool", "explore");
    }
  }, [active, gis]);
  useEffect(() => {
    if (!preview) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setPreview(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [preview]);
  async function run(task: () => Promise<void>) {
    setBusy(true); setStatus("");
    try { await task(); } catch (e) { if (alive.current) setStatus(e instanceof Error ? e.message : "Map service unavailable. Try again."); }
    finally { if (alive.current) setBusy(false); }
  }
  async function prepareMap(next = styleRef.current) {
    sketch.current?.cancel();
    await chooseTool("draw"); await chooseTool("explore");
    if (!topo.current) topo.current = new TileLayer({ url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer", title: "Esri World Topographic Map" });
    await topo.current.load();
    topo.current.effect = MAP_STYLES[next].effect || null;
    if (!gis.map.basemap?.baseLayers.includes(topo.current)) gis.setCartographicBasemap(new Basemap({ baseLayers: [topo.current], title: MAP_STYLES[next].label }));
    else gis.map.basemap.title = MAP_STYLES[next].label;
    if (gis.view.type === "2d") gis.view.rotation = 0;
  }
  async function showBoundary(data: unknown) {
    const polygons = boundaryGeoJSON(data);
    await prepareMap();
    const graphics = polygons.map((coordinates: number[][][]) => new Graphic({ geometry: new Polygon({ rings: arcgisRings(coordinates), spatialReference: { wkid: 4326 } }), symbol: { type: "simple-fill", color: [180,40,30,0.02], outline: { color: "#a32722", width: 2, style: "dash" } } }));
    boundaryLayer.current!.removeAll(); boundaryLayer.current!.addMany(graphics);
    await gis.view.goTo(graphics); setBoundary(true); setStatus("Boundary ready. Adjust the view, then create your print preview.");
  }
  async function drawBoundary() {
    await prepareMap(); sketch.current?.destroy();
    sketch.current = new SketchViewModel({ view: gis.view as __esri.MapView, layer: boundaryLayer.current!, updateOnGraphicClick: false, polygonSymbol: { type: "simple-fill", color: [180,40,30,0.03], outline: { color: "#a32722", width: 2 } } });
    sketch.current.on("create", (event) => {
      if (event.state === "complete") {
        boundaryLayer.current!.graphics.toArray().filter((g) => g !== event.graphic).forEach((g) => boundaryLayer.current!.remove(g));
        if (gis.view.container instanceof HTMLElement) gis.view.container.setAttribute("data-tool", "explore");
        setBoundary(true); setStatus("Boundary drawn. Ready to style and print.");
      }
    });
    if (gis.view.container instanceof HTMLElement) gis.view.container.setAttribute("data-tool", "boundary");
    await sketch.current.create("polygon"); setStatus("Click to draw your area. Double-click to finish.");
  }
  async function landsat() {
    if (start && end && start > end) throw Error("The start date must be before the end date.");
    await prepareMap();
    if (!imagery.current) {
      const layer = new ImageryLayer({ url: LANDSAT_URL, title: "Landsat 8 imagery · USGS / Esri", opacity: 0.85, popupEnabled: true });
      try {
        // Check anonymously first so unavailable/private services never open a sign-in prompt.
        const response = await fetch(`${LANDSAT_URL}?f=json`, { signal: AbortSignal.timeout(20000) });
        const metadata = await response.json();
        if (!response.ok || metadata.error) throw Error("Public imagery unavailable");
        await layer.load();
      } catch { layer.destroy(); throw Error("Landsat service could not load. Check network access to landsat2.arcgis.com. Your topographic map can still be printed."); }
      if (!alive.current) { layer.destroy(); return; }
      imagery.current = layer; gis.map.add(layer, 0);
      const names = (layer.rasterFunctionInfos || []).map((f) => f.name).filter((n): n is string => !!n && /natural|color|infrared|vegetation|burn|short.wave|swir/i.test(n));
      setFunctions(names); const initial = names.find((n) => /natural|true.color/i.test(n)) || names[0] || "";
      setBand(initial); if (initial) layer.rasterFunction = { functionName: initial };
    }
    imagery.current.visible = true;
    imagery.current.timeExtent = start || end ? new TimeExtent({ start: new Date(`${start || "2013-01-01"}T00:00:00Z`), end: new Date(`${end || new Date().toISOString().slice(0,10)}T23:59:59Z`) }) : null;
    let catalog;
    try { catalog = await imagery.current.queryRasters({ geometry: gis.view.extent, spatialRelationship: "intersects", timeExtent: imagery.current.timeExtent, returnGeometry: false, outFields: ["*"], num: 1 }); } catch { imagery.current.visible = false; setLandsatOn(false); throw Error("Could not check Landsat scene coverage. Try again or continue with the topographic map."); }
    if (!catalog.features.length) { imagery.current.visible = false; setLandsatOn(false); throw Error("No Landsat scenes were found for this view and date range. Widen the dates or move the map."); }
    setLandsatOn(true); setStatus("Landsat enabled. Available composites come from the service; clouds and collection gaps may obscure your area. Open imagery popups for acquisition details.");
  }
  async function createPrint() {
    if (!title.trim()) throw Error("Enter a map title.");
    await prepareMap();
    if (gis.view.type !== "2d") throw Error("Printing requires the 2D map.");
    gis.view.closePopup(); sketch.current?.cancel();
    if (gis.view.width < 1 || gis.view.height < 1) throw Error("The map is not ready to capture.");
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const baseView = await gis.view.whenLayerView(topo.current!);
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      await whenOnce(() => !gis.view.updating && !baseView.updating && gis.view.stationary, { signal: controller.signal });
    } catch { throw Error("Map is still loading. Check visible layers and try again before printing."); } finally { clearTimeout(timer); }
    const failed = gis.view.allLayerViews.find((lv) => lv.visible && lv.suspended && lv.layer.visible);
    if (failed) throw Error(`A visible layer is unavailable: ${failed.layer.title}. Turn it off or retry.`);
    const multiplier = Math.min(2400 / gis.view.width, 4000 / gis.view.height);
    const animated = gis.environment.boundaryAnimated;
    gis.environment.setBoundaryAnimation(false);
    let shot;
    try { shot = await gis.view.takeScreenshot({ width: Math.round(gis.view.width * multiplier), height: Math.round(gis.view.height * multiplier), format: "png" }); } finally { gis.environment.setBoundaryAnimation(animated); }
    const visible = gis.map.allLayers.filter((l) => l.visible && l.listMode !== "hide").toArray();
    const sources = visible.map((l) => "copyright" in l ? String(l.copyright || "") : "").filter(Boolean);
    const e = gis.view.extent;
    const middle = gis.view.height / 2;
    const left = gis.view.toMap({x: 0, y: middle}), right = gis.view.toMap({x: gis.view.width, y: middle});
    let scaleBar: PrintMap["scaleBar"] = null;
    if (left && right) {
      const a = left.spatialReference.isWebMercator ? webMercatorToGeographic(left) as __esri.Point : left;
      const b = right.spatialReference.isWebMercator ? webMercatorToGeographic(right) as __esri.Point : right;
      const width = geodesicDistance(a, b, "miles")?.distance;
      if (width && width > 0) {
        const miles = [0.01,0.02,0.05,0.1,0.25,0.5,1,2,5,10,20,50,100,200,500].filter((n) => n <= width / 4).at(-1);
        if (miles) scaleBar = { miles, percent: miles / width * 100 };
      }
    }
    setPreview({ scaleBar, image: shot.dataUrl, scale: Math.round(gis.view.scale), sources: [...new Set(["Esri topographic map and its data contributors", ...sources])].join(" · "), layers: visible.map((l) => l.title || l.id), bounds: `Map extent (WKID ${e.spatialReference.wkid}): ${[e.xmin,e.ymin,e.xmax,e.ymax].map((n) => n.toFixed(3)).join(", ")}`, style: MAP_STYLES[styleRef.current].label });
  }
  return <div className="map-maker">
    <span className="eyebrow">YOUR AREA, YOUR MAP</span><h2>Map maker</h2>
    <p>Create a topographic vicinity map with terrain, labeled elevations, contours and waterways. Detail depends on map scale and source coverage.</p>
    <fieldset disabled={busy}><legend>1 · Choose an area</legend>
      <button onClick={() => void run(drawBoundary)}>Draw a boundary</button>
      <button onClick={() => void run(async () => { await prepareMap(); setStatus("Current map view selected. Pan and zoom to frame your map."); })}>Use current map view</button>
      <label>Upload boundary (GeoJSON)<input type="file" accept=".json,.geojson" onChange={(e) => { const file = e.target.files?.[0]; if (file) void run(async () => { if (file.size > 5e6) throw Error("Boundary must be smaller than 5 MB."); await showBoundary(JSON.parse(await file.text())); }); e.target.value = ""; }} /></label>
      <label>Bounding coordinates<input value={bbox} placeholder="west, south, east, north" onChange={(e) => setBbox(e.target.value)} /></label>
      <button onClick={() => void run(() => showBoundary(bboxBoundary(bbox)))}>Apply coordinates</button>
      {boundary && <button onClick={() => { boundaryLayer.current?.removeAll(); setBoundary(false); }}>Clear boundary</button>}
      <small>Maps include context outside your outline. Boundary input uses WGS 84 longitude/latitude.</small>
    </fieldset>
    <fieldset disabled={busy}><legend>2 · Design & data</legend>
      <label>Map title<input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></label>
      <label>Topographic style<select value={style} onChange={(e) => { const next = e.target.value as keyof typeof MAP_STYLES; setStyle(next); void run(() => prepareMap(next)); }}>{Object.entries(MAP_STYLES).map(([key,s]) => <option key={key} value={key}>{s.label}</option>)}</select></label>
      <p>{MAP_STYLES[style].description}. Contour spacing and elevation units follow the source labels; these are not newly calculated survey contours.</p>
      <button onClick={addData}>Add my data · GeoJSON / CSV / REST</button>
      <small>Your visible layers and their attributes stay on the map and appear in the export. CSV requires latitude and longitude columns.</small>
    </fieldset>
    <fieldset disabled={busy}><legend>3 · Landsat imagery</legend>
      <p>USGS Landsat imagery served by Esri. Natural color and false-color composites help explore vegetation and burn scars.</p>
      <label>Acquisition start<input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
      <label>Acquisition end<input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      <button onClick={() => void run(landsat)}>Load / update Landsat</button>
      {!!functions.length && <label>Satellite composite<select value={band} onChange={(e) => { setBand(e.target.value); if (imagery.current) imagery.current.rasterFunction = { functionName: e.target.value }; }}>{functions.map((f) => <option key={f}>{f}</option>)}</select></label>}
      {landsatOn && <button onClick={() => { imagery.current!.visible = false; setLandsatOn(false); }}>Hide Landsat</button>}
      <small>False colors do not show visible flame or measure burn severity. Date filters select imagery within a range, not a guaranteed single cloud-free scene.</small>
    </fieldset>
    <button className="maker-primary" disabled={busy} onClick={() => void run(createPrint)}>{busy ? "Preparing map…" : "Create print preview"}</button>
    {status && <p role="status" className="maker-status">{status}</p>}
    {preview && createPortal(<div className="maker-preview" role="dialog" aria-modal="true" aria-label="Print map preview">
      <div className="maker-preview-actions"><button onClick={() => window.print()}>Print / Save as PDF</button><a href={preview.image} download="topographic-map.png">Download map PNG</a><button onClick={() => setPreview(null)}>Close preview</button></div>
      <article className="maker-sheet"><header><div><span>CALIFORNIA WILDFIRE EXPLORER</span><h1>{title}</h1><p>{preview.style} · {new Date().toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" })} · North ↑</p></div></header>
        <img src={preview.image} alt="Topographic map with the selected boundary and visible data" />
        {preview.scaleBar && <div className="maker-scale" style={{width: `${preview.scaleBar.percent}%`}}>0 ━ {preview.scaleBar.miles} mi</div>}
        <footer><p>Captured view scale approximately 1:{preview.scale.toLocaleString()}; resizing changes printed scale. Use mapped scale labels and coordinates for reference.</p><p>Visible layers: {preview.layers.join(" · ")}</p><p>{preview.bounds}</p><p>{preview.sources}</p><p>Vicinity reference map · Not for survey or emergency navigation.</p></footer>
      </article>
    </div>, document.body)}
  </div>;
}
