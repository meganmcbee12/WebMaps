import { useEffect, useState } from "react";
import {
  Flame,
  ArrowUpRight,
  ArrowRight,
  Activity,
  TreePine,
  Heart,
  House,
  Layers,
  Clock3,
  Map as MapIcon,
  ShieldCheck,
} from "lucide-react";
import "./dashboard.css";
type Summary = {
  sourceUrl: string;
  fetchedAt: string | null;
  reportingPeriod: string;
  metrics: null | Record<string, number>;
};
const cards = [
  {
    key: "emergencyResponses",
    label: "Total emergency responses",
    icon: Activity,
  },
  { key: "wildfires", label: "Wildfires", icon: Flame },
  { key: "acresBurned", label: "Acres burned", icon: TreePine },
  { key: "fatalities", label: "Fatalities", icon: Heart },
  { key: "structuresDestroyed", label: "Structures destroyed", icon: House },
];
export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    fetch("/data/calfire-summary.json", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw Error("Unavailable");
        return r.json();
      })
      .then((data) => {
        if (!cancelled && data.schemaVersion === 1) setSummary(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);
  const valid =
    !!summary?.fetchedAt &&
    Number.isFinite(Date.parse(summary.fetchedAt)) &&
    !!summary.metrics &&
    cards.every(
      (c) =>
        typeof summary.metrics?.[c.key] === "number" &&
        Number.isFinite(summary.metrics[c.key]) &&
        summary.metrics[c.key] >= 0,
    );
  const stale =
    valid && Date.now() - Date.parse(summary!.fetchedAt!) > 36 * 60 * 60 * 1000;
  const updated = valid
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Los_Angeles",
      }).format(new Date(summary!.fetchedAt!)) + " PT"
    : null;
  return (
    <div className="dashboard">
      <header className="dash-header">
        <a className="brand" href="/">
          <span className="brand-mark">
            <Flame size={25} />
          </span>
          <span>
            fire<span className="brand-light">atlas</span>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <a href="/" aria-current="page">
            Overview
          </a>
          <a href="/map">
            Interactive map <ArrowUpRight size={15} />
          </a>
        </nav>
        <a
          className="dash-source"
          href="https://www.fire.ca.gov/incidents"
          target="_blank"
          rel="noreferrer"
        >
          CAL FIRE <ArrowUpRight size={15} />
        </a>
      </header>
      <main className="dash-main">
        <section className="dash-hero">
          <div className="hero-copy">
            <div className="dash-eyebrow">
              <span /> THE CALIFORNIA FIRE PICTURE
            </div>
            <h1>
              California fires.
              <br />
              <span>A clearer picture.</span>
            </h1>
            <p>
              Understand the numbers. Explore the landscape.
              <br />
              Your starting point for wildfire information across the Golden
              State.
            </p>
            <div className="hero-actions">
              <a className="dash-primary" href="/map">
                Explore the fire map <ArrowUpRight size={18} />
              </a>
              <a
                className="dash-text-link"
                href="https://www.fire.ca.gov/incidents"
                target="_blank"
                rel="noreferrer"
              >
                View CAL FIRE incidents <ArrowRight size={15} />
              </a>
            </div>
            <div className="hero-caption">
              <ShieldCheck size={15} /> Public information. A statewide
              perspective.
            </div>
          </div>
          <div className="hero-landscape" aria-hidden="true">
            <div className="landscape-grid" />
            <span className="landscape-north">N ↑</span>
            <img src="/california-outline.svg" alt="" />
            <div className="landscape-title">
              <span className="region-dot" /> CALIFORNIA{" "}
              <small>THE GOLDEN STATE</small>
            </div>
            <div className="landscape-coordinates">
              36.7783° N &nbsp; 119.4179° W
            </div>
            <div className="landscape-tag">
              <MapIcon size={15} /> A landscape worth understanding
            </div>
          </div>
        </section>
        <section className="summary-section" aria-labelledby="summary-title">
          <div className="summary-heading">
            <div>
              <span className="dash-kicker">STATEWIDE AT A GLANCE</span>
              <h2 id="summary-title">Every number tells a story.</h2>
            </div>
            <div className="update-badge">
              <Clock3 size={14} /> Daily refresh · CAL FIRE
            </div>
          </div>
          <p className="summary-context">
            Summary figures from CAL FIRE’s incidents page. These totals are
            distinct from the number of fires currently burning.
          </p>
          <div className="stats-grid" aria-busy={loading}>
            {cards.map((card) => (
              <article className="stat-card" key={card.key}>
                <card.icon size={20} />
                <strong>
                  {valid
                    ? new Intl.NumberFormat("en-US").format(
                        summary!.metrics![card.key],
                      )
                    : "—"}
                </strong>
                <h3>{card.label}</h3>
                <span>CAL FIRE summary</span>
              </article>
            ))}
          </div>
          <div className="data-status">
            <span>
              <span
                className={
                  "data-dot " + (!valid ? "unavailable" : stale ? "stale" : "")
                }
              />
              {loading
                ? "Checking the latest published figures…"
                : updated
                  ? `Last successful refresh: ${updated}`
                  : "Verified figures are not available yet."}
            </span>
            <a
              href="https://www.fire.ca.gov/incidents"
              target="_blank"
              rel="noreferrer"
            >
              Source: CAL FIRE incidents <ArrowUpRight size={12} />
            </a>
          </div>
          {!loading && (!valid || stale) && (
            <div className="data-notice" role="status">
              {stale
                ? "These are the last verified figures. The scheduled update is overdue."
                : "We’re waiting for a successful refresh from CAL FIRE. No example figures are shown."}{" "}
              <a
                href="https://www.fire.ca.gov/incidents"
                target="_blank"
                rel="noreferrer"
              >
                Check the official page for the latest information ↗
              </a>
            </div>
          )}
        </section>
        <section className="dash-bottom">
          <article className="explore-card">
            <span className="feature-icon">
              <Layers size={22} />
            </span>
            <span className="dash-kicker">FROM NUMBERS TO PLACE</span>
            <h2>Put the fire picture on the map.</h2>
            <p>
              Explore public wildfire layers, inspect individual fires, and
              measure distances across California. Bring your own GIS data for a
              closer look.
            </p>
            <a href="/map">
              Open the interactive map <ArrowUpRight size={18} />
            </a>
          </article>
          <article className="context-card">
            <span className="dash-kicker">STAY INFORMED</span>
            <h2>
              Context matters.
              <br />
              Official updates come first.
            </h2>
            <p>
              The dashboard refreshes on a daily schedule. Incident conditions
              and evacuation guidance can change more quickly.
            </p>
            <a
              href="https://www.fire.ca.gov/incidents"
              target="_blank"
              rel="noreferrer"
            >
              Current incidents & official updates <ArrowUpRight size={16} />
            </a>
            <a
              href="https://readyforwildfire.org/"
              target="_blank"
              rel="noreferrer"
            >
              Prepare your home and family <ArrowUpRight size={16} />
            </a>
          </article>
        </section>
        <footer className="dash-footer">
          <span>
            fireatlas <span>· California wildfire explorer</span>
          </span>
          <p>
            Independent project using public CAL FIRE information. Follow
            official local alerts for emergency decisions.
          </p>
        </footer>
      </main>
    </div>
  );
}
