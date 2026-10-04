import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { HOSTED, hostedServerEnv } from "./tests/e2e/support/hosted";

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

/**
 * `E2E_PROFILE=hosted` (what `pnpm e2e:hosted` sets) swaps the whole run for the
 * hosted journeys: a hosted build, the API and the render worker against the
 * PostgreSQL and MinIO that tests/e2e/hosted/services.sh (or CI) provides.
 * Playwright starts every webServer whichever project is picked, so the profile
 * decides which servers and projects exist, not a --project filter.
 */
const HOSTED_PROFILE = process.env.E2E_PROFILE === "hosted";
const HOSTED_OUT_DIR =
	process.env.E2E_HOSTED_OUT_DIR ?? join(tmpdir(), "typelapse-e2e-hosted-dist");
const hostedBuild = `pnpm exec vite build --outDir "${HOSTED_OUT_DIR}" --emptyOutDir --logLevel warn`;
const hostedPreview = `pnpm exec vite preview --outDir "${HOSTED_OUT_DIR}" --port ${HOSTED.appPort} --strictPort`;

const localServer = {
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
};

// Never reused: a journey against an API, a worker or a build it did not start
// proves nothing about this checkout.
const hostedServers = [
	{
		name: "API",
		// Migrations and the bucket first: the API assumes both exist.
		command: "pnpm exec tsx tests/e2e/hosted/prepare.ts && pnpm exec tsx server/index.ts",
		url: `${HOSTED.apiUrl}/health`,
		reuseExistingServer: false,
		timeout: 120_000,
		stdout: "pipe" as const,
		env: hostedServerEnv(),
	},
	{
		name: "Worker",
		command: "pnpm exec tsx server/workers/hosted-render.entrypoint.ts",
		wait: { stdout: /Hosted render worker started/ },
		reuseExistingServer: false,
		timeout: 60_000,
		stdout: "pipe" as const,
		env: hostedServerEnv(),
	},
	{
		name: "Preview",
		command: process.env.E2E_SKIP_BUILD ? hostedPreview : `${hostedBuild} && ${hostedPreview}`,
		url: HOSTED.appUrl,
		reuseExistingServer: false,
		timeout: 240_000,
		env: {
			NODE_OPTIONS: "--max-old-space-size=6144",
			VITE_TYPELAPSE_DEPLOYMENT_MODE: "hosted",
			TYPELAPSE_API_URL: HOSTED.apiUrl,
		},
	},
];

export default defineConfig({
	testDir: "tests/e2e",
	testMatch: "**/*.spec.ts",
	outputDir: HOSTED_PROFILE ? "test-results/e2e-hosted" : "test-results/e2e",
	// The hosted journeys share one render worker and one database.
	fullyParallel: !HOSTED_PROFILE,
	forbidOnly: Boolean(process.env.CI),
	// A journey that needs a retry to pass is a flaky journey; CI gets one so a
	// runner hiccup does not block a merge, and the report still flags it.
	retries: process.env.CI ? 1 : 0,
	// Each worker encodes video on the CPU; two keep a 4-core runner responsive.
	// Hosted: one, since the render worker takes one job at a time anyway.
	workers: HOSTED_PROFILE ? 1 : process.env.CI ? 2 : undefined,
	// A Cloud render waits for Remotion on the worker: a minute on a runner.
	timeout: HOSTED_PROFILE ? 240_000 : 60_000,
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
	projects: HOSTED_PROFILE
		? [
				{
					name: "hosted",
					testDir: "tests/e2e/hosted",
					use: {
						...devices["Desktop Chrome"],
						baseURL: HOSTED.appUrl,
						// A Cloud download and the public page's video come from MinIO
						// behind the self-signed certificate services.sh makes.
						ignoreHTTPSErrors: true,
						permissions: ["clipboard-read", "clipboard-write"],
					},
				},
			]
		: [
				{
					name: "chromium",
					// The hosted journeys need PostgreSQL, MinIO and the worker.
					testIgnore: "**/hosted/**",
					use: { ...devices["Desktop Chrome"] },
				},
			],
	webServer: HOSTED_PROFILE ? hostedServers : localServer,
});
