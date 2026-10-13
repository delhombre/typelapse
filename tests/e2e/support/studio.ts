import { type Download, type Locator, type Page, test as base, expect } from "@playwright/test";

/**
 * The journeys' shared vocabulary. Everything here drives the studio the way a
 * person does (roles and labels) or reads what the studio itself persisted;
 * nothing reaches into a store, so a spec breaks when the product breaks and
 * not when a refactor renames an internal.
 */

interface JourneyFixtures {
	/** Console errors and uncaught exceptions seen during the test, in order. */
	consoleErrors: string[];
}

export const test = base.extend<JourneyFixtures>({
	consoleErrors: [
		async ({ page }, use) => {
			const errors: string[] = [];
			page.on("console", (message) => {
				if (message.type() === "error") errors.push(message.text());
			});
			page.on("pageerror", (error) => errors.push(`uncaught: ${error.message}`));
			await use(errors);
		},
		{ auto: true },
	],
	page: async ({ page }, use) => {
		// The studio guards unsaved work with beforeunload; a reload in a journey
		// is a deliberate one, so the guard is answered "leave".
		page.on("dialog", (dialog) => {
			if (dialog.type() === "beforeunload") void dialog.accept();
		});
		await use(page);
	},
});

export { expect };

/** Open the studio and wait until it can take input. */
export async function openStudio(page: Page, hash = ""): Promise<void> {
	await page.goto(`/app${hash}`);
	await expect(page.getByRole("button", { name: "Add source" })).toBeEnabled();
}

/** The scene count the project chip shows ("0 scenes", "1 scene", "2 scenes"). */
export function sceneCount(page: Page, count: number) {
	return page.getByText(new RegExp(`^${count} scenes?$`));
}

/** Open the Add source menu and pick one entry. */
export async function addSource(page: Page, item: string): Promise<void> {
	await page.getByRole("button", { name: "Add source" }).click();
	await page.getByRole("menuitem", { name: item }).click();
}

/** The layers on the stage, back to front, by their accessible names. */
export async function stageLayers(page: Page): Promise<string[]> {
	return page
		.getByRole("button", { name: /^Edit (text|image|video) layer$/ })
		.evaluateAll((elements) => elements.map((element) => element.getAttribute("aria-label") ?? ""));
}

/** Run `action` and save the download it starts under the test's output folder. */
export async function downloadFrom(
	page: Page,
	action: () => Promise<void>,
	path: string,
	timeout = 120_000,
): Promise<{ download: Download; path: string }> {
	const pending = page.waitForEvent("download", { timeout });
	await action();
	const download = await pending;
	await download.saveAs(path);
	return { download, path };
}

/** A studio link carrying a payload, the shape "Copy share link" writes. */
export function shareHash(payload: Record<string, unknown>): string {
	return `#share=${Buffer.from(JSON.stringify(payload), "utf8").toString("base64")}`;
}

/**
 * A studio link that opens a project with one scene. A fresh studio has none and
 * opens on its path (the sheet on the scenes stop, the code in Edit, #270); this
 * is the way into the studio's other resting state: the sheet at its peek, the
 * code in Preview.
 */
export function oneSceneHash(): string {
	return shareHash({
		title: "One scene",
		code: "const a = 1;",
		language: "typescript",
		themeName: "nord",
		background: "mesh:ocean",
		steps: [{ code: "const a = 1;", duration: 4000 }],
	});
}

/** A studio link carrying an unread paste, the shape the landing hero writes. */
export function importHash(source: string): string {
	return `#import=${Buffer.from(JSON.stringify({ source }), "utf8").toString("base64url")}`;
}

interface StoredLocalProject {
	id: string;
	project: { title: string };
}

/** The local project library the studio keeps in localStorage. */
export async function localLibrary(
	page: Page,
): Promise<{ activeId: string; projects: StoredLocalProject[] }> {
	return page.evaluate(() => {
		const raw = window.localStorage.getItem("typelapse:projects:v1");
		return raw ? JSON.parse(raw) : { activeId: "", projects: [] };
	});
}

interface StoredBlock {
	id: string;
	kind: string;
	text?: string;
}

interface StoredScene {
	id: string;
	blocks: StoredBlock[];
}

/**
 * Every V2 composition the studio wrote to IndexedDB. A journey waits on this
 * before a reload: the composition saves on a debounce, and "it survives a
 * reload" means "it was written", not "the timer happened to fire".
 */
export async function storedScenes(page: Page): Promise<StoredScene[]> {
	return page.evaluate(async () => {
		const name = "typelapse-studio-media";
		// Opening a database that does not exist yet would create it empty at
		// version 1, and the studio's own upgrade would then never run.
		const known = await indexedDB.databases();
		if (!known.some((info) => info.name === name)) return [];
		const database = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open(name);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		try {
			if (!database.objectStoreNames.contains("projects")) return [];
			const rows = await new Promise<{ document: { project: { scenes: StoredScene[] } } }[]>(
				(resolve, reject) => {
					const request = database.transaction("projects").objectStore("projects").getAll();
					request.onsuccess = () => resolve(request.result);
					request.onerror = () => reject(request.error);
				},
			);
			return rows.flatMap((row) => row.document.project.scenes);
		} finally {
			database.close();
		}
	});
}

/**
 * What answers to `target` around it, by asking the page: the box of every point
 * within `reach` px where `elementFromPoint` finds the target or something inside
 * it. A hit area is a pseudo-element no layout box reports, and one a parent
 * clips answers to nobody, so a box read from the DOM would flatter the control.
 */
export async function hitBox(
	target: Locator,
	reach = 14,
): Promise<{ width: number; height: number }> {
	return target.evaluate((element, reach) => {
		const box = element.getBoundingClientRect();
		let left = Number.POSITIVE_INFINITY;
		let top = Number.POSITIVE_INFINITY;
		let right = Number.NEGATIVE_INFINITY;
		let bottom = Number.NEGATIVE_INFINITY;
		const first = (value: number) => Math.floor(value) + 0.5;
		for (let y = first(box.top - reach); y < box.bottom + reach; y += 1) {
			for (let x = first(box.left - reach); x < box.right + reach; x += 1) {
				const hit = document.elementFromPoint(x, y);
				if (hit && (hit === element || element.contains(hit))) {
					left = Math.min(left, x - 0.5);
					right = Math.max(right, x + 0.5);
					top = Math.min(top, y - 0.5);
					bottom = Math.max(bottom, y + 0.5);
				}
			}
		}
		return { width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
	}, reach);
}

/** Resolves once `target` has stood still for ten frames: a spring or a slide has finished. */
export async function settled(target: Locator): Promise<void> {
	await target.evaluate(
		(element) =>
			new Promise<void>((resolve) => {
				let last = "";
				let still = 0;
				const tick = () => {
					const box = element.getBoundingClientRect();
					const now = [box.x, box.y, box.width, box.height].map((n) => n.toFixed(2)).join();
					still = now === last ? still + 1 : 0;
					last = now;
					if (still >= 10) resolve();
					else requestAnimationFrame(tick);
				};
				requestAnimationFrame(tick);
			}),
	);
}
