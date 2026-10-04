/**
 * Screenshots the studio (/app) in light and dark, and dumps Monaco's model
 * markers so a red squiggle can be diagnosed instead of guessed at.
 *
 * Usage: node scripts/shoot-studio.mjs [outDir]
 */
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const PLAYWRIGHT = process.env.PLAYWRIGHT_CORE ?? "@playwright/test";
const { chromium } = require(PLAYWRIGHT);

const OUT = resolve(process.argv[2] ?? "/tmp/typelapse-studio");
const URL_ = process.env.STUDIO_URL ?? "http://localhost:5205/app";

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
	// Unset means Playwright's own downloaded browser (`pnpm exec playwright install chromium`).
	executablePath: process.env.CHROMIUM_BIN,
});

for (const mode of ["light", "dark"]) {
	const page = await browser.newPage({
		viewport: { width: 1440, height: 900 },
		deviceScaleFactor: 2,
		colorScheme: mode,
	});
	await page.goto(URL_, { waitUntil: "networkidle" });
	await page.waitForTimeout(3500);

	// Monaco markers: the diagnosis for any squiggle.
	const markers = await page.evaluate(() => {
		const m = window.monaco;
		if (!m) return "no monaco global";
		return m.editor.getModelMarkers({}).map((x) => ({
			owner: x.owner,
			severity: x.severity,
			code: x.code,
			message: x.message,
			range: [x.startLineNumber, x.startColumn, x.endLineNumber, x.endColumn],
		}));
	});
	console.log(`--- ${mode} markers ---`);
	console.log(JSON.stringify(markers, null, 1));

	const probe = await page.evaluate(() => {
		const html = document.documentElement;
		return {
			htmlBg: getComputedStyle(html).backgroundColor,
			colorScheme: getComputedStyle(html).colorScheme,
			studioBg: getComputedStyle(document.querySelector(".studio-root")).backgroundColor,
		};
	});
	console.log(`--- ${mode} probe ---`, JSON.stringify(probe));

	await page.screenshot({ path: `${OUT}/studio-${mode}.png` });
	await page.close();
}

await browser.close();
console.log(`shots in ${OUT}`);
