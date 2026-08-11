/**
 * Browser verification for the template gallery.
 *
 * For each catalog entry: open the gallery, load it, check the editor holds the
 * template's first frame, play the morph through once, and screenshot a
 * mid-morph frame. Then check the unsaved-edits confirm fires when it should
 * and stays out of the way when it should not.
 *
 * Run against a dev server on :5239. Not part of the app or the test suite.
 */
import { mkdirSync } from "node:fs";

/**
 * Playwright is not a dependency of this project: point PLAYWRIGHT_CORE at an
 * installed copy, and CHROMIUM at a headless binary.
 *
 *   BASE_URL=http://localhost:5239 \
 *   PLAYWRIGHT_CORE=/path/to/playwright-core/index.mjs \
 *   CHROMIUM=/path/to/chrome-headless-shell \
 *   node scripts/verify-template-gallery.mjs
 */
const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? "playwright-core");

const BASE = process.env.BASE_URL ?? "http://localhost:5239";
const SHOTS = process.env.SHOTS_DIR ?? "/tmp/typelapse-gallery";
const EXECUTABLE = process.env.CHROMIUM;

mkdirSync(SHOTS, { recursive: true });

const failures = [];
const notes = [];

function check(condition, message) {
	if (condition) {
		notes.push(`  ok   ${message}`);
		return true;
	}
	failures.push(message);
	notes.push(`  FAIL ${message}`);
	return false;
}

const browser = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

/** Console/page errors, reset per template so a failure is attributable. */
let errors = [];
context.on("console", (msg) => {
	if (msg.type() === "error") {
		errors.push(`console: ${msg.text()}`);
	}
});
context.on("weberror", (err) => {
	errors.push(`pageerror: ${err.error().message}`);
});

const page = await context.newPage();
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

async function openStudio() {
	await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
	await page.waitForSelector(".monaco-editor", { timeout: 30000 });
	// Let the highlighter finish its first plan before touching anything.
	await page.waitForTimeout(1200);
}

async function editorValue() {
	return page.evaluate(() => {
		const monaco = window.monaco;
		const model = monaco?.editor?.getModels?.()[0];
		return model ? model.getValue() : null;
	});
}

await openStudio();

// The catalog is the source of truth for what to assert; pull it from the app's
// own module graph rather than restating it here.
const catalog = await page.evaluate(async () => {
	const mod = await import("/src/application/templates/catalog.ts");
	return mod.TEMPLATE_CATALOG.map((t) => ({
		id: t.id,
		name: t.name,
		language: t.language,
		firstCode: t.project.steps[0].code,
		title: t.project.title,
		themeName: t.project.themeName,
		transitionMs: t.project.transitionMs ?? 650,
		durations: t.project.steps.map((s) => s.duration),
	}));
});

console.log(`catalog: ${catalog.length} templates`);

async function openGallery() {
	await page.click('button[aria-haspopup="dialog"]');
	await page.waitForSelector("[data-template-gallery]", { state: "visible", timeout: 5000 });
}

for (const template of catalog) {
	errors = [];
	notes.push(`\n── ${template.id} (${template.name})`);

	await openStudio();
	await openGallery();

	const cardCount = await page.locator("[data-template-id]").count();
	check(cardCount === catalog.length, `gallery shows all ${catalog.length} cards`);

	await page.click(`[data-template-id="${template.id}"]`);
	await page.waitForSelector("[data-template-gallery]", { state: "detached", timeout: 5000 });
	await page.waitForTimeout(900);

	const value = await editorValue();
	check(
		value === template.firstCode,
		`editor holds the template's first frame (${JSON.stringify(String(value).slice(0, 40))}…)`,
	);

	const title = await page.inputValue('input[type="text"]');
	check(title === template.title, `title is "${template.title}" (got "${title}")`);

	// Play once through, screenshotting mid-way through the first morph.
	const play = page.locator('button[title="Play"]');
	check((await play.count()) > 0, "playback controls are present");
	await play.first().click();

	const midMorph = template.durations[0] + template.transitionMs / 2;
	await page.waitForTimeout(midMorph);
	await page.screenshot({ path: `${SHOTS}/${template.id}-mid-morph.png` });

	const total =
		template.durations.reduce((a, b) => a + b, 0) +
		(template.durations.length - 1) * template.transitionMs;
	await page.waitForTimeout(total - midMorph + 800);

	check(
		errors.length === 0,
		`played through with no console errors${errors.length ? `: ${errors.join(" | ")}` : ""}`,
	);
}

/* ──────────── The confirm fires when it should, and not when it shouldn't ──────────── */

notes.push("\n── unsaved-edits confirm");
errors = [];

await openStudio();

// 1. Pristine studio, straight from load: no confirm.
await openGallery();
await page.click('[data-template-id="react-hook"]');
let confirmShown = (await page.locator("[data-template-confirm]").count()) > 0;
check(!confirmShown, "no confirm on a pristine studio");
await page.waitForSelector("[data-template-gallery]", { state: "detached" });
await page.waitForTimeout(600);

// 2. Freshly loaded template, untouched: still no confirm.
await openGallery();
await page.click('[data-template-id="grow-a-test-suite"]');
confirmShown = (await page.locator("[data-template-confirm]").count()) > 0;
check(!confirmShown, "no confirm right after loading a template");
await page.waitForSelector("[data-template-gallery]", { state: "detached" });
await page.waitForTimeout(600);

// 3. Type in the editor, then try to load: the confirm must appear.
await page.click(".monaco-editor .view-lines");
await page.keyboard.type("// mine");
await page.waitForTimeout(400);
const editedValue = await editorValue();
check(editedValue?.includes("// mine") === true, "the edit reached the editor");

await openGallery();
await page.click('[data-template-id="batch-the-query"]');
await page.waitForSelector("[data-template-confirm]", { timeout: 3000 }).catch(() => {});
confirmShown = (await page.locator("[data-template-confirm]").count()) > 0;
check(confirmShown, "confirm appears once the snippet has the user's edits");
await page.screenshot({ path: `${SHOTS}/confirm.png` });

// 4. Backing out keeps the work.
await page.click("text=Keep my snippet");
await page.waitForTimeout(400);
const afterCancel = await editorValue();
check(afterCancel?.includes("// mine") === true, "backing out keeps the user's snippet");
check(
	(await page.locator("[data-template-gallery]").count()) > 0,
	"backing out leaves the gallery open",
);

// 5. Confirming loads the template.
await page.click('[data-template-id="batch-the-query"]');
await page.waitForSelector("[data-template-confirm]", { timeout: 3000 });
await page.click("[data-template-confirm-load]");
await page.waitForSelector("[data-template-gallery]", { state: "detached", timeout: 5000 });
await page.waitForTimeout(700);
const afterConfirm = await editorValue();
const batch = catalog.find((t) => t.id === "batch-the-query");
check(afterConfirm === batch.firstCode, "confirming loads the template");

check(
	errors.length === 0,
	`confirm flow ran with no console errors${errors.length ? `: ${errors.join(" | ")}` : ""}`,
);

await browser.close();

console.log(notes.join("\n"));
console.log(`\nscreenshots: ${SHOTS}`);
if (failures.length > 0) {
	console.log(`\n${failures.length} FAILURE(S):`);
	for (const f of failures) {
		console.log(`  - ${f}`);
	}
	process.exit(1);
}
console.log("\nall checks passed");
