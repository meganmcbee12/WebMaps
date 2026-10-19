import { useEffect, useState } from "react";
import {
  Flame,
  ArrowUpRight,
  Activity,
  TreePine,
  Heart,
  House,
  Clock3,
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
      </header>
      <main className="dash-main">
        <section className="dash-hero">
          <div className="hero-copy">
            <h1>California Wildfire Explorer</h1>
            <div className="hero-actions">
              <a className="dash-primary" href="/map">
                Explore the fire map <ArrowUpRight size={18} />
              </a>
            </div>
          </div>
          <section className="summary-section" aria-labelledby="summary-title">
            <div className="summary-heading">
              <div>
                <h2 id="summary-title">Statewide at a glance</h2>
              </div>
              <div className="update-badge">
                <Clock3 size={14} /> Daily refresh · CAL FIRE
              </div>
            </div>
            <p className="summary-context">
              CAL FIRE’s statewide totals—not a count of active fires.
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
                </article>
              ))}
            </div>
            <div className="data-status">
              <span>
                <span
                  className={
                    "data-dot " +
                    (!valid ? "unavailable" : stale ? "stale" : "")
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
                Source: CAL FIRE incidents <ArrowUpRight size={16} />
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
            <p className="dashboard-source-note">
              This data comes directly from{" "}
              <a
                href="https://www.fire.ca.gov/incidents"
                target="_blank"
                rel="noreferrer"
              >
                CAL FIRE’s website
              </a>{" "}
              and is updated once a day.
            </p>
          </section>
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
