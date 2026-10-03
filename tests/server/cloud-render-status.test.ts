import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createCloudRoute } from "../../server/routes/cloud";
import type { HostedRenderJobService } from "../../src/application/render/hosted-render-job";
import type { HostedRenderDownloadService } from "../../src/application/render/hosted-render-download";
import type { AuthPort } from "../../src/domain/ports/auth.port";
import { Plan } from "../../src/domain/value-objects/plan";

const signedInAs = (accountId: string): AuthPort => ({
	verify: async () => ({ accountId, expiresAt: new Date(Date.now() + 60_000) }),
});

function app(
	accountId: string,
	renderJobs?: HostedRenderJobService,
	renderDownloads?: HostedRenderDownloadService,
	standing: { readonly plan: Plan; readonly downgradedAt?: Date | null } = { plan: Plan.pro() },
) {
	return new Hono().route(
		"/api/cloud",
		createCloudRoute({
			auth: signedInAs(accountId),
			subscriptions: {
				planFor: async () => standing.plan,
				downgradedAt: async () => standing.downgradedAt ?? null,
			},
			renderJobs,
			renderDownloads,
			now: () => NOW,
		}),
	);
}

const NOW = new Date("2026-10-03T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function succeededJobs(completedAt: Date): HostedRenderJobService {
	return {
		submit: async () => ({ outcome: "project-not-found" }),
		status: async () => ({
			id: "job-1",
			projectId: "project-1",
			revision: 1,
			status: "succeeded",
			createdAt: completedAt,
			completedAt,
		}),
	};
}

const readyDownload: HostedRenderDownloadService = {
	open: async () => ({
		outcome: "ready",
		download: {
			method: "GET",
			url: "https://private.example.test/signed",
			expiresAt: new Date("2026-10-03T12:01:00.000Z"),
			mimeType: "video/mp4",
			byteSize: 42,
		},
	}),
};

function request(jobId: string, headers: Record<string, string> = {}) {
	return new Request(`http://localhost/api/cloud/jobs/${jobId}`, {
		headers: { cookie: "session=valid", ...headers },
	});
}

describe("past outputs after a downgrade (D4)", () => {
	it("still serves a free account an output younger than 30 days", async () => {
		const completedAt = new Date(NOW.getTime() - 10 * DAY_MS);
		const response = await app("owner-1", succeededJobs(completedAt), readyDownload, {
			plan: Plan.free(),
		}).request(request("job-1/download"));

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ download: { mimeType: "video/mp4" } });
	});

	it("counts the 30 days from the downgrade when the output is older", async () => {
		const completedAt = new Date(NOW.getTime() - 90 * DAY_MS);
		const response = await app("owner-1", succeededJobs(completedAt), readyDownload, {
			plan: Plan.free(),
			downgradedAt: new Date(NOW.getTime() - 5 * DAY_MS),
		}).request(request("job-1/download"));

		expect(response.status).toBe(200);
	});

	it("refuses past the grace period and names the plan that keeps outputs", async () => {
		const completedAt = new Date(NOW.getTime() - 40 * DAY_MS);
		const jobs = succeededJobs(completedAt);
		const standing = { plan: Plan.free() };

		const download = await app("owner-1", jobs, readyDownload, standing).request(
			request("job-1/download"),
		);
		const status = await app("owner-1", jobs, readyDownload, standing).request(request("job-1"));

		expect(download.status).toBe(402);
		expect(await download.json()).toEqual({
			error: "Free keeps past hosted renders for 30 days; Creator keeps them",
			code: "output-expired",
			plan: "free",
			upgradeTo: "creator",
		});
		expect(status.status).toBe(200);
		const body = await status.json();
		expect(body.job).toMatchObject({ status: "succeeded" });
		expect(body.download).toBeUndefined();
	});
});

describe("cloud render status ownership", () => {
	it("derives the owner only from the verified session", async () => {
		let seenOwner = "";
		const renderJobs: HostedRenderJobService = {
			submit: async () => ({ outcome: "project-not-found" }),
			status: async (ownerId) => {
				seenOwner = ownerId;
				return null;
			},
		};

		const response = await app("owner-2", renderJobs).request(
			request("job-owned-by-one", { "x-owner-id": "owner-1" }),
		);

		expect(seenOwner).toBe("owner-2");
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: "Render job not found" });
	});

	it("uses the same indistinguishable 404 for foreign and missing ids", async () => {
		const renderJobs: HostedRenderJobService = {
			submit: async () => ({ outcome: "project-not-found" }),
			status: async () => null,
		};

		const foreign = await app("owner-2", renderJobs).request(request("foreign-job"));
		const missing = await app("owner-2", renderJobs).request(request("missing-job"));

		expect(foreign.status).toBe(404);
		expect(await foreign.json()).toEqual(await missing.json());
	});

	it("fails closed when the hosted render status service is absent", async () => {
		const response = await app("owner-1").request(request("job-1"));

		expect(response.status).toBe(503);
	});

	it("returns a short-lived private download in succeeded status and can refresh it", async () => {
		const renderJobs: HostedRenderJobService = {
			submit: async () => ({ outcome: "project-not-found" }),
			status: async () => ({
				id: "job-1",
				projectId: "project-1",
				revision: 1,
				status: "succeeded",
				createdAt: new Date("2026-08-31T08:00:00.000Z"),
				completedAt: new Date("2026-08-31T08:00:30.000Z"),
			}),
		};
		const renderDownloads: HostedRenderDownloadService = {
			open: async () => ({
				outcome: "ready",
				download: {
					method: "GET",
					url: "https://private.example.test/signed",
					expiresAt: new Date("2026-08-31T08:01:00.000Z"),
					mimeType: "video/mp4",
					byteSize: 42,
				},
			}),
		};

		const status = await app("owner-1", renderJobs, renderDownloads).request(request("job-1"));
		const download = await app("owner-1", renderJobs, renderDownloads).request(
			request("job-1/download"),
		);

		expect(status.status).toBe(200);
		expect(await status.json()).toMatchObject({
			job: { status: "succeeded" },
			download: { method: "GET", url: "https://private.example.test/signed" },
		});
		expect(download.status).toBe(200);
		expect(await download.json()).toEqual({
			download: {
				method: "GET",
				url: "https://private.example.test/signed",
				expiresAt: "2026-08-31T08:01:00.000Z",
				mimeType: "video/mp4",
				byteSize: 42,
			},
		});
		expect(download.headers.get("cache-control")).toBe("no-store");
	});

	it("returns 409 while an owned job has no downloadable output", async () => {
		const renderJobs: HostedRenderJobService = {
			submit: async () => ({ outcome: "project-not-found" }),
			status: async () => ({
				id: "job-1",
				projectId: "project-1",
				revision: 1,
				status: "running",
				createdAt: new Date(),
				completedAt: null,
			}),
		};
		const renderDownloads: HostedRenderDownloadService = {
			open: async () => ({ outcome: "not-ready" }),
		};

		const response = await app("owner-1", renderJobs, renderDownloads).request(
			request("job-1/download"),
		);

		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({ error: "Render output is not ready" });
	});
});
