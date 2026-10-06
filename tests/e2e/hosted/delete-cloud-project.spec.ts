import pg from "pg";
import {
	HOSTED,
	cloudProjectCount,
	makeCreator,
	newAccount,
	newestCloudProject,
	openAccountPanel,
	renderJobsOf,
	signUpByApi,
	signUpInIsland,
	signedOut,
} from "../support/hosted";
import { expect, openStudio, test } from "../support/studio";

/**
 * Deleting a cloud project from the studio, end to end. One Creator render
 * feeds the journey (the worker's Remotion render is the slow part): the project
 * is saved by the Cloud render itself, its page is made public, and then the
 * island deletes it. What the person was told goes with it (the revisions, the
 * renders and their share pages) is read back from the service database and
 * from the public routes, and the studio is shown still standing on its own
 * project.
 */
const owner = newAccount("deleter");

/** What the database keeps that a person cannot see: the files a render stored, and the notes to delete them. */
async function storedFilesOf(jobId: string): Promise<{ video: string; poster: string }> {
	const pool = new pg.Pool({ connectionString: HOSTED.databaseUrl, max: 1 });
	try {
		const result = await pool.query(
			"SELECT output_object_key AS video, output_poster_key AS poster FROM render_jobs WHERE id = $1",
			[jobId],
		);
		return result.rows[0];
	} finally {
		await pool.end();
	}
}

async function notedForDeletion(keys: string[]): Promise<string[]> {
	const pool = new pg.Pool({ connectionString: HOSTED.databaseUrl, max: 1 });
	try {
		const result = await pool.query(
			"SELECT object_key FROM object_deletion_outbox WHERE object_key = ANY($1) ORDER BY object_key",
			[keys],
		);
		return result.rows.map((row) => String(row.object_key));
	} finally {
		await pool.end();
	}
}

test("a person deletes a cloud project from the island, and its renders and their pages go with it", async ({
	page,
}) => {
	const status = page.getByTestId("cloud-render-status");
	let jobId = "";
	let projectId = "";

	await test.step("a Creator renders on Cloud and publishes the page", async () => {
		await openStudio(page);
		await page.getByRole("button", { name: "Add scene" }).click();
		await signUpInIsland(page, owner);
		await makeCreator(owner.email);
		await page.reload();
		await page.getByRole("button", { name: /^Export · / }).click();
		await page.getByRole("group", { name: "FPS" }).getByRole("button", { name: "30" }).click();
		await page.getByRole("group", { name: "Where" }).getByRole("button", { name: "Cloud" }).click();
		await page.getByRole("button", { name: /^Render · / }).click();
		await expect(status).toContainText(/^Rendered on Typelapse Cloud · \d/, { timeout: 180_000 });
		await status.getByRole("button", { name: "Copy public link" }).click();
		await expect(status).toContainText("Public link copied");

		jobId = (await renderJobsOf(owner.email))[0]?.id ?? "";
		projectId = (await newestCloudProject(owner.email)).id;
		expect(jobId).not.toBe("");
		const visitor = await signedOut();
		expect((await visitor.get(`/v/${jobId}`)).status()).toBe(200);
		await visitor.dispose();
	});

	const stored = await storedFilesOf(jobId);
	expect(stored.video).toContain(`/projects/${projectId}/renders/${jobId}/`);

	await test.step("another account cannot delete it, and cannot tell it exists", async () => {
		const stranger = await signUpByApi(newAccount("stranger"));
		const refused = await stranger.delete(`/api/projects/${projectId}`);
		expect(refused.status()).toBe(404);
		const missing = await stranger.delete("/api/projects/project_nobody");
		expect(missing.status()).toBe(404);
		expect(await refused.json()).toEqual(await missing.json());
		expect(await cloudProjectCount(owner.email)).toBe(1);
		await stranger.dispose();
	});

	const panel = await openAccountPanel(page, owner);

	await test.step("the island lists it as the cloud copy of the open project", async () => {
		await panel.getByRole("button", { name: "Cloud projects" }).click();
		await expect(panel.getByRole("heading", { name: "Cloud projects" })).toBeVisible();
		const row = panel.getByRole("listitem");
		await expect(row).toHaveCount(1);
		await expect(row).toContainText("Open now");
	});

	await test.step("Delete asks first, names what goes, and keeping it deletes nothing", async () => {
		await panel.getByRole("button", { name: /^Delete / }).click();
		const question = panel.locator("[data-confirm-discard]");
		await expect(question).toContainText(
			"Its revisions, media, renders and their share pages go with it.",
		);
		await expect(question.getByRole("button", { name: "Keep project" })).toBeFocused();
		await question.getByRole("button", { name: "Keep project" }).click();
		await expect(question).toHaveCount(0);
		expect(await cloudProjectCount(owner.email)).toBe(1);
		expect(await renderJobsOf(owner.email)).toHaveLength(1);
	});

	await test.step("deleting it removes the project, the render, its page and its files' notes", async () => {
		await panel.getByRole("button", { name: /^Delete / }).click();
		await panel.getByRole("button", { name: "Delete project" }).click();
		await expect(panel.getByText(/^Deleted /)).toBeVisible();
		await expect(panel.getByRole("listitem")).toHaveCount(0);

		expect(await cloudProjectCount(owner.email)).toBe(0);
		expect(await renderJobsOf(owner.email)).toEqual([]);
		const visitor = await signedOut();
		expect((await visitor.get(`/v/${jobId}`)).status()).toBe(404);
		expect((await visitor.get(`/v/${jobId}/video`, { maxRedirects: 0 })).status()).toBe(404);
		await visitor.dispose();
		// The bucket is outside the cascade: each file has a durable note for the cleanup worker.
		expect(await notedForDeletion([stored.video, stored.poster])).toEqual(
			[stored.video, stored.poster].sort(),
		);
	});

	await test.step("the studio stays on its own project, on this device, and offers to save again", async () => {
		await panel.getByRole("button", { name: "Back to account" }).click();
		await expect(panel.getByText("On this device")).toBeVisible();
		await expect(panel.getByText("Cloud copy needs attention")).toHaveCount(0);
		await page.keyboard.press("Escape");
		await expect(page.getByText("1 scene", { exact: true }).first()).toBeVisible();
		// The render it showed is gone with its project, and the status says so.
		await expect(status).toContainText("This cloud render is no longer available.");
	});

	await test.step("a new save makes a new cloud project instead of failing on the old one", async () => {
		const again = await openAccountPanel(page, owner);
		await again.getByRole("button", { name: "Save this project to cloud" }).click();
		await expect(again.getByText("Cloud copy saved")).toBeVisible();
		expect(await cloudProjectCount(owner.email)).toBe(1);
		expect((await newestCloudProject(owner.email)).id).not.toBe(projectId);
	});
});
