import { defineConfig } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

// Fresh Chromium profiles use XDG_DATA_HOME/pki/nssdb. An existing
// ~/.pki/nssdb takes precedence and needs the platform CA imported at setup.
// Trust only the platform CA; never turn off certificate validation.
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
      // Chromium does not inherit Node's HTTP proxy handling. Keep local
      // Vite requests direct while routing public services through the cloud proxy.
      ...(process.env.HTTPS_PROXY
        ? {
            proxy: {
              server: process.env.HTTPS_PROXY,
              bypass: "localhost,127.0.0.1,[::1]",
            },
          }
        : {}),
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
