/**
 * Screenshots and measures the hero prototypes in a headless browser.
 *
 * Why headless rather than the Arc session: a backgrounded tab suspends
 * requestAnimationFrame, so nothing on the page actually animates there and
 * every motion measurement comes back frozen. Headless runs the clock.
 *
 * Usage: node scripts/shoot-proto.mjs [outDir]
 */
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

// Playwright is not a dependency of this project and should not become one for a
// throwaway script, so it is borrowed from wherever it already exists on the
// machine. Override both paths with env vars if they move.
const require = createRequire(import.meta.url);
const PLAYWRIGHT =
	process.env.PLAYWRIGHT_CORE ??
	"/Users/brunodogbase/.npm/_npx/218f5d799962bf90/node_modules/playwright-core";
const { chromium } = require(PLAYWRIGHT);

const OUT = resolve(process.argv[2] ?? "/tmp/typelapse-proto");
const BASE = "http://localhost:5173/proto/hero";
const VARIANTS = ["Instrument", "Bleed", "Recto", "Poster", "Stack", "Canvas"];

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

// Pinned to the browser build actually present in the cache: the borrowed
// playwright-core expects a different revision and would ask to download one.
const browser = await chromium.launch({
	executablePath:
		process.env.CHROMIUM_BIN ??
		"/Users/brunodogbase/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell",
});
const results = [];

for (const [i, name] of VARIANTS.entries()) {
	const page = await browser.newPage({
		viewport: { width: 1440, height: 900 },
		deviceScaleFactor: 2,
	});
	await page.goto(`${BASE}?v=${i + 1}`, { waitUntil: "networkidle" });
	// The engine needs Shiki loaded and a few frames of the loop run.
	await page.waitForTimeout(2600);

	const measured = await page.evaluate(() => {
		const rafFrames = () =>
			new Promise((done) => {
				let n = 0;
				const t0 = performance.now();
				const tick = () => {
					n++;
					if (performance.now() - t0 < 500) requestAnimationFrame(tick);
					else done(n);
				};
				requestAnimationFrame(tick);
			});
		return rafFrames().then(async (frames) => {
			const wait = (ms) => new Promise((r) => setTimeout(r, ms));
			const read = () =>
				[...document.querySelectorAll('.proto-hero [role="img"] span')].map(
					(s) => `${s.textContent}@${Math.round(s.getBoundingClientRect().left)}`,
				);
			const a = read();
			await wait(1400);
			const b = read();
			const art = document.querySelector('.proto-hero [role="img"][aria-label^="Live preview"]');
			const code = document.querySelector('.proto-hero [role="img"]');
			const h1 = document.querySelector(".proto-hero h1");
			const ar = art?.getBoundingClientRect();
			const cr = code?.getBoundingClientRect();
			const bottoms = [...document.querySelectorAll(".proto-hero *")]
				.map((e) => e.getBoundingClientRect().bottom)
				.filter((x) => x > 0);
			return {
				rafFramesIn500ms: frames,
				animating: JSON.stringify(a) !== JSON.stringify(b),
				tokens: a.length,
				headline: h1 ? getComputedStyle(h1).fontSize : null,
				card: ar ? `${Math.round(ar.width)}x${Math.round(ar.height)}` : null,
				code: cr ? `${Math.round(cr.width)}x${Math.round(cr.height)}` : null,
				fill: ar && cr ? `${Math.round((cr.width / ar.width) * 100)}%` : null,
				offCentre: ar && cr ? Math.round(cr.left + cr.width / 2 - (ar.left + ar.width / 2)) : null,
				pageHeight: Math.round(Math.max(...bottoms)),
			};
		});
	});

	await page.screenshot({ path: `${OUT}/${i + 1}-${name.toLowerCase()}.png` });
	await page.screenshot({
		path: `${OUT}/${i + 1}-${name.toLowerCase()}-full.png`,
		fullPage: true,
	});
	results.push({ variant: name, ...measured });
	await page.close();
}

await browser.close();
console.log(JSON.stringify(results, null, 2));
console.log(`\nshots in ${OUT}`);
