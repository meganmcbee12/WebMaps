import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parseCalFireSummary, SOURCE_URL } from "./calfire.mjs";

// The official HTML already supplies the final numbers/counter targets.
// Fetching it avoids browser animation, hidden duplicate labels and browser setup.
export async function fetchCalFireSummary({
  fetchImpl = fetch,
  attempts = 3,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  onRetry = () => {},
  now = () => new Date(),
} = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let retryable = true;
    try {
      const response = await fetchImpl(SOURCE_URL, {
        headers: {
          Accept: "text/html",
          "User-Agent":
            "FireAtlas/1.0 (public CAL FIRE summary; daily refresh)",
        },
        signal: AbortSignal.timeout(25000),
      });
      if (!response.ok) {
        retryable = response.status === 429 || response.status >= 500;
        throw new Error(`CAL FIRE returned HTTP ${response.status}`);
      }
      const html = await response.text();
      // A successful HTTP response is not enough: all five fields must validate.
      // Changed markup must fail visibly rather than publish guessed figures.
      retryable = false;
      return parseCalFireSummary(html, now());
    } catch (error) {
      if (!retryable || attempt === attempts) throw error;
      onRetry(error, attempt, attempts);
      await wait(1000 * 2 ** (attempt - 1));
    }
  }
  throw new Error("No CAL FIRE refresh attempts were configured.");
}

export async function saveCalFireSummary(destination, summary) {
  const path =
    destination instanceof URL ? fileURLToPath(destination) : destination;
  const temporary = `${path}.${randomUUID()}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(temporary, JSON.stringify(summary, null, 2) + "\n", {
      flag: "wx",
    });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function refreshCalFireSummary(destination, options) {
  const summary = await fetchCalFireSummary(options);
  await saveCalFireSummary(destination, summary);
  return summary;
}
