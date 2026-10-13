import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import {
	apiKeysOf,
	makeCreator,
	newAccount,
	newestCloudProject,
	openAccountPanel,
	renderJobsOf,
	signUpInIsland,
	signedOut,
} from "../support/hosted";
import { probeVideo } from "../support/media";
import { expect, openStudio, test } from "../support/studio";

/**
 * An API key is the credential for a caller with no browser. The journey is the
 * one a script lives: a person makes a key in the island and copies it once, a
 * caller with no cookie renders with it, the person revokes it, and the next
 * request is refused. The unit tests hold the rules; this holds that the real
 * routes, the real database and the real island agree.
 */

const RENDER = { format: "mp4", width: 1920, height: 1080, fps: 30, includeAudio: true };
const KEY = /^tlk_[0-9a-f]{8}_[0-9a-f]{64}$/;

test.describe("Hosted API keys: a script renders on Typelapse Cloud without a browser", () => {
	// One account, one sign-up: Better Auth allows three sign-ups per ten seconds per
	// client, and every journey is that one client. The account is free first and a
	// Creator later, so the key meets both plans.
	test("a key is made in the island, refused by the free plan, renders for a Creator, and stops when revoked", async ({
		page,
	}, testInfo) => {
		const owner = newAccount("keys");
		let key = "";
		let jobId = "";

		await openStudio(page);
		await page.getByRole("button", { name: "Add scene" }).click();
		await signUpInIsland(page, owner);
		const panel = await openAccountPanel(page, owner);

		await test.step("the project has a cloud copy for the script to name", async () => {
			await panel.getByRole("button", { name: "Save this project to cloud" }).click();
			await expect(panel.getByText("Cloud copy saved", { exact: true })).toBeVisible();
		});
		const project = await newestCloudProject(owner.email);

		await test.step("the island makes a key: shown once, copied, then gone from the page", async () => {
			await panel.getByRole("tab", { name: "API keys" }).click();
			await expect(panel.getByRole("heading", { name: "API keys" })).toBeVisible();
			await expect(panel.getByText("No keys yet. Create one above.")).toBeVisible();

			await panel.getByLabel("Name").fill("GitHub Action");
			await panel.getByRole("radio", { name: "1 year" }).check();
			await panel.getByRole("button", { name: "Create key" }).click();

			const shown = panel.getByRole("region", { name: "Your new key" }).locator("code");
			await expect(shown).toHaveText(KEY);
			key = (await shown.textContent()) ?? "";
			await panel.getByRole("button", { name: "Copy key" }).click();
			await expect(panel.getByRole("button", { name: "Copied" })).toBeVisible();
			expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(key);

			await panel.getByRole("button", { name: "Done" }).click();
			await expect(panel.getByText(key.slice(0, 12), { exact: true })).toBeVisible();
			await expect(panel.getByText("Never used")).toBeVisible();
			await expect(panel.getByText(/^Expires /)).toBeVisible();
			await expect(page.getByText(key)).toHaveCount(0);
		});

		await test.step("the database holds the prefix and a hash of the secret, never the key", async () => {
			const rows = await apiKeysOf(owner.email);
			const secret = key.slice(13);
			expect(rows).toHaveLength(1);
			expect(rows[0]).toMatchObject({
				prefix: key.slice(0, 12),
				name: "GitHub Action",
				lastUsedAt: null,
			});
			expect(rows[0]?.secretHash).toBe(createHash("sha256").update(secret).digest("hex"));
			expect(JSON.stringify(rows)).not.toContain(secret);
		});

		// A caller with no cookie at all: the key is all it has.
		const caller = await signedOut();
		const bearer = { authorization: `Bearer ${key}` };
		const attempt = async (path: string, credential = key) => {
			const response = await caller.get(path, {
				headers: { authorization: `Bearer ${credential}` },
			});
			return {
				status: response.status(),
				challenge: response.headers()["www-authenticate"],
				body: await response.json(),
			};
		};

		await test.step("while the account is free the key signs it in and the plan refuses the render", async () => {
			const response = await caller.post("/api/cloud/render", {
				headers: bearer,
				data: { projectId: project.id, revision: project.revision, renderOptions: RENDER },
			});
			// 402 from the plan, not 401 from the guard: the key proved who, the plan decided what.
			expect(response.status(), await response.text()).toBe(402);
			expect(await response.json()).toMatchObject({
				code: "plan-limit",
				plan: "free",
				upgradeTo: "creator",
			});
			expect(await renderJobsOf(owner.email)).toEqual([]);
		});

		await makeCreator(owner.email);

		await test.step("a caller with no cookie starts a render with the same key", async () => {
			const response = await caller.post("/api/cloud/render", {
				headers: bearer,
				data: { projectId: project.id, revision: project.revision, renderOptions: RENDER },
			});
			expect(response.status(), await response.text()).toBe(202);
			jobId = (await response.json()).job.id;
			expect((await renderJobsOf(owner.email))[0]?.id).toBe(jobId);
		});

		await test.step("it follows the job and fetches the file with the same key", async () => {
			await expect
				.poll(async () => (await attempt(`/api/cloud/jobs/${jobId}`)).body.job?.status, {
					timeout: 180_000,
					intervals: [1_000, 2_000],
				})
				.toBe("succeeded");
			const { body } = await attempt(`/api/cloud/jobs/${jobId}`);
			// The signed address goes to storage, never the key.
			const file = await caller.get(body.download.url);
			expect(file.status()).toBe(200);
			const path = testInfo.outputPath("keyed.mp4");
			writeFileSync(path, await file.body());
			expect(probeVideo(path)).toMatchObject({ codec: "h264", width: 1920, height: 1080 });
		});

		await test.step("the key opens the render routes and nothing else", async () => {
			for (const path of ["/api/keys", "/api/projects", "/api/assets", "/api/billing/allowance"]) {
				const response = await caller.get(path, { headers: bearer });
				expect(response.status(), path).toBe(401);
			}
			const minted = await caller.post("/api/keys", {
				headers: bearer,
				data: { name: "minted by a key" },
			});
			expect(minted.status()).toBe(401);
			// Better Auth reads cookies only: a bearer token is no session there either.
			const session = await caller.get("/api/auth/get-session", { headers: bearer });
			expect(await session.json()).toBeNull();
			expect(await apiKeysOf(owner.email)).toHaveLength(1);
		});

		await test.step("the island shows that the key was used", async () => {
			// Coming back to the tab reads the list again.
			await panel.getByRole("tab", { name: "Projects" }).click();
			await panel.getByRole("tab", { name: "API keys" }).click();
			await expect(panel.getByText(/^Used (just now|\d+ min ago)$/)).toBeVisible();
			expect((await apiKeysOf(owner.email))[0]?.lastUsedAt).not.toBeNull();
		});

		await test.step("revoking in the island takes effect on the next request", async () => {
			await panel.getByRole("button", { name: "Revoke GitHub Action" }).click();
			await panel.getByRole("button", { name: "Revoke key" }).click();
			await expect(panel.getByText("Revoked GitHub Action.")).toBeVisible();
			await expect(panel.getByText("No keys yet. Create one above.")).toBeVisible();
			expect(await apiKeysOf(owner.email)).toEqual([]);
		});

		await test.step("the revoked key is refused exactly as an unknown one is", async () => {
			const revoked = await attempt(`/api/cloud/jobs/${jobId}`);
			const unknown = await attempt(`/api/cloud/jobs/${jobId}`, `tlk_00000000_${"0".repeat(64)}`);
			expect(revoked.status).toBe(401);
			expect(revoked).toEqual(unknown);

			const again = await caller.post("/api/cloud/render", {
				headers: bearer,
				data: { projectId: project.id, revision: project.revision, renderOptions: RENDER },
			});
			expect(again.status()).toBe(401);
		});

		await caller.dispose();
	});
});
