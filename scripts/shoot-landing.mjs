/**
 * Screenshots and measures the landing page, section by section.
 *
 * Why headless rather than a real browser tab: a backgrounded tab suspends
 * requestAnimationFrame, so nothing on the page animates there and every motion
 * measurement comes back frozen. Headless runs the clock.
 *
 * Usage: node scripts/shoot-landing.mjs [outDir]
 *   PLAYWRIGHT_CORE=... CHROMIUM_BIN=... to point at another install.
 */
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

// The project's own @playwright/test by default; PLAYWRIGHT_CORE points at another install.
const require = createRequire(import.meta.url);
const PLAYWRIGHT = process.env.PLAYWRIGHT_CORE ?? "@playwright/test";
const { chromium } = require(PLAYWRIGHT);

const OUT = resolve(process.argv[2] ?? "/tmp/typelapse-landing");
const URL_ = process.env.LANDING_URL ?? "http://localhost:5173/";

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
	// Unset means Playwright's own downloaded browser (`pnpm exec playwright install chromium`).
	executablePath: process.env.CHROMIUM_BIN,
});

const page = await browser.newPage({
	viewport: { width: 1440, height: 900 },
	deviceScaleFactor: 2,
});
await page.goto(URL_, { waitUntil: "networkidle" });
await page.waitForTimeout(2600);

// Scroll the whole page once so every reveal has fired, then come back up: the
// sections animate in on scroll, and shooting them unrevealed would photograph
// a page no visitor ever sees.
await page.evaluate(async () => {
	const step = window.innerHeight * 0.8;
	for (let y = 0; y < document.body.scrollHeight; y += step) {
		window.scrollTo(0, y);
		await new Promise((r) => setTimeout(r, 220));
	}
	window.scrollTo(0, 0);
	await new Promise((r) => setTimeout(r, 600));
});

const sections = await page.evaluate(() => {
	const out = [];
	const nodes = document.querySelectorAll("main > section, main > div > section");
	nodes.forEach((el, i) => {
		const r = el.getBoundingClientRect();
		const heading = el.querySelector("h1, h2");
		const eyebrow = el.querySelector("p, span");
		out.push({
			index: i,
			top: Math.round(r.top + window.scrollY),
			height: Math.round(r.height),
			heading: heading?.textContent?.trim().replace(/\s+/g, " ").slice(0, 56) ?? null,
			headingSize: heading ? getComputedStyle(heading).fontSize : null,
			headingLeading: heading ? getComputedStyle(heading).lineHeight : null,
			headingTracking: heading ? getComputedStyle(heading).letterSpacing : null,
			eyebrow: eyebrow?.textContent?.trim().replace(/\s+/g, " ").slice(0, 40) ?? null,
			paddingY: `${getComputedStyle(el).paddingTop} / ${getComputedStyle(el).paddingBottom}`,
		});
	});
	return out;
});

for (const s of sections) {
	await page.evaluate((y) => window.scrollTo(0, y), s.top);
	await page.waitForTimeout(700);
	const name = `${String(s.index).padStart(2, "0")}-${(s.heading ?? "section")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.slice(0, 32)
		.replace(/^-|-$/g, "")}`;
	await page.screenshot({ path: `${OUT}/${name}.png` });
}

await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/full.png`, fullPage: true });

const pageHeight = await page.evaluate(() => document.body.scrollHeight);
await browser.close();

console.log(JSON.stringify({ pageHeight, sections }, null, 2));
console.log(`\nshots in ${OUT}`);
