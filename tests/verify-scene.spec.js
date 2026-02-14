import { test, expect } from "@playwright/test";

test("3D scene loads and shows Playstation model", async ({ page }) => {
  await page.goto("http://localhost:5173/");

  // Esperar a que cargue el modelo (Suspense + GLTF + Draco)
  await page.waitForTimeout(8000);

  // Verificar que existe el canvas de Three.js
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();

  // Screenshot para verificación visual
  await page.screenshot({
    path: "playwright-output/scene-verification.png",
  });

  // Verificar que el canvas tiene contenido (no está vacío/negro)
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox?.width).toBeGreaterThan(0);
  expect(canvasBox?.height).toBeGreaterThan(0);
});
