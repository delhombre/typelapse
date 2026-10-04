import type {
	CloudDownload,
	CloudExportPort,
	CloudPublicPage,
	CloudRenderJob,
} from "@/domain/ports/cloud-export.port";
import { CloudRenderAdapter } from "@/infrastructure/export/cloud-render.adapter";
import { ExportStatus } from "@/presentation/components/controls/export-status";
import { useAuthStore } from "@/presentation/stores/auth.store";
import { useExportStore } from "@/presentation/stores/export.store";
import {
	createHostedRenderJobsStore,
	useHostedRenderJobsStore,
} from "@/presentation/stores/hosted-render-jobs.store";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
	window.matchMedia = ((query: string) => ({
		matches: query.includes("reduced-motion"),
		media: query,
		onchange: null,
		addEventListener: () => {},
		removeEventListener: () => {},
		addListener: () => {},
		removeListener: () => {},
		dispatchEvent: () => false,
	})) as unknown as typeof window.matchMedia;
});

const DOWNLOAD: CloudDownload = {
	url: "https://storage.example.test/signed",
	expiresAt: "2026-10-04T10:01:00.000Z",
	mimeType: "video/mp4",
	byteSize: 2_202_009,
};

const PAGE_URL = "https://typelapse.example/v/job-1";

function succeeded(page: CloudPublicPage | null): CloudRenderJob {
	return { id: "job-1", status: "succeeded", download: DOWNLOAD, page };
}

function client(overrides: Partial<CloudExportPort> = {}): CloudExportPort {
	return {
		allowance: async () => ({ kind: "ok", allowance: { sentence: "", hostedRenders: true } }),
		submit: async () => ({ kind: "accepted", job: succeeded({ public: false, url: PAGE_URL }) }),
		job: async () => ({ kind: "found", job: succeeded({ public: false, url: PAGE_URL }) }),
		download: async () => ({ kind: "ready", download: DOWNLOAD }),
		setPublic: async (_jobId, value) => ({ kind: "ok", page: { public: value, url: PAGE_URL } }),
		...overrides,
	};
}

function store(port: CloudExportPort) {
	const copy = vi.fn(async () => true);
	const jobs = createHostedRenderJobsStore({
		client: port,
		storage: null,
		setTimer: (effect) => setTimeout(effect, 0),
		open: vi.fn(),
		copy,
	});
	jobs.getState().connectCloudSave(async () => ({
		kind: "saved",
		projectId: "project-1",
		revision: 1,
	}));
	return { jobs, copy };
}

const REQUEST = { format: "mp4", width: 1920, height: 1080, fps: 30, loop: false } as const;

describe("the Cloud receipt's public page", () => {
	it("keeps the page the server reports on the finished render", async () => {
		const { jobs } = store(client());
		await jobs.getState().submit(REQUEST);

		expect(jobs.getState().phase).toMatchObject({
			kind: "succeeded",
			page: { public: false, url: PAGE_URL },
		});
	});

	it("turns the page on, then copies its address", async () => {
		const setPublic = vi.fn(client().setPublic);
		const { jobs, copy } = store(client({ setPublic }));
		await jobs.getState().submit(REQUEST);

		await jobs.getState().copyPublicLink();

		expect(setPublic).toHaveBeenCalledWith("job-1", true);
		expect(copy).toHaveBeenCalledWith(PAGE_URL);
		expect(jobs.getState().phase).toMatchObject({
			kind: "succeeded",
			page: { public: true, url: PAGE_URL },
			notice: "Public link copied",
		});
	});

	it("copies again without asking the server when the page is already on", async () => {
		const setPublic = vi.fn(client().setPublic);
		const { jobs, copy } = store(
			client({
				setPublic,
				submit: async () => ({ kind: "accepted", job: succeeded({ public: true, url: PAGE_URL }) }),
			}),
		);
		await jobs.getState().submit(REQUEST);

		await jobs.getState().copyPublicLink();

		expect(setPublic).not.toHaveBeenCalled();
		expect(copy).toHaveBeenCalledWith(PAGE_URL);
	});

	it("makes the page private again", async () => {
		const setPublic = vi.fn(client().setPublic);
		const { jobs } = store(
			client({
				setPublic,
				submit: async () => ({ kind: "accepted", job: succeeded({ public: true, url: PAGE_URL }) }),
			}),
		);
		await jobs.getState().submit(REQUEST);

		await jobs.getState().makePrivate();

		expect(setPublic).toHaveBeenCalledWith("job-1", false);
		expect(jobs.getState().phase).toMatchObject({
			page: { public: false },
			notice: "The public page is off",
		});
	});

	it("says so in the receipt when the server refuses", async () => {
		const { jobs, copy } = store(
			client({
				setPublic: async () => ({
					kind: "refused",
					status: 402,
					message: "Hosted renders come with Creator",
					code: "plan-limit",
					upgradeTo: "creator",
				}),
			}),
		);
		await jobs.getState().submit(REQUEST);

		await jobs.getState().copyPublicLink();

		expect(copy).not.toHaveBeenCalled();
		expect(jobs.getState().phase).toMatchObject({
			page: { public: false },
			notice: "Hosted renders come with Creator",
		});
	});
});

describe("the adapter", () => {
	it("reads the page from a job and switches it with a PUT", async () => {
		const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			if (init?.method === "PUT") {
				return Response.json({ page: { public: true, url: PAGE_URL } });
			}
			return Response.json({
				job: { id: "job-1", status: "succeeded" },
				download: { ...DOWNLOAD },
				page: { public: false, url: PAGE_URL },
			});
		});
		const adapter = new CloudRenderAdapter(fetcher);

		const found = await adapter.job("job-1");
		const switched = await adapter.setPublic("job-1", true);

		expect(found).toMatchObject({ kind: "found", job: { page: { public: false, url: PAGE_URL } } });
		expect(switched).toEqual({ kind: "ok", page: { public: true, url: PAGE_URL } });
		expect(fetcher).toHaveBeenLastCalledWith("/api/cloud/jobs/job-1/public", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ public: true }),
			credentials: "include",
		});
	});

	it("reads no page when the server sends none", async () => {
		const adapter = new CloudRenderAdapter(async () =>
			Response.json({ job: { id: "job-1", status: "succeeded" }, download: DOWNLOAD }),
		);

		const found = await adapter.job("job-1");
		expect(found.kind === "found" && found.job.page).toBeFalsy();
	});
});

describe("the receipt's controls", () => {
	beforeEach(() => {
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "hosted");
		useExportStore.setState(useExportStore.getInitialState(), true);
		useAuthStore.setState({
			status: {
				kind: "authenticated",
				session: {
					account: { id: "usr_1", name: "Ada", email: "ada@example.com" },
					expiresAt: new Date(Date.now() + 60_000),
				},
			},
		});
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllEnvs();
		useHostedRenderJobsStore.setState({ phase: { kind: "idle" }, allowance: null });
	});

	it("offers a Creator owner the public link beside Download", () => {
		useHostedRenderJobsStore.setState({
			phase: {
				kind: "succeeded",
				jobId: "job-1",
				download: DOWNLOAD,
				page: { public: false, url: PAGE_URL },
			},
		});
		render(<ExportStatus />);

		expect(screen.getByRole("button", { name: "Download" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Copy public link" })).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Make private" })).toBeNull();
	});

	it("offers to copy again or make private once the page is public", async () => {
		const makePrivate = vi.fn(async () => {});
		useHostedRenderJobsStore.setState({
			phase: {
				kind: "succeeded",
				jobId: "job-1",
				download: DOWNLOAD,
				page: { public: true, url: PAGE_URL },
			},
			makePrivate,
		});
		render(<ExportStatus />);

		expect(screen.getByRole("button", { name: "Copy link" })).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Make private" }));
		await waitFor(() => expect(makePrivate).toHaveBeenCalledOnce());
	});

	it("gives an account without a page no control", () => {
		useHostedRenderJobsStore.setState({
			phase: { kind: "succeeded", jobId: "job-1", download: DOWNLOAD },
		});
		render(<ExportStatus />);

		expect(screen.getByRole("button", { name: "Download" })).toBeTruthy();
		expect(screen.queryByRole("button", { name: /public|private|Copy link/i })).toBeNull();
	});
});
