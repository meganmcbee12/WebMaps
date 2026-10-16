import { test, expect } from "@playwright/test";
test("loads the real public NIFC feature service and satellite tiles", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("EXPLORER READY")).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole("button", { name: "Add NIFC perimeters" }).click();
  await expect(
    page.getByText("NIFC current fire perimeters", { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole("alert")).toHaveCount(0);
  const imagery = page.waitForResponse(
    (r) =>
      r.url().includes("World_Imagery/MapServer/tile/") && r.status() === 200,
    { timeout: 30000 },
  );
  await page.getByRole("button", { name: "Satellite", exact: true }).click();
  await imagery;
  await page.getByLabel("Return to California").click();
  await page.screenshot({ path: "test-results/satellite.png" });
});
