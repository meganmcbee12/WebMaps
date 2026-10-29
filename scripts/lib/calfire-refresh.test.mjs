import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
  mkdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  fetchCalFireSummary,
  refreshCalFireSummary,
  saveCalFireSummary,
} from "./calfire-refresh.mjs";
const html = `<body>${["Total Emergency Responses", "Wildfires", "Acres Burned", "Fatalities", "Structures Destroyed"].map((label, i) => `<article><strong data-count="${[500000, 6300, 339000, 3, 177][i]}">0</strong><span>${label}</span></article>`).join("")}</body>`;
const response = (status = 200, body = html) => ({
  ok: status === 200,
  status,
  text: async () => body,
});
const wait = async () => {};
async function temporary(run) {
  const dir = await mkdtemp(join(tmpdir(), "calfire-refresh-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("validates raw HTML counter targets without launching a browser", async () => {
  let requests = 0;
  const summary = await fetchCalFireSummary({
    fetchImpl: async (url, options) => {
      requests++;
      assert.equal(url, "https://www.fire.ca.gov/incidents");
      assert.ok(options.signal);
      return response();
    },
    now: () => new Date("2026-10-29T15:00:00Z"),
  });
  assert.equal(requests, 1);
  assert.equal(summary.metrics.wildfires, 6300);
  assert.equal(summary.fetchedAt, "2026-10-29T15:00:00.000Z");
});

test("retries network failures and temporary HTTP errors before publishing", async () => {
  let requests = 0;
  const delays = [];
  await temporary(async (dir) => {
    const file = join(dir, "summary.json");
    await writeFile(file, "previous snapshot");
    const summary = await refreshCalFireSummary(file, {
      fetchImpl: async () => {
        requests++;
        if (requests === 1) throw new TypeError("Network interrupted");
        if (requests === 2) return response(503);
        return response();
      },
      wait: async (ms) => delays.push(ms),
    });
    assert.equal(requests, 3);
    assert.deepEqual(delays, [1000, 2000]);
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), summary);
    assert.deepEqual(await readdir(dir), ["summary.json"]);
  });
});

test("persistent HTTP errors fail and preserve the previous snapshot byte-for-byte", async () => {
  await temporary(async (dir) => {
    const file = join(dir, "summary.json"),
      previous =
        '{"fetchedAt":"2026-10-20T22:00:00Z","metrics":{"wildfires":6200}}\n';
    await writeFile(file, previous);
    let attempts = 0;
    await assert.rejects(
      () =>
        refreshCalFireSummary(file, {
          fetchImpl: async () => {
            attempts++;
            return response(503);
          },
          wait,
        }),
      /HTTP 503/,
    );
    assert.equal(attempts, 3);
    assert.equal(await readFile(file, "utf8"), previous);
    assert.deepEqual(await readdir(dir), ["summary.json"]);
  });
});

test("invalid page responses fail without replacing verified data", async () => {
  await temporary(async (dir) => {
    const file = join(dir, "summary.json");
    await writeFile(file, "last verified data");
    let attempts = 0;
    await assert.rejects(
      () =>
        refreshCalFireSummary(file, {
          fetchImpl: async () => {
            attempts++;
            return response(200, "<h1>Unavailable</h1>");
          },
          wait,
        }),
      /missing a verified/,
    );
    assert.equal(attempts, 1);
    assert.equal(await readFile(file, "utf8"), "last verified data");
  });
});

test("access denials fail immediately instead of pretending the refresh succeeded", async () => {
  let attempts = 0;
  await assert.rejects(
    () =>
      fetchCalFireSummary({
        fetchImpl: async () => {
          attempts++;
          return response(403);
        },
        wait,
      }),
    /HTTP 403/,
  );
  assert.equal(attempts, 1);
});

test("failed initial refresh creates no fake or empty snapshot", async () => {
  await temporary(async (dir) => {
    await assert.rejects(() =>
      refreshCalFireSummary(join(dir, "summary.json"), {
        fetchImpl: async () => response(200, ""),
        wait,
      }),
    );
    assert.deepEqual(await readdir(dir), []);
  });
});

test("failed atomic replacement cleans up temporary files", async () => {
  await temporary(async (dir) => {
    const target = join(dir, "existing-directory");
    await mkdir(target);
    await writeFile(join(target, "preserved.txt"), "keep");
    await assert.rejects(() => saveCalFireSummary(target, { metrics: {} }));
    assert.equal(await readFile(join(target, "preserved.txt"), "utf8"), "keep");
    assert.deepEqual(await readdir(dir), ["existing-directory"]);
  });
});
