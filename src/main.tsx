import { createRoot } from "react-dom/client";
import App from "./App";
import "@arcgis/core/assets/esri/themes/light/main.css";
import "./style.css";
createRoot(document.getElementById("root")!).render(<App />);
