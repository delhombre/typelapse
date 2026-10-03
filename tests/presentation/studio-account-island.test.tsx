// @vitest-environment jsdom
import type { PrivateAssetApiPort } from "@/application/assets/private-media-upload.port";
import type { ClientAuthPort, ClientSession } from "@/application/auth/client-auth.port";
import type {
	HostedProjectApiPort,
	HostedProjectRecord,
} from "@/application/project/hosted-project-api.port";
import { createHostedProjectSyncCoordinator } from "@/application/project/hosted-project-sync";
import type { ProjectDocumentV2 } from "@/application/project/project-document";
import type { BillingPort } from "@/domain/ports/billing.port";
import { Plan } from "@/domain/value-objects/plan";
import { createSceneAssetSourceRegistry } from "@/infrastructure/assets/scene-asset-source.registry";
import type { BrowserHostedProjectSyncRuntime } from "@/infrastructure/project/browser-hosted-project-sync.runtime";
import { SceneShell } from "@/presentation/components/layout/scene-shell";
import { StudioAccountIsland } from "@/presentation/components/layout/studio-account-island";
import { StudioTooltipProvider } from "@/presentation/components/ui/studio-tooltip";
import type { StudioCloudRuntime } from "@/presentation/hooks/use-studio-cloud-project";
import { createAuthStore, useAuthStore } from "@/presentation/stores/auth.store";
import { createPlanStore } from "@/presentation/stores/plan.store";
import { createProjectStore } from "@/presentation/stores/project.store";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const NOW = new Date("2026-09-01T12:00:00.000Z");
const SESSION: ClientSession = {
	account: { id: "usr_1", name: "Ada Lovelace", email: "ada@example.com" },
	expiresAt: new Date("2026-09-02T12:00:00.000Z"),
};

function authPort(session: ClientSession | null): ClientAuthPort {
	return {
		signUpEmail: async () => undefined,
		signInEmail: async () => undefined,
		signOut: async () => undefined,
		getSession: async () => session,
	};
}

function planStore() {
	const billing: BillingPort = {
		getCatalog: async () => {
			throw new Error("Billing is not configured");
		},
		getCurrentPlan: async () => Plan.free(),
		startCheckout: async () => {
			throw new Error("Unexpected checkout");
		},
		openPortal: async () => {
			throw new Error("Unexpected portal");
		},
	};
	return createPlanStore({ deploymentMode: "hosted", billing });
}

function localDocument(title = "Launch"): ProjectDocumentV2 {
	return {
		schemaVersion: 2,
		project: {
			id: "studio-local-project",
			title,
			canvas: { width: 1920, height: 1080, background: "mesh:solar" },
			settings: { progressStyle: "none", transitionMs: 650, typewriter: false, focusZoom: false },
			assets: [],
			audioCues: [],
			scenes: [
				{
					id: "scene-1",
					durationMs: 1_000,
					blocks: [
						{
							id: "text-1",
							kind: "text",
							text: "Hello",
							typography: {
								fontFamily: "Inter",
								fontSize: 64,
								fontWeight: 700,
								color: "#fff",
								align: "center",
							},
							opacity: 1,
							placement: { x: 0, y: 0, width: 1, height: 1 },
						},
					],
				},
			],
		},
	};
}

/** PostgreSQL jsonb hands keys back in its own order. */
function jsonbEcho<T>(value: T): T {
	const reorder = (entry: unknown): unknown => {
		if (Array.isArray(entry)) return entry.map(reorder);
		if (entry === null || typeof entry !== "object") return entry;
		const reversed: Record<string, unknown> = {};
		for (const key of Object.keys(entry).reverse()) {
			reversed[key] = reorder((entry as Record<string, unknown>)[key]);
		}
		return reversed;
	};
	return reorder(value) as T;
}

function record(revision: number, document: ProjectDocumentV2): HostedProjectRecord {
	return { id: document.project.id, revision, document, createdAt: NOW, updatedAt: NOW };
}

function cloudRuntime() {
	const api: HostedProjectApiPort = {
		list: vi.fn(async () => []),
		load: vi.fn(async () => null),
		create: vi.fn(async (document: ProjectDocumentV2) =>
			record(1, jsonbEcho({ ...document, project: { ...document.project, id: "project_cloud" } })),
		),
		update: vi.fn(async (input) => ({
			outcome: "updated" as const,
			project: record(input.expectedRevision + 1, jsonbEcho(input.document)),
		})),
		delete: vi.fn(async () => false),
	};
	const assets: PrivateAssetApiPort = {
		reserve: vi.fn(),
		finalize: vi.fn(),
		resolveContent: vi.fn(),
	};
	const saved = new Map<string, string>();
	const runtime: StudioCloudRuntime = {
		createHostedSync: () => {
			const coordinator = createHostedProjectSyncCoordinator(
				{
					api,
					assets,
					uploader: { execute: vi.fn() },
					registry: createSceneAssetSourceRegistry(),
				},
				{ now: () => NOW },
			);
			return {
				...coordinator,
				connect: (input) => coordinator.connect(input),
				scheduleSave: (document) => coordinator.scheduleSave(document),
				flush: () => coordinator.flush(),
				getState: () => coordinator.getState(),
				subscribe: (listener) => coordinator.subscribe(listener),
				stop: () => coordinator.stop(),
				importFile: vi.fn(),
			} as BrowserHostedProjectSyncRuntime;
		},
		references: {
			load: (accountId) => saved.get(accountId) ?? null,
			save: (accountId, projectId) => saved.set(accountId, projectId),
		},
		localLibrary: { loadAsset: vi.fn(async () => null) },
	};
	return { api, runtime, saved };
}

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("StudioAccountIsland", () => {
	it("renders nothing in the local profile", () => {
		const { container } = render(
			<StudioAccountIsland
				authStore={createAuthStore({ kind: "local-offline" })}
				planStore={planStore()}
				compositionStore={createProjectStore(localDocument())}
				cloudRuntime={null}
			/>,
		);

		expect(container.innerHTML).toBe("");
	});

	it("renders nothing when the hosted build turned accounts off", () => {
		const { container } = render(
			<StudioAccountIsland
				authStore={createAuthStore({ kind: "hosted-unconfigured" })}
				planStore={planStore()}
				compositionStore={createProjectStore(localDocument())}
				cloudRuntime={null}
			/>,
		);

		expect(container.innerHTML).toBe("");
	});

	it("offers sign in when accounts are enabled", async () => {
		render(
			<StudioAccountIsland
				authStore={createAuthStore({ kind: "hosted", port: authPort(null) }, { now: () => NOW })}
				planStore={planStore()}
				compositionStore={createProjectStore(localDocument())}
				cloudRuntime={null}
			/>,
		);

		await waitFor(() => expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy());
	});

	it("saves the V2 composition only on request and stays in sync after a reordered echo", async () => {
		const { api, runtime, saved } = cloudRuntime();
		const composition = createProjectStore(localDocument());
		render(
			<StudioAccountIsland
				authStore={createAuthStore({ kind: "hosted", port: authPort(SESSION) }, { now: () => NOW })}
				planStore={planStore()}
				compositionStore={composition}
				cloudRuntime={runtime}
			/>,
		);

		const trigger = await screen.findByRole("button", { name: "Account for Ada Lovelace" });
		expect(api.create).not.toHaveBeenCalled();
		fireEvent.click(trigger);
		fireEvent.click(screen.getByRole("button", { name: "Save this project to cloud" }));

		await waitFor(() => expect(screen.getByText("Cloud copy saved")).toBeTruthy());
		expect(api.create).toHaveBeenCalledOnce();
		expect(vi.mocked(api.create).mock.calls[0]?.[0]).toMatchObject({ schemaVersion: 2 });
		expect(api.update).not.toHaveBeenCalled();
		expect(saved.get("usr_1")).toBe("project_cloud");

		composition.getState().loadDocument(localDocument("Launch, edited"));
		await waitFor(() => expect(screen.getByText("Cloud copy out of date")).toBeTruthy());
		fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

		await waitFor(() => expect(screen.getByText("Cloud copy saved")).toBeTruthy());
		expect(api.update).toHaveBeenCalledOnce();
		expect(vi.mocked(api.update).mock.calls[0]?.[0]).toMatchObject({
			id: "project_cloud",
			expectedRevision: 1,
			document: { project: { id: "project_cloud", title: "Launch, edited" } },
		});
	});

	it("opens no cloud connection for an account that never saved this project", async () => {
		const { api, runtime } = cloudRuntime();
		const createHostedSync = vi.fn(runtime.createHostedSync);
		render(
			<StudioAccountIsland
				authStore={createAuthStore({ kind: "hosted", port: authPort(SESSION) }, { now: () => NOW })}
				planStore={planStore()}
				compositionStore={createProjectStore(localDocument())}
				cloudRuntime={{ ...runtime, createHostedSync }}
			/>,
		);

		fireEvent.click(await screen.findByRole("button", { name: "Account for Ada Lovelace" }));

		expect(screen.getByText("On this device")).toBeTruthy();
		expect(createHostedSync).not.toHaveBeenCalled();
		expect(api.list).not.toHaveBeenCalled();
		expect(api.load).not.toHaveBeenCalled();
		expect(api.create).not.toHaveBeenCalled();
	});

	it("reopens the cloud copy saved earlier, keeps local work, and uploads nothing until asked", async () => {
		const { api, runtime, saved } = cloudRuntime();
		saved.set("usr_1", "project_cloud");
		const cloudDocument = localDocument();
		vi.mocked(api.load).mockResolvedValue(
			record(
				4,
				jsonbEcho({ ...cloudDocument, project: { ...cloudDocument.project, id: "project_cloud" } }),
			),
		);
		vi.mocked(api.update).mockResolvedValueOnce({ outcome: "conflict", currentRevision: 5 });
		const composition = createProjectStore(localDocument());
		render(
			<StudioAccountIsland
				authStore={createAuthStore({ kind: "hosted", port: authPort(SESSION) }, { now: () => NOW })}
				planStore={planStore()}
				compositionStore={composition}
				cloudRuntime={runtime}
			/>,
		);

		fireEvent.click(await screen.findByRole("button", { name: "Account for Ada Lovelace" }));
		await waitFor(() => expect(screen.getByText("Cloud copy saved")).toBeTruthy());
		expect(api.load).toHaveBeenCalledWith("project_cloud", expect.anything());
		expect(api.create).not.toHaveBeenCalled();

		composition.getState().loadDocument(localDocument("Launch, edited"));
		await waitFor(() => expect(screen.getByText("Cloud copy out of date")).toBeTruthy());
		expect(api.update).not.toHaveBeenCalled();
		// The cloud copy is only read: it never replaces the work on this device.
		expect(composition.getState().value.project).toMatchObject({
			id: "studio-local-project",
			title: "Launch, edited",
		});

		fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
		await waitFor(() => expect(screen.getByText("Cloud copy needs attention")).toBeTruthy());
		expect(api.update).toHaveBeenCalledOnce();
		expect(vi.mocked(api.update).mock.calls[0]?.[0]).toMatchObject({
			id: "project_cloud",
			expectedRevision: 4,
		});
	});
});

describe("the /app shell", () => {
	beforeEach(() => {
		Object.defineProperty(window, "matchMedia", {
			configurable: true,
			value: (query: string) => ({
				matches: false,
				media: query,
				addEventListener() {},
				removeEventListener() {},
				addListener() {},
				removeListener() {},
			}),
		});
		globalThis.ResizeObserver ??= class {
			observe() {}
			unobserve() {}
			disconnect() {}
		};
	});

	afterEach(() => {
		useAuthStore.setState({ status: { kind: "local-offline" } });
	});

	const shell = () =>
		render(
			<MemoryRouter>
				<StudioTooltipProvider>
					<SceneShell editor={<div />} sceneInspector={<div />} preview={<div />} />
				</StudioTooltipProvider>
			</MemoryRouter>,
		);

	it("names the studio with exactly one page heading", () => {
		shell();

		expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
		expect(screen.getByRole("heading", { level: 1, name: "Typelapse studio" })).toBeTruthy();
	});

	it("has no account control in the local profile", () => {
		expect(useAuthStore.getState().status.kind).toBe("local-offline");
		const { container } = shell();

		expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeTruthy();
		expect(container.querySelector(".sc-account-island")).toBeNull();
		expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
		expect(screen.queryByRole("button", { name: "On this device" })).toBeNull();
	});

	it("places the account control in the utilities corner when accounts are enabled", () => {
		useAuthStore.setState({ status: { kind: "anonymous" } });
		const { container } = shell();

		const island = container.querySelector(".sc-island-group-utilities .sc-account-island");
		expect(island).not.toBeNull();
		expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
	});
});
