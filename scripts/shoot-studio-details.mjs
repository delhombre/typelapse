/**
 * Detail shots: diff-import popover (Apply), url-import popover (Fetch),
 * template gallery confirm (Load template), and the export bar with steps.
 *
 * Usage: node scripts/shoot-studio-details.mjs [outDir]
 */
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const PLAYWRIGHT = process.env.PLAYWRIGHT_CORE ?? "@playwright/test";
const { chromium } = require(PLAYWRIGHT);

const OUT = resolve(process.argv[2] ?? "/tmp/typelapse-studio-details");
const URL_ = process.env.STUDIO_URL ?? "http://localhost:5205/app";

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
	// Unset means Playwright's own downloaded browser (`pnpm exec playwright install chromium`).
	executablePath: process.env.CHROMIUM_BIN,
});

const page = await browser.newPage({
	viewport: { width: 1440, height: 900 },
	deviceScaleFactor: 2,
	colorScheme: "light",
});
await page.goto(URL_, { waitUntil: "networkidle" });
await page.waitForTimeout(3000);

// Two captured steps -> export bar controls appear.
await page.click('button:has-text("Capture")');
await page.evaluate(() => {
	// Nudge the code so the second capture differs.
	const m = window.monaco;
	const model = m?.editor.getModels()[0];
	model?.setValue(`${model.getValue()}\n// step two`);
});
await page.waitForTimeout(400);
await page.click('button:has-text("Capture")');
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/export-bar-steps.png` });

// Diff import popover with a PR URL so "play as" + Apply show.
await page.click('button[title="Import a git diff"]');
await page.waitForTimeout(400);
await page.fill('textarea[placeholder*="git diff"]', "https://github.com/foo/bar/pull/42");
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/diff-import.png` });
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// URL import popover.
await page.click('button[title="Import from URL"]');
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/url-import.png` });
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// Template gallery, then the confirm (there are unsaved edits now).
await page.click('button[aria-label="Templates"]');
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/template-gallery.png` });
await page.click("[data-template-id]");
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/template-confirm.png` });

await browser.close();
console.log(`shots in ${OUT}`);
