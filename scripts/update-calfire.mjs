import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parseCalFireSummary, SOURCE_URL } from "./lib/calfire.mjs";
const path = new URL("../public/data/calfire-summary.json", import.meta.url);
try {
  let html;
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
      html = await page.content();
    } finally {
      await browser.close();
    }
  } else {
    const response = await fetch(SOURCE_URL, {
      headers: {
        Accept: "text/html",
        "User-Agent": "FireAtlas/1.0 (public CAL FIRE summary; daily refresh)",
      },
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok)
      throw new Error(`CAL FIRE returned HTTP ${response.status}`);
    html = await response.text();
  }
  const result = parseCalFireSummary(html);
  await mkdir(new URL("../public/data/", import.meta.url), { recursive: true });
  await writeFile(path, JSON.stringify(result, null, 2) + "\n");
  console.log(`CAL FIRE figures verified and saved at ${result.fetchedAt}`);
} catch (error) {
  console.error(`CAL FIRE refresh failed: ${error.message}`);
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
