import { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import Dashboard from "./Dashboard";
import "./style.css";
const MapWorkspace = lazy(() => import("./MapWorkspace"));
const isMap = window.location.pathname.replace(/\/$/, "") === "/map";
createRoot(document.getElementById("root")!).render(
  isMap ? (
    <Suspense
      fallback={<div className="dashboard-loading">Opening the fire map…</div>}
    >
      <MapWorkspace />
    </Suspense>
  ) : (
    <Dashboard />
  ),
);
