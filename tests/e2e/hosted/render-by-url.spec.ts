import { writeFileSync } from "node:fs";
import { GREET_DIFF } from "../support/fixtures";
import {
	HOSTED,
	cloudProjectsOf,
	createApiKeyByApi,
	makeCreator,
	newAccount,
	renderJobsOf,
	setRenderDuration,
	signUpByApi,
	signedOut,
} from "../support/hosted";
import { probeVideo } from "../support/media";
import { expect, openStudio, sceneCount, test } from "../support/studio";

/**
 * Render by URL is the call a script makes with a key and a source: a pull
 * request, a commit, a release or a diff in, a job (or the studio's link) out.
 * The unit tests hold the rules; this holds that the real route, the real
 * database, the real worker and the real studio agree. The sources are the
 * repository's own diff (no network) and one pull request address that is only
 * linked to, never read; the one journey that reads GitHub skips when GitHub
 * cannot be reached or has spent its anonymous quota.
 *
 * Serial: the Creator's render feeds the page, the studio link and the
 * allowance journeys, and a later one is skipped rather than failing for a
 * reason the first already reported.
 */
test.describe.configure({ mode: "serial" });

/** Smaller than the default 1080p, so the worker is quick, and proof that options are honoured. */
const SMALL = { width: 1280, height: 720, fps: 24 };
/** Two steps of 1,200 ms and a 650 ms morph between them. */
const PLAYS_FOR_MS = 3050;
const PR = "https://github.com/acme/widgets/pull/42";

const creator = newAccount("by-url");
const free = newAccount("by-url-free");
let creatorKey = "";
let jobId = "";
let studioUrl = "";

/** A script: no cookie, only the key. */
async function script(key: string) {
	const caller = await signedOut();
	const headers = { authorization: `Bearer ${key}` };
	return {
		renderSource: (data: unknown) => caller.post("/api/cloud/render/source", { headers, data }),
		get: (path: string) => caller.get(path, { headers }),
		put: (path: string, data: unknown) => caller.put(path, { headers, data }),
		visitor: caller,
		dispose: () => caller.dispose(),
	};
}

const intentOf = (url: string): unknown =>
	JSON.parse(Buffer.from(new URL(url).hash.slice("#import=".length), "base64url").toString("utf8"));

test.describe("Hosted render by URL: a key and a source start a render on a Creator, and open the studio for everyone else", () => {
	test("a Creator's key and a diff queue one render, which finishes, and whose page the key publishes", async ({
		page,
	}, testInfo) => {
		const session = await signUpByApi(creator);
		await makeCreator(creator.email);
		creatorKey = await createApiKeyByApi(session, "GitHub Action");
		const api = await script(creatorKey);

		await test.step("the request answers with the job and the studio link, and saves the project", async () => {
			const response = await api.renderSource({ source: GREET_DIFF, renderOptions: SMALL });
			expect(response.status(), await response.text()).toBe(202);
			const body = await response.json();
			jobId = body.job.id;
			studioUrl = body.studioUrl;

			expect(body.job).toMatchObject({ status: "queued", revision: 1 });
			expect(studioUrl.startsWith(`${HOSTED.appUrl}/app#import=`)).toBe(true);
			expect(intentOf(studioUrl)).toEqual({ source: GREET_DIFF.trim() });
			expect(await cloudProjectsOf(creator.email)).toEqual([
				{ id: body.job.projectId, title: "greet.ts", revision: 1, scenes: 2 },
			]);
			expect((await renderJobsOf(creator.email)).map((row) => row.id)).toEqual([jobId]);
		});

		await test.step("the same request again is the same job, and not a second project", async () => {
			const again = await api.renderSource({ source: GREET_DIFF, renderOptions: SMALL });
			expect(again.status()).toBe(202);
			expect((await again.json()).job.id).toBe(jobId);
			expect(await cloudProjectsOf(creator.email)).toHaveLength(1);
			expect(await renderJobsOf(creator.email)).toHaveLength(1);
		});

		await test.step("the signed-in session starts the same render as the key does", async () => {
			const bySession = await session.post("/api/cloud/render/source", {
				data: { source: GREET_DIFF, renderOptions: SMALL },
			});
			expect(bySession.status(), await bySession.text()).toBe(202);
			expect((await bySession.json()).job.id).toBe(jobId);
		});

		await test.step("the job is followed with the key until it is done, and carries its page", async () => {
			await expect
				.poll(async () => (await (await api.get(`/api/cloud/jobs/${jobId}`)).json()).job?.status, {
					timeout: 180_000,
					intervals: [1_000, 2_000],
				})
				.toBe("succeeded");
			const done = await (await api.get(`/api/cloud/jobs/${jobId}`)).json();
			// Every render starts private: the page exists once its owner turns it on.
			expect(done.page).toEqual({ public: false, url: `${HOSTED.appUrl}/v/${jobId}` });

			const file = await api.visitor.get(done.download.url);
			expect(file.status()).toBe(200);
			const path = testInfo.outputPath("by-url.mp4");
			writeFileSync(path, await file.body());
			const probe = probeVideo(path);
			expect(probe).toMatchObject({ codec: "h264", width: 1280, height: 720, fps: 24 });
			expect(Math.abs(probe.durationSeconds - PLAYS_FOR_MS / 1000)).toBeLessThan(0.1);
		});

		await test.step("the page is private until the key publishes it, then reachable by anyone", async () => {
			const pageUrl = `${HOSTED.appUrl}/v/${jobId}`;
			expect((await api.visitor.get(pageUrl)).status()).toBe(404);

			const published = await api.put(`/api/cloud/jobs/${jobId}/public`, { public: true });
			expect(published.status(), await published.text()).toBe(200);
			expect(await published.json()).toEqual({ page: { public: true, url: pageUrl } });

			const shown = await api.visitor.get(pageUrl);
			expect(shown.status()).toBe(200);
			const html = await shown.text();
			expect(html).toContain('property="og:video"');
			expect(html).toContain("greet.ts");
		});

		await test.step("the studio link opens the same import in the studio", async () => {
			await openStudio(page, new URL(studioUrl).hash);
			await expect(sceneCount(page, 2)).toBeVisible();
			await expect(page.getByRole("textbox", { name: "Project name" })).toHaveValue("greet.ts");
		});

		await api.dispose();
		await session.dispose();
	});

	test("a free account's key gets the studio link and the reason, and nothing is saved or queued", async ({
		page,
	}) => {
		const session = await signUpByApi(free);
		const key = await createApiKeyByApi(session, "free key");
		await session.dispose();
		const api = await script(key);

		await test.step("a pull request address is only linked to, so nothing is fetched", async () => {
			const response = await api.renderSource({ source: PR });

			expect(response.status(), await response.text()).toBe(200);
			const body = await response.json();
			expect(body).toEqual({
				studioUrl: expect.stringMatching(new RegExp(`^${HOSTED.appUrl}/app#import=`)),
				reason: {
					error: "Hosted renders come with Creator",
					code: "plan-limit",
					ceiling: "hostedRenderTime",
					limit: 0,
					used: 0,
					plan: "free",
					upgradeTo: "creator",
				},
			});
			expect(intentOf(body.studioUrl)).toEqual({ source: PR });
		});

		await test.step("a diff's link opens the studio on it", async () => {
			const response = await api.renderSource({ source: GREET_DIFF });

			expect(response.status()).toBe(200);
			const { studioUrl: link } = await response.json();
			await openStudio(page, new URL(link).hash);
			await expect(sceneCount(page, 2)).toBeVisible();
		});

		await test.step("no project, no job, whatever it asked for", async () => {
			expect(await cloudProjectsOf(free.email)).toEqual([]);
			expect(await renderJobsOf(free.email)).toEqual([]);
		});

		await api.dispose();
	});

	test("an account over its minutes is refused with the ceiling it hit, and nothing is created", async () => {
		const api = await script(creatorKey);
		const before = {
			projects: await cloudProjectsOf(creator.email),
			jobs: await renderJobsOf(creator.email),
		};
		// One second short of the month's 60 minutes: the next render crosses them.
		await setRenderDuration(jobId, 3_600_000 - 1_000);

		const refused = await api.renderSource({
			source: GREET_DIFF.replace("Hello,", "Good day,"),
			renderOptions: SMALL,
		});

		expect(refused.status(), await refused.text()).toBe(402);
		expect(await refused.json()).toEqual({
			error: "Creator includes 60 minutes of hosted output a month and this render goes past it",
			code: "plan-limit",
			ceiling: "hostedRenderTime",
			limit: 3_600_000,
			used: 3_599_000,
			plan: "creator",
			upgradeTo: null,
		});
		expect(await cloudProjectsOf(creator.email)).toEqual(before.projects);
		expect(await renderJobsOf(creator.email)).toEqual(before.jobs);

		// The render it already asked for is still its own, not a second charge.
		const again = await api.renderSource({ source: GREET_DIFF, renderOptions: SMALL });
		expect(again.status(), await again.text()).toBe(202);
		expect((await again.json()).job.id).toBe(jobId);
		await api.dispose();
	});

	test("a source that is not a source is refused before anything else", async () => {
		const api = await script(creatorKey);

		const notASource = await api.renderSource({ source: "const answer = 42;" });
		const wrongHost = await api.renderSource({
			source: "https://gitlab.com/a/b/-/merge_requests/1",
		});
		const badSize = await api.renderSource({ source: GREET_DIFF, renderOptions: { width: 1280 } });

		expect([notASource.status(), wrongHost.status(), badSize.status()]).toEqual([400, 400, 400]);
		expect(await notASource.json()).toEqual({
			error: "The source is neither a GitHub link nor a unified diff",
		});
		expect((await badSize.json()).error).toBe("Send width and height together");
		await api.dispose();
	});

	test(
		"a repository GitHub does not show is refused in plain words, private or not",
		{ tag: "@network" },
		async () => {
			const api = await script(creatorKey);

			const response = await api.renderSource({
				source: "https://github.com/typelapse-e2e/no-such-repository/pull/1",
			});

			// GitHub answers 404 for a private repository and for one that does not
			// exist, and Typelapse sends no credential, so these are one answer. The
			// journey says nothing of the product when GitHub itself is out of reach.
			test.skip(
				[502, 503].includes(response.status()),
				"GitHub cannot be reached, or its anonymous quota is spent",
			);
			expect(response.status(), await response.text()).toBe(422);
			expect(await response.json()).toEqual({
				error:
					"That pull request was not found, or its repository is private; Typelapse reads public repositories only, so send a diff as the source instead",
				code: "source-not-found",
			});
			await api.dispose();
		},
	);
});
