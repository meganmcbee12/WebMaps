import { readFile } from "node:fs/promises";
import { parseCalFireSummary, SOURCE_URL } from "./lib/calfire.mjs";
import {
  fetchCalFireSummary,
  saveCalFireSummary,
} from "./lib/calfire-refresh.mjs";
const path = new URL("../public/data/calfire-summary.json", import.meta.url);
try {
  let result;
  if (process.argv.includes("--browser")) {
    const { chromium } = await import("@playwright/test");
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const response = await page.goto(SOURCE_URL, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      if (!response?.ok())
        throw Error(`CAL FIRE returned HTTP ${response?.status()}`);
      await page
        .getByText("Total Emergency Responses", { exact: true })
        .first()
        .scrollIntoViewIfNeeded({ timeout: 20000 });
      await page.waitForTimeout(8000);
      result = parseCalFireSummary(await page.content());
    } finally {
      await browser.close();
    }
  } else {
    result = await fetchCalFireSummary({
      onRetry: (error, attempt, attempts) =>
        console.warn(
          `CAL FIRE attempt ${attempt}/${attempts} failed: ${error.message}. Retrying…`,
        ),
    });
  }
  await saveCalFireSummary(path, result);
  console.log(`Verified CAL FIRE metrics: ${JSON.stringify(result.metrics)}`);
  console.log(`CAL FIRE figures verified and saved at ${result.fetchedAt}`);
} catch (error) {
  console.error(`CAL FIRE refresh failed: ${error.message}`);
  if (process.env.GITHUB_ACTIONS) {
    const message = String(error.message)
      .replaceAll("%", "%25")
      .replaceAll("\r", "%0D")
      .replaceAll("\n", "%0A");
    console.error(`::error title=CAL FIRE refresh failed::${message}`);
  }
  let previous;
  try {
    previous = JSON.parse(await readFile(path, "utf8"));
  } catch {}
  console.error(
    previous?.fetchedAt
      ? `Keeping last verified figures from ${previous.fetchedAt}.`
      : "No verified figures available; the dashboard will show an unavailable state.",
  );
  if (!process.argv.includes("--allow-stale")) process.exitCode = 1;
}
