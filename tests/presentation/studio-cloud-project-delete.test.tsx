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
import { StudioAccountIsland } from "@/presentation/components/layout/studio-account-island";
import type { StudioCloudRuntime } from "@/presentation/hooks/use-studio-cloud-project";
import { createApiKeyStore } from "@/presentation/stores/api-key.store";
import { createAuthStore } from "@/presentation/stores/auth.store";
import { createCloudProjectsStore } from "@/presentation/stores/cloud-projects.store";
import { useHostedRenderJobsStore } from "@/presentation/stores/hosted-render-jobs.store";
import { createPlanStore } from "@/presentation/stores/plan.store";
import { createProjectStore } from "@/presentation/stores/project.store";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const NOW = new Date("2026-10-06T12:00:00.000Z");
const SESSION: ClientSession = {
	account: { id: "usr_1", name: "Ada Lovelace", email: "ada@example.com" },
	expiresAt: new Date("2026-10-07T12:00:00.000Z"),
};

const authPort = (session: ClientSession | null): ClientAuthPort => ({
	signUpEmail: async () => undefined,
	signInEmail: async () => undefined,
	signOut: async () => undefined,
	getSession: async () => session,
});

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

const record = (id: string, document: ProjectDocumentV2): HostedProjectRecord => ({
	id,
	revision: 1,
	document: { ...document, project: { ...document.project, id } },
	createdAt: NOW,
	updatedAt: NOW,
});

/** The cloud as the island meets it: saves make `project_n`, and the list is what was saved. */
function cloud() {
	let made = 0;
	const kept = new Map<string, HostedProjectRecord>();
	const api: HostedProjectApiPort = {
		list: vi.fn(async () =>
			[...kept.values()].map((entry) => ({
				id: entry.id,
				title: entry.document.project.title,
				revision: entry.revision,
				sceneCount: entry.document.project.scenes.length,
				updatedAt: NOW,
			})),
		),
		load: vi.fn(async (id: string) => kept.get(id) ?? null),
		create: vi.fn(async (document: ProjectDocumentV2) => {
			made += 1;
			const created = record(`project_${made}`, document);
			kept.set(created.id, created);
			return created;
		}),
		update: vi.fn(async (input) => ({
			outcome: "updated" as const,
			project: { ...record(input.id, input.document), revision: input.expectedRevision + 1 },
		})),
		delete: vi.fn(async (id: string) => kept.delete(id)),
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
				{ api, assets, uploader: { execute: vi.fn() }, registry: createSceneAssetSourceRegistry() },
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
	return { api, runtime, saved, kept };
}

function island(
	fixture: ReturnType<typeof cloud>,
	composition = createProjectStore(localDocument()),
) {
	render(
		<StudioAccountIsland
			authStore={createAuthStore({ kind: "hosted", port: authPort(SESSION) }, { now: () => NOW })}
			planStore={planStore()}
			apiKeyStore={createApiKeyStore({
				port: { list: async () => [], create: vi.fn(), revoke: vi.fn() },
			})}
			cloudProjectsStore={createCloudProjectsStore({ port: fixture.api })}
			compositionStore={composition}
			cloudRuntime={fixture.runtime}
		/>,
	);
	return composition;
}

async function saveToCloud() {
	fireEvent.click(await screen.findByRole("button", { name: "Account for Ada Lovelace" }));
	fireEvent.click(screen.getByRole("button", { name: "Save this project to cloud" }));
	await waitFor(() => expect(screen.getByText("Cloud copy saved")).toBeTruthy());
}

async function deleteFromList(title: string, options: { openNow?: boolean } = {}) {
	fireEvent.click(screen.getByRole("button", { name: "Cloud projects" }));
	await screen.findByText(title);
	// The cloud copy of the project that is open says so.
	if (options.openNow) expect(screen.getByText("Open now")).toBeTruthy();
	fireEvent.click(screen.getByRole("button", { name: `Delete ${title}` }));
	fireEvent.click(screen.getByRole("button", { name: "Delete project" }));
	await waitFor(() => expect(screen.queryByText(title)).toBeNull());
}

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("deleting the cloud copy of the open project", () => {
	it("leaves the studio on its own project, on this device, ready to save again", async () => {
		const fixture = cloud();
		const composition = island(fixture);
		await saveToCloud();
		await deleteFromList("Launch", { openNow: true });
		fireEvent.click(screen.getByRole("button", { name: "Back to account" }));

		expect(fixture.api.delete).toHaveBeenCalledWith("project_1");
		// Nothing was loaded over the work on this device.
		expect(composition.getState().value.project).toMatchObject({
			id: "studio-local-project",
			title: "Launch",
		});
		expect(screen.getByText("On this device")).toBeTruthy();
		expect(screen.queryByText("Cloud copy needs attention")).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "Save this project to cloud" }));

		await waitFor(() => expect(screen.getByText("Cloud copy saved")).toBeTruthy());
		expect(fixture.api.create).toHaveBeenCalledTimes(2);
		expect(fixture.saved.get("usr_1")).toBe("project_2");
	});

	it("leaves the cloud copy of the open project alone when another one is deleted", async () => {
		const fixture = cloud();
		island(fixture);
		await saveToCloud();
		const other = record("project_other", { ...localDocument("Changelog") });
		fixture.kept.set(other.id, other);

		await deleteFromList("Changelog");
		fireEvent.click(screen.getByRole("button", { name: "Back to account" }));

		expect(fixture.api.delete).toHaveBeenCalledWith("project_other");
		expect(screen.getByText("Cloud copy saved")).toBeTruthy();
	});

	it("asks the render on screen whether it survived, since its renders went with the project", async () => {
		const recheck = vi.spyOn(useHostedRenderJobsStore.getState(), "recheck").mockResolvedValue();
		const fixture = cloud();
		island(fixture);
		await saveToCloud();
		expect(recheck).not.toHaveBeenCalled();

		await deleteFromList("Launch");

		expect(recheck).toHaveBeenCalledOnce();
	});

	it("reads the allowance again, so the sentence about projects follows the delete", async () => {
		const fixture = cloud();
		let reads = 0;
		const billing: BillingPort = {
			getCatalog: async () => {
				throw new Error("Billing is not configured");
			},
			getCurrentPlan: async () => Plan.free(),
			getAllowance: async () => {
				reads += 1;
				return `Allowance as read ${reads} times.`;
			},
			startCheckout: async () => {
				throw new Error("Unexpected checkout");
			},
			openPortal: async () => {
				throw new Error("Unexpected portal");
			},
		};
		render(
			<StudioAccountIsland
				authStore={createAuthStore({ kind: "hosted", port: authPort(SESSION) }, { now: () => NOW })}
				planStore={createPlanStore({ deploymentMode: "hosted", billing })}
				apiKeyStore={createApiKeyStore({
					port: { list: async () => [], create: vi.fn(), revoke: vi.fn() },
				})}
				cloudProjectsStore={createCloudProjectsStore({ port: fixture.api })}
				compositionStore={createProjectStore(localDocument())}
				cloudRuntime={fixture.runtime}
			/>,
		);
		await saveToCloud();
		// One read when the account opens, one more now that the save has landed.
		await screen.findByText("Allowance as read 2 times.");

		await deleteFromList("Launch");
		fireEvent.click(screen.getByRole("button", { name: "Back to account" }));

		expect(await screen.findByText("Allowance as read 3 times.")).toBeTruthy();
	});
});
