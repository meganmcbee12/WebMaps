import { load } from "cheerio";
export const SOURCE_URL = "https://www.fire.ca.gov/incidents";
const fields = {
  emergencyResponses: ["Total Emergency Responses", "Emergency Responses"],
  wildfires: ["Wildfires", "Wildland Fires"],
  acresBurned: ["Acres Burned"],
  fatalities: ["Fatalities", "Confirmed Fatalities"],
  structuresDestroyed: [
    "Structures Destroyed",
    "Structures Destroyed / Damaged",
  ],
};
const normalize = (text) => text.replace(/\s+/g, " ").trim();
const number = (text) =>
  /^\d[\d,]*(?:\.\d+)?$/.test(text.trim())
    ? Number(text.replaceAll(",", ""))
    : null;
export function parseCalFireSummary(html, now = new Date()) {
  const $ = load(html);
  $("script,style,noscript,nav,footer").remove();
  const metrics = {};
  for (const [key, labels] of Object.entries(fields)) {
    let value = null;
    const matches = $("body *").filter((_, el) =>
      labels.some(
        (label) =>
          normalize($(el).text()).toLowerCase() === label.toLowerCase(),
      ),
    );
    matches.each((_, el) => {
      if (value !== null) return;
      let candidate = $(el);
      for (
        let depth = 0;
        depth < 4 && candidate.length;
        depth++, candidate = candidate.parent()
      ) {
        // Statistic cards usually pair a label with one numeric text node or
        // a counter attribute. Never extract a number from unrelated prose.
        const text = normalize(candidate.text());
        for (const label of labels) {
          const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const match = text.match(
            new RegExp(
              `^(?:([\\d,]+(?:\\.\\d+)?)\\s*${escaped}|${escaped}\\s*([\\d,]+(?:\\.\\d+)?))$`,
              "i",
            ),
          );
          if (match) value = number(match[1] || match[2]);
        }
        for (const attr of [
          "data-count",
          "data-countto",
          "data-count-to",
          "data-target",
          "data-value",
          "data-counter",
          "data-counter-value",
          "data-purecounter-end",
          "data-count-to",
        ]) {
          const nodes = candidate.find(`[${attr}]`).addBack(`[${attr}]`);
          if (nodes.length === 1) {
            const n = number(nodes.attr(attr) || "");
            if (n !== null) value = n;
          }
        }
        if (value !== null) break;
      }
    });
    if (value === null || !Number.isFinite(value) || value < 0)
      throw new Error(
        `CAL FIRE summary is missing a verified ${key} value. The page format may have changed.`,
      );
    metrics[key] = value;
  }
  if (
    metrics.emergencyResponses === 0 &&
    metrics.wildfires === 0 &&
    metrics.acresBurned === 0
  )
    throw new Error(
      "CAL FIRE counters appear unpopulated; refusing to publish placeholder zeros.",
    );
  return {
    schemaVersion: 1,
    sourceUrl: SOURCE_URL,
    fetchedAt: now.toISOString(),
    reportingPeriod: "Statewide figures as reported by CAL FIRE",
    metrics,
  };
}
