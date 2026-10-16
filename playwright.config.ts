import { defineConfig } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

// Chromium 146+ uses XDG_DATA_HOME/pki/nssdb. Trust only the CA supplied
// by this cloud platform; never turn off certificate validation.
const platformCA = "/usr/local/share/ca-certificates/environment-proxy-ca.crt";
const browserData = resolve(".cache/browser-data");
if (existsSync(platformCA)) {
  const database = `${browserData}/pki/nssdb`;
  mkdirSync(database, { recursive: true });
  if (!existsSync(`${database}/cert9.db`)) {
    execFileSync("certutil", [
      "-N",
      "--empty-password",
      "-d",
      `sql:${database}`,
    ]);
  }
  execFileSync("certutil", [
    "-A",
    "-d",
    `sql:${database}`,
    "-n",
    "environment-proxy",
    "-t",
    "C,,",
    "-i",
    platformCA,
  ]);
}
const executablePath =
  process.env.CHROMIUM_PATH ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
export default defineConfig({
  testDir: "./tests",
  timeout: 90000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5173",
    headless: true,
    launchOptions: {
      executablePath,
      ...(existsSync(platformCA)
        ? { env: { ...process.env, XDG_DATA_HOME: browserData } }
        : {}),
      args: [
        "--no-sandbox",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-webgl",
      ],
    },
  },
  webServer: {
    command: "npm run dev -- --port 5173",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
    timeout: 120000,
  },
});
