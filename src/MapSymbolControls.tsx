import { Shapes, RotateCcw } from "lucide-react";
import {
  SYMBOL_OPTIONS,
  DEFAULT_SYMBOL_STYLES,
  symbolPreview,
  type SymbolLayer,
} from "./map-symbols";
const labels: Record<SymbolLayer, string> = {
  fire: "Fire",
  smoke: "Smoke",
  air: "Air quality",
  wind: "Wind",
};
export default function MapSymbolControls({
  styles,
  onChange,
  scene = false,
}: {
  styles: Record<SymbolLayer, string>;
  scene?: boolean;
  onChange: (layer: SymbolLayer, style: string) => void;
}) {
  return (
    <details className="map-symbol-controls">
      <summary>
        <Shapes size={18} />
        <span>Map symbols</span>
        <small>Customize</small>
      </summary>
      <div>
        <p>Choose a look for each dataset. Previews use example values.</p>
        {(Object.keys(labels) as SymbolLayer[]).map((layer) => (
          <label key={layer}>
            <img src={symbolPreview(layer, styles[layer], scene)} alt="" />
            <span>
              {labels[layer]}
              <select
                aria-label={`${labels[layer]} symbols`}
                disabled={scene && (layer === "smoke" || layer === "wind")}
                value={styles[layer]}
                onChange={(event) => onChange(layer, event.target.value)}
              >
                {SYMBOL_OPTIONS[layer].map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </span>
          </label>
        ))}
        {scene && (
          <p>
            3D uses shaded smoke footprints and wind-speed badges. Switch to 2D
            for cloud patterns and direction arrows.
          </p>
        )}
        <button
          className="reset-symbols"
          onClick={() => {
            for (const layer of Object.keys(labels) as SymbolLayer[])
              onChange(layer, DEFAULT_SYMBOL_STYLES[layer]);
          }}
        >
          <RotateCcw size={14} /> Reset symbols
        </button>
        <small>Styles update immediately. Choices reset when you reload.</small>
      </div>
    </details>
  );
}
