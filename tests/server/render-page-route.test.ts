import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createCloudRoute } from "../../server/routes/cloud";
import { createRenderPageRoute } from "../../server/routes/render-page";
import type { SignGetRequest } from "../../src/application/assets/object-storage.port";
import { migrateV1ToV2 } from "../../src/application/project/migrate-v1-project";
import type { HostedRenderJobService } from "../../src/application/render/hosted-render-job";
import {
	type HostedRenderPageRepositoryPort,
	PUBLIC_RENDER_SIGNED_SECONDS,
	type PublishedRenderRecord,
	createHostedRenderPageService,
} from "../../src/application/render/hosted-render-page";
import type { AuthPort } from "../../src/domain/ports/auth.port";
import { Plan } from "../../src/domain/value-objects/plan";

const NOW = new Date("2026-10-04T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const APP = "https://typelapse.example";

const DOCUMENT = migrateV1ToV2({
	title: "Retry with backoff",
	code: "const retry = true;",
	language: "typescript",
	themeName: "midnight",
	background: "mesh:solar",
	steps: [{ code: "const retry = true;", duration: 1000 }],
});

function record(overrides: Partial<PublishedRenderRecord> = {}): PublishedRenderRecord {
	return {
		jobId: "job_1",
		ownerId: "owner-1",
		title: "Retry with backoff",
		document: DOCUMENT,
		renderOptions: { format: "mp4", width: 1920, height: 1080, fps: 60, includeAudio: true },
		durationMs: 12_400,
		completedAt: new Date(NOW.getTime() - DAY_MS),
		output: {
			objectKey: "accounts/owner-1/renders/job_1/attempt-1.mp4",
			mimeType: "video/mp4",
			byteSize: 3_355_443,
		},
		posterObjectKey: "accounts/owner-1/renders/job_1/attempt-1.poster.jpg",
		...overrides,
	};
}

/** In-memory rows: the public flag is the only thing the page reads besides the output. */
function rows(initial: Array<PublishedRenderRecord & { isPublic: boolean; status?: string }>) {
	const table = new Map(initial.map((row) => [row.jobId, { status: "succeeded", ...row }]));
	const repository: HostedRenderPageRepositoryPort = {
		async findPublished(jobId) {
			const row = table.get(jobId);
			if (!row || !row.isPublic || row.status !== "succeeded") return null;
			const { isPublic: _public, status: _status, ...published } = row;
			return published;
		},
		async isPublic(ownerId, jobId) {
			const row = table.get(jobId);
			return row && row.ownerId === ownerId ? row.isPublic : null;
		},
		async setPublic(ownerId, jobId, value) {
			const row = table.get(jobId);
			if (!row || row.ownerId !== ownerId || row.status !== "succeeded") return false;
			row.isPublic = value;
			return true;
		},
	};
	return { table, repository };
}

function storage() {
	const signed: SignGetRequest[] = [];
	return {
		signed,
		port: {
			async signGet(input: SignGetRequest) {
				signed.push(input);
				return {
					method: "GET" as const,
					url: `https://bucket.example/${input.objectKey}?sig=1`,
					expiresAt: new Date(NOW.getTime() + input.expiresInSeconds * 1000),
				};
			},
		},
	};
}

function pages(
	repository: HostedRenderPageRepositoryPort,
	standing: { readonly plan: Plan; readonly downgradedAt?: Date | null } = { plan: Plan.pro() },
	signer = storage(),
) {
	return createHostedRenderPageService({
		pages: repository,
		storage: signer.port,
		subscriptions: {
			planFor: async () => standing.plan,
			downgradedAt: async () => standing.downgradedAt ?? null,
		},
		now: () => NOW,
	});
}

function publicApp(service: ReturnType<typeof pages>) {
	return new Hono().route("/v", createRenderPageRoute({ pages: service, appUrl: APP }));
}

describe("public render page (D4.1)", () => {
	it("serves one HTML document with the video, its facts and the Open Graph video tags", async () => {
		const { repository } = rows([{ ...record(), isPublic: true }]);
		const response = await publicApp(pages(repository)).request("/v/job_1");

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/html");
		const html = await response.text();
		expect(html).toContain(
			'<meta property="og:video" content="https://typelapse.example/v/job_1/video"',
		);
		expect(html).toContain(
			'<meta property="og:video:secure_url" content="https://typelapse.example/v/job_1/video"',
		);
		expect(html).toContain('<meta property="og:video:type" content="video/mp4"');
		expect(html).toContain('<meta property="og:video:width" content="1920"');
		expect(html).toContain('<meta property="og:video:height" content="1080"');
		expect(html).toContain(
			'<meta property="og:image" content="https://typelapse.example/v/job_1/poster.jpg"',
		);
		expect(html).toContain('<meta name="twitter:card" content="summary_large_image"');
		expect(html).toContain('<meta property="og:url" content="https://typelapse.example/v/job_1"');
		expect(html).toContain("<title>Retry with backoff · Typelapse</title>");
		expect(html).toContain('<video src="/v/job_1/video"');
		expect(html).toContain('poster="/v/job_1/poster.jpg"');
		// Size, codec, duration: the facts a viewer and a crawler both read.
		expect(html).toContain("1920 × 1080");
		expect(html).toContain("H.264");
		expect(html).toContain("12.4 s");
		expect(html).toContain("3.2 MB");
		expect(html).toContain('href="/"');
		expect(html).toContain("Made with Typelapse");
	});

	it("opens a code-only project in the studio through its share link", async () => {
		const { repository } = rows([{ ...record(), isPublic: true }]);
		const html = await (await publicApp(pages(repository)).request("/v/job_1")).text();

		const link = html.match(/href="(https:\/\/typelapse\.example\/app#share=[^"]+)"/)?.[1];
		expect(link).toBeDefined();
		const payload = JSON.parse(
			Buffer.from(decodeURIComponent((link ?? "").split("#share=")[1] ?? ""), "base64").toString(
				"utf8",
			),
		);
		expect(payload).toMatchObject({ title: "Retry with backoff", code: "const retry = true;" });
	});

	it("escapes the project title everywhere it is written", async () => {
		const { repository } = rows([
			{ ...record({ title: '"><script>alert(1)</script>' }), isPublic: true },
		]);
		const html = await (await publicApp(pages(repository)).request("/v/job_1")).text();

		expect(html).not.toContain("<script>alert(1)</script>");
		expect(html).toContain("&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
	});

	it("falls back to the site card when the render has no poster", async () => {
		const { repository } = rows([{ ...record({ posterObjectKey: null }), isPublic: true }]);
		const app = publicApp(pages(repository));
		const html = await (await app.request("/v/job_1")).text();

		expect(html).toContain('<meta property="og:image" content="https://typelapse.example/og.png"');
		expect(html).not.toContain("poster=");
		expect((await app.request("/v/job_1/poster.jpg")).status).toBe(404);
	});

	it("answers 404 with one sentence for a private, a missing and an expired render alike", async () => {
		const { repository } = rows([
			{ ...record(), isPublic: false },
			{
				...record({ jobId: "job_old", completedAt: new Date(NOW.getTime() - 40 * DAY_MS) }),
				isPublic: true,
			},
		]);
		const free = publicApp(pages(repository, { plan: Plan.free() }));

		const privatePage = await free.request("/v/job_1");
		const missing = await free.request("/v/job_nope");
		const expired = await free.request("/v/job_old");

		for (const response of [privatePage, missing, expired]) {
			expect(response.status).toBe(404);
			expect(response.headers.get("cache-control")).toBe("no-store");
		}
		const sentence = await privatePage.text();
		expect(sentence).toContain("This video is private or no longer exists.");
		expect(await missing.text()).toBe(sentence);
		expect(await expired.text()).toBe(sentence);
		expect(sentence).not.toContain("og:video");
	});

	it("keeps a page live through a downgraded owner's grace period", async () => {
		const { repository } = rows([{ ...record(), isPublic: true }]);
		const response = await publicApp(pages(repository, { plan: Plan.free() })).request("/v/job_1");

		expect(response.status).toBe(200);
	});

	it("redirects the stable video address to a fresh signed URL valid for an hour", async () => {
		const { repository } = rows([{ ...record(), isPublic: true }]);
		const signer = storage();
		const app = publicApp(pages(repository, { plan: Plan.pro() }, signer));

		const video = await app.request("/v/job_1/video");
		const poster = await app.request("/v/job_1/poster.jpg");

		expect(PUBLIC_RENDER_SIGNED_SECONDS).toBe(3600);
		expect(video.status).toBe(302);
		expect(video.headers.get("location")).toBe(
			"https://bucket.example/accounts/owner-1/renders/job_1/attempt-1.mp4?sig=1",
		);
		expect(video.headers.get("cache-control")).toBe("no-store");
		expect(poster.status).toBe(302);
		expect(poster.headers.get("location")).toContain("attempt-1.poster.jpg");
		expect(signer.signed.map((entry) => entry.expiresInSeconds)).toEqual([3600, 3600]);
	});

	it("stops signing the moment the owner makes the render private", async () => {
		const { table, repository } = rows([{ ...record(), isPublic: true }]);
		const app = publicApp(pages(repository));
		expect((await app.request("/v/job_1/video")).status).toBe(302);

		const row = table.get("job_1");
		if (row) row.isPublic = false;

		expect((await app.request("/v/job_1")).status).toBe(404);
		expect((await app.request("/v/job_1/video")).status).toBe(404);
	});
});

const signedInAs = (accountId: string): AuthPort => ({
	verify: async () => ({ accountId, expiresAt: new Date(NOW.getTime() + 60_000) }),
});

function jobsWith(status: "succeeded" | "running", completedAt = new Date(NOW.getTime() - DAY_MS)) {
	const service: HostedRenderJobService = {
		submit: async () => ({ outcome: "project-not-found" }),
		status: async (_owner, id) =>
			id === "job_1"
				? {
						id: "job_1",
						projectId: DOCUMENT.project.id,
						revision: 1,
						status,
						createdAt: completedAt,
						completedAt: status === "succeeded" ? completedAt : null,
					}
				: null,
	};
	return service;
}

function cloudApp(
	repository: HostedRenderPageRepositoryPort,
	standing: { readonly plan: Plan; readonly downgradedAt?: Date | null },
	status: "succeeded" | "running" = "succeeded",
	completedAt?: Date,
) {
	return new Hono().route(
		"/api/cloud",
		createCloudRoute({
			auth: signedInAs("owner-1"),
			subscriptions: {
				planFor: async () => standing.plan,
				downgradedAt: async () => standing.downgradedAt ?? null,
			},
			renderJobs: jobsWith(status, completedAt),
			renderDownloads: {
				open: async () => ({
					outcome: "ready",
					download: {
						method: "GET",
						url: "https://bucket.example/signed",
						expiresAt: new Date(NOW.getTime() + 60_000),
						mimeType: "video/mp4",
						byteSize: 42,
					},
				}),
			},
			renderPages: pages(repository, standing),
			appUrl: APP,
			now: () => NOW,
		}),
	);
}

function setPublic(value: unknown, jobId = "job_1") {
	return new Request(`http://localhost/api/cloud/jobs/${jobId}/public`, {
		method: "PUT",
		headers: { cookie: "session=valid", "content-type": "application/json" },
		body: JSON.stringify({ public: value }),
	});
}

describe("the owner's public page controls", () => {
	it("tells a Creator owner whether the page is public, with its address", async () => {
		const { repository } = rows([{ ...record(), isPublic: false }]);
		const response = await cloudApp(repository, { plan: Plan.pro() }).request(
			new Request("http://localhost/api/cloud/jobs/job_1", {
				headers: { cookie: "session=valid" },
			}),
		);

		expect(await response.json()).toMatchObject({
			page: { public: false, url: "https://typelapse.example/v/job_1" },
		});
	});

	it("turns the page on and off for its owner", async () => {
		const { table, repository } = rows([{ ...record(), isPublic: false }]);
		const app = cloudApp(repository, { plan: Plan.pro() });

		const on = await app.request(setPublic(true));
		expect(on.status).toBe(200);
		expect(await on.json()).toEqual({
			page: { public: true, url: "https://typelapse.example/v/job_1" },
		});
		expect(table.get("job_1")?.isPublic).toBe(true);

		const off = await app.request(setPublic(false));
		expect(await off.json()).toEqual({
			page: { public: false, url: "https://typelapse.example/v/job_1" },
		});
		expect(table.get("job_1")?.isPublic).toBe(false);
	});

	it("gives a free account no page control, and refuses to publish for it", async () => {
		const { table, repository } = rows([{ ...record(), isPublic: false }]);
		const app = cloudApp(repository, { plan: Plan.free() });

		const status = await app.request(
			new Request("http://localhost/api/cloud/jobs/job_1", {
				headers: { cookie: "session=valid" },
			}),
		);
		expect((await status.json()).page).toBeUndefined();

		const publish = await app.request(setPublic(true));
		expect(publish.status).toBe(402);
		expect(table.get("job_1")?.isPublic).toBe(false);
	});

	it("still lets a downgraded owner take a public page down", async () => {
		const { table, repository } = rows([{ ...record(), isPublic: true }]);
		const app = cloudApp(repository, { plan: Plan.free() });

		const status = await app.request(
			new Request("http://localhost/api/cloud/jobs/job_1", {
				headers: { cookie: "session=valid" },
			}),
		);
		expect((await status.json()).page).toEqual({
			public: true,
			url: "https://typelapse.example/v/job_1",
		});
		const off = await app.request(setPublic(false));
		expect(off.status).toBe(200);
		expect(table.get("job_1")?.isPublic).toBe(false);
	});

	it("refuses a render that is not finished, a foreign one and a malformed body", async () => {
		const { repository } = rows([{ ...record(), isPublic: false }]);

		const running = await cloudApp(repository, { plan: Plan.pro() }, "running").request(
			setPublic(true),
		);
		const missing = await cloudApp(repository, { plan: Plan.pro() }).request(
			setPublic(true, "job_x"),
		);
		const malformed = await cloudApp(repository, { plan: Plan.pro() }).request(setPublic("yes"));

		expect(running.status).toBe(409);
		expect(missing.status).toBe(404);
		expect(malformed.status).toBe(400);
	});
});
