/** @type {import('@playwright/test').PlaywrightTestConfig} */
export default {
  use: {
    headless: false,
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      args: [
        "--use-gl=desktop",
        "--use-angle=default",
        "--ignore-gpu-blocklist",
      ],
    },
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173/",
    reuseExistingServer: true,
  },
};
