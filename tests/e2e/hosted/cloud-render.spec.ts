import { writeFileSync } from "node:fs";
import {
	allowanceSentence,
	outputExpiredRefusal,
} from "../../../src/application/billing/plan-allowance";
import { Plan } from "../../../src/domain/value-objects/plan";
import {
	HOSTED,
	ageRender,
	downgradeToFree,
	makeCreator,
	newAccount,
	renderJobsOf,
	signInByApi,
	signUpByApi,
	signUpInIsland,
	signedOut,
} from "../support/hosted";
import { probeVideo } from "../support/media";
import { expect, openStudio, test } from "../support/studio";

/**
 * One Creator render feeds every journey in this file: the worker's Remotion
 * render is the slow part, and the public page, tenancy and the downgrade
 * grace are all questions about that same job. Serial, so a later journey is
 * skipped rather than failing for a reason the first one already reported.
 */
test.describe.configure({ mode: "serial" });

const owner = newAccount("creator");
let jobId = "";

const DAY_MS = 24 * 60 * 60 * 1000;
const GRACE_DAYS = Math.round(Plan.free().capabilities.hostedOutputGraceMs / DAY_MS);
const PROGRESS =
	/Saving the project|Sending the render|Waiting for a render slot|Rendering on Typelapse Cloud|Reconnecting to Typelapse Cloud/;

test.describe("Hosted Creator: a Cloud render from the button to the public page", () => {
	test("a Creator renders on Cloud, follows the job through a reload, downloads the file and publishes its page", async ({
		page,
		browser,
		request,
	}, testInfo) => {
		const status = page.getByTestId("cloud-render-status");

		await test.step("sign up, then become Creator", async () => {
			await openStudio(page);
			// One captured scene of the default snippet: 1 s, held, no transition.
			await page.getByRole("button", { name: "Add scene" }).click();
			await signUpInIsland(page, owner);
			await makeCreator(owner.email);
			await page.reload();
			await expect(page.getByRole("button", { name: `Account for ${owner.name}` })).toBeVisible();
		});

		await test.step("choose Cloud: the Creator allowance is the note", async () => {
			await page.getByRole("button", { name: /^Export · / }).click();
			await page.getByRole("group", { name: "FPS" }).getByRole("button", { name: "30" }).click();
			await page
				.getByRole("group", { name: "Where" })
				.getByRole("button", { name: "Cloud" })
				.click();
			await expect(status).toHaveText(
				allowanceSentence(Plan.pro(), {
					cloudProjects: 0,
					mediaBytes: 0,
					hostedRenderMsThisMonth: 0,
					activeRenders: 0,
				}),
			);
		});

		await test.step("submit: the status follows the job", async () => {
			await page.getByRole("button", { name: /^Render · / }).click();
			await expect(status).toContainText(PROGRESS);
			await expect
				.poll(async () => (await renderJobsOf(owner.email))[0]?.status ?? "none")
				.toMatch(/queued|running/);
			jobId = (await renderJobsOf(owner.email))[0]?.id ?? "";
			expect(jobId).not.toBe("");
		});

		await test.step("reload mid-job: the same job is picked up, not a second one", async () => {
			const before = (await renderJobsOf(owner.email))[0]?.status;
			expect(before).toMatch(/queued|running/);
			await page.reload();
			await expect(status).toContainText(
				new RegExp(`${PROGRESS.source}|^Rendered on Typelapse Cloud`),
			);
			await expect(status).toContainText(/^Rendered on Typelapse Cloud · \d/, {
				timeout: 180_000,
			});
			const jobs = await renderJobsOf(owner.email);
			expect(jobs.map((job) => job.id)).toEqual([jobId]);
			expect(jobs[0]?.status).toBe("succeeded");
		});

		await test.step("download: the stored file is the render asked for", async () => {
			// The receipt opens a fresh signed link in a new tab; the file is read
			// from that same link.
			const signed = page
				.context()
				.waitForEvent("request", (sent) => sent.url().startsWith(HOSTED.storageUrl));
			await status.getByRole("button", { name: "Download" }).click();
			const url = (await signed).url();
			const response = await request.get(url);
			expect(response.status()).toBe(200);
			const path = testInfo.outputPath("cloud.mp4");
			writeFileSync(path, await response.body());

			const probe = probeVideo(path);
			expect(probe).toMatchObject({ codec: "h264", width: 1920, height: 1080, fps: 30 });
			expect(probe.durationSeconds).toBeGreaterThan(1 - 1 / 30 - 0.001);
			expect(probe.durationSeconds).toBeLessThan(1 + 1 / 30 + 0.001);
			expect(probe.sizeBytes).toBeGreaterThan(20_000);
			for (const tab of page.context().pages()) if (tab !== page) await tab.close();
		});

		const pageUrl = `${HOSTED.appUrl}/v/${jobId}`;

		await test.step("Copy public link: the page is up, and the link is on the clipboard", async () => {
			await status.getByRole("button", { name: "Copy public link" }).click();
			await expect(status).toContainText("Public link copied");
			expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(pageUrl);
			await expect(status.getByRole("button", { name: "Make private" })).toBeVisible();
		});

		await test.step("signed out, the page plays the video and carries its preview tags", async () => {
			const visitor = await browser.newContext({ ignoreHTTPSErrors: true });
			const view = await visitor.newPage();
			const response = await view.goto(pageUrl);
			expect(response?.status()).toBe(200);

			const meta = (key: string) =>
				view.locator(`meta[property="${key}"], meta[name="${key}"]`).getAttribute("content");
			expect(await meta("og:type")).toBe("video.other");
			expect(await meta("og:url")).toBe(pageUrl);
			expect(await meta("og:video")).toBe(`${pageUrl}/video`);
			expect(await meta("og:video:type")).toBe("video/mp4");
			expect(await meta("og:video:width")).toBe("1920");
			expect(await meta("og:video:height")).toBe("1080");
			expect(await meta("og:title")).toBeTruthy();
			expect(await meta("og:image")).toBeTruthy();
			expect(await meta("twitter:card")).toBe("summary_large_image");

			const video = view.locator("video");
			await video.evaluate(async (element: HTMLVideoElement) => {
				element.muted = true;
				await element.play();
			});
			await expect
				.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime))
				.toBeGreaterThan(0.2);
			expect(await video.evaluate((element: HTMLVideoElement) => element.videoWidth)).toBe(1920);
			await visitor.close();
		});

		await test.step("Make private: the page is gone for everyone", async () => {
			await status.getByRole("button", { name: "Make private" }).click();
			await expect(status).toContainText("The public page is off");
			const visitor = await signedOut();
			expect((await visitor.get(`/v/${jobId}`)).status()).toBe(404);
			expect((await visitor.get(`/v/${jobId}/video`, { maxRedirects: 0 })).status()).toBe(404);
			await visitor.dispose();
		});
	});

	test("another account, even a Creator, gets 404 on the job, its file and its page", async () => {
		const stranger = newAccount("stranger");
		const api = await signUpByApi(stranger);
		// Creator, so a 402 for the plan cannot hide a missing ownership check.
		await makeCreator(stranger.email);

		expect((await api.get(`/api/cloud/jobs/${jobId}`)).status()).toBe(404);
		expect((await api.get(`/api/cloud/jobs/${jobId}/download`)).status()).toBe(404);
		const publish = await api.put(`/api/cloud/jobs/${jobId}/public`, { data: { public: true } });
		expect(publish.status()).toBe(404);
		expect((await api.get(`/v/${jobId}`)).status()).toBe(404);
		expect((await renderJobsOf(owner.email))[0]?.isPublic).toBe(false);
		await api.dispose();
	});

	test(`a downgrade keeps the render and its page for ${GRACE_DAYS} days, then refuses both in the plan's words`, async () => {
		const api = await signInByApi(owner);
		const visitor = await signedOut();
		const publish = await api.put(`/api/cloud/jobs/${jobId}/public`, { data: { public: true } });
		expect(publish.status()).toBe(200);

		await test.step("just downgraded: still downloadable, still public", async () => {
			await downgradeToFree(owner.email, new Date());
			expect((await api.get(`/api/cloud/jobs/${jobId}/download`)).status()).toBe(200);
			const job = await (await api.get(`/api/cloud/jobs/${jobId}`)).json();
			expect(job.download?.url).toBeTruthy();
			expect((await visitor.get(`/v/${jobId}`)).status()).toBe(200);
		});

		await test.step("past the grace period: 402 with the sentence, and no page", async () => {
			const past = GRACE_DAYS + 1;
			await ageRender(jobId, past);
			await downgradeToFree(owner.email, new Date(Date.now() - past * DAY_MS));

			const download = await api.get(`/api/cloud/jobs/${jobId}/download`);
			expect(download.status()).toBe(402);
			expect(await download.json()).toEqual(outputExpiredRefusal(Plan.free()));
			// The owner still sees the job; only the file is withheld.
			const status = await api.get(`/api/cloud/jobs/${jobId}`);
			expect(status.status()).toBe(200);
			const body = await status.json();
			expect(body.job.status).toBe("succeeded");
			expect(body.download).toBeUndefined();
			expect((await visitor.get(`/v/${jobId}`)).status()).toBe(404);
		});

		await api.dispose();
		await visitor.dispose();
	});
});
