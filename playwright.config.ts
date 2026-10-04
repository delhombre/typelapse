import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * The journeys run against what ships: one `vite build`, served by
 * `vite preview`. A dev server would test a different bundle, and its HMR
 * reloads a page mid-journey whenever anyone saves a file.
 */
const PORT = Number(process.env.E2E_PORT ?? 5271);
const BASE_URL = `http://localhost:${PORT}`;
// Outside the repository, so the build never lands in `dist/` or in a commit.
const OUT_DIR = process.env.E2E_OUT_DIR ?? join(tmpdir(), "typelapse-e2e-dist");
const build = `pnpm exec vite build --outDir "${OUT_DIR}" --emptyOutDir --logLevel warn`;
const preview = `pnpm exec vite preview --outDir "${OUT_DIR}" --port ${PORT} --strictPort`;

export default defineConfig({
	testDir: "tests/e2e",
	testMatch: "**/*.spec.ts",
	// The hosted journeys need PostgreSQL, MinIO and the worker: ticket #118.
	testIgnore: "hosted/**",
	outputDir: "test-results/e2e",
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	// A journey that needs a retry to pass is a flaky journey; CI gets one so a
	// runner hiccup does not block a merge, and the report still flags it.
	retries: process.env.CI ? 1 : 0,
	// Each worker encodes video on the CPU; two keep a 4-core runner responsive.
	workers: process.env.CI ? 2 : undefined,
	timeout: 60_000,
	expect: { timeout: 10_000 },
	reporter: process.env.CI
		? [["github"], ["list"], ["html", { open: "never", outputFolder: "playwright-report" }]]
		: [["list"]],
	use: {
		baseURL: BASE_URL,
		trace: "retain-on-failure",
		video: "retain-on-failure",
		screenshot: "only-on-failure",
		acceptDownloads: true,
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: {
		command: process.env.E2E_SKIP_BUILD ? preview : `${build} && ${preview}`,
		url: BASE_URL,
		reuseExistingServer: !process.env.CI,
		// The build bundles Monaco: about 20 s on a laptop, a minute on a runner.
		timeout: 240_000,
		env: {
			// vite build with Monaco peaks near 4.5 GB; Node's default heap dies first.
			NODE_OPTIONS: "--max-old-space-size=6144",
			// The preview proxies /api like the dev server. The local profile calls
			// none, and a port nothing listens on keeps a journey from ever reaching
			// someone else's API on the default 3001.
			TYPELAPSE_API_URL: process.env.TYPELAPSE_API_URL ?? "http://127.0.0.1:3171",
		},
	},
});
