// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
import { createBetterAuthClientPort } from "@/infrastructure/auth/better-auth-client.adapter";
import type { BrowserHostedProjectSyncRuntime } from "@/infrastructure/project/browser-hosted-project-sync.runtime";
import { SceneShell } from "@/presentation/components/layout/scene-shell";
import { StudioAccountIsland } from "@/presentation/components/layout/studio-account-island";
import { StudioTooltipProvider } from "@/presentation/components/ui/studio-tooltip";
import type { StudioCloudRuntime } from "@/presentation/hooks/use-studio-cloud-project";
import { createApiKeyStore } from "@/presentation/stores/api-key.store";
import { createAuthStore, useAuthStore } from "@/presentation/stores/auth.store";
import { createPlanStore } from "@/presentation/stores/plan.store";
import { createProjectStore } from "@/presentation/stores/project.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { studioDocumentOf } from "@/presentation/stores/studio-composition.store";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

	it("leads a signed-in account to its API keys, and asks for them only once it gets there", async () => {
		const list = vi.fn(async () => []);
		const apiKeyStore = createApiKeyStore({ port: { list, create: vi.fn(), revoke: vi.fn() } });
		render(
			<StudioAccountIsland
				authStore={createAuthStore({ kind: "hosted", port: authPort(SESSION) }, { now: () => NOW })}
				planStore={planStore()}
				apiKeyStore={apiKeyStore}
				compositionStore={createProjectStore(localDocument())}
				cloudRuntime={null}
			/>,
		);

		fireEvent.click(await screen.findByRole("button", { name: "Account for Ada Lovelace" }));
		expect(list).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: "API keys" }));

		expect(await screen.findByRole("heading", { name: "API keys" })).toBeTruthy();
		await waitFor(() => expect(list).toHaveBeenCalledOnce());
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

	it("counts the cloud copy it just saved in the allowance, without a reload", async () => {
		const { runtime } = cloudRuntime();
		let stored = 0;
		const getAllowance = vi.fn(async () => `${stored} of 3 cloud projects`);
		const billing: BillingPort = {
			getCatalog: async () => {
				throw new Error("Billing is not configured");
			},
			getCurrentPlan: async () => Plan.free(),
			getAllowance,
			startCheckout: async () => {
				throw new Error("Unexpected checkout");
			},
			openPortal: async () => {
				throw new Error("Unexpected portal");
			},
		};
		// The server counts the copy once the save has landed.
		const counting: StudioCloudRuntime = {
			...runtime,
			createHostedSync: () => {
				const sync = runtime.createHostedSync();
				return {
					...sync,
					flush: async () => {
						const result = await sync.flush();
						stored = 1;
						return result;
					},
				} as BrowserHostedProjectSyncRuntime;
			},
		};
		render(
			<StudioAccountIsland
				authStore={createAuthStore({ kind: "hosted", port: authPort(SESSION) }, { now: () => NOW })}
				planStore={createPlanStore({ deploymentMode: "hosted", billing })}
				compositionStore={createProjectStore(localDocument())}
				cloudRuntime={counting}
			/>,
		);

		fireEvent.click(await screen.findByRole("button", { name: "Account for Ada Lovelace" }));
		expect(await screen.findByText("0 of 3 cloud projects")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Save this project to cloud" }));

		await waitFor(() => expect(screen.getByText("Cloud copy saved")).toBeTruthy());
		expect(await screen.findByText("1 of 3 cloud projects")).toBeTruthy();
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
		// What the island uploaded then: the document the Studio saves.
		const cloudDocument = studioDocumentOf(
			createProjectStore(localDocument()).getState().value,
			useSnippetStore.getState().snippet.code,
		);
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

describe("StudioAccountIsland when the auth rate limiter answers", () => {
	/**
	 * The browser's real Better Auth client over a fetch that answers the way the
	 * server does: its limiter sends 429 and the seconds to wait in `X-Retry-After`.
	 * Nothing between the form and the wire is faked, so what the island shows is
	 * what a person reads.
	 */
	function authServer() {
		const json = (body: unknown, init: ResponseInit = {}) =>
			new Response(JSON.stringify(body), {
				...init,
				headers: { "content-type": "application/json", ...init.headers },
			});
		const server = {
			signedIn: false,
			signUp: (): Response => json({ token: "t", user: SESSION.account }),
		};
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				const path = new URL(input instanceof Request ? input.url : String(input)).pathname;
				if (path.endsWith("/sign-up/email")) {
					const answer = server.signUp();
					server.signedIn = answer.ok;
					return answer;
				}
				return json(
					server.signedIn
						? {
								session: { expiresAt: SESSION.expiresAt.toISOString(), token: "t" },
								user: SESSION.account,
							}
						: null,
				);
			}),
		);
		return {
			server,
			json,
			/**
			 * What Better Auth's limiter returns: a 429 whose JSON body goes out as
			 * text/plain, with the wait in X-Retry-After when it says.
			 */
			limited: (retryAfter?: string) =>
				new Response(JSON.stringify({ message: "Too many requests. Please try again later." }), {
					status: 429,
					statusText: "Too Many Requests",
					headers: retryAfter ? { "x-retry-after": retryAfter } : {},
				}),
		};
	}

	function renderIsland() {
		return render(
			<StudioAccountIsland
				authStore={createAuthStore(
					{ kind: "hosted", port: createBetterAuthClientPort() },
					{ now: () => NOW },
				)}
				planStore={planStore()}
				compositionStore={createProjectStore(localDocument())}
				cloudRuntime={null}
			/>,
		);
	}

	/** Open the panel on its sign-up form and press Create account. */
	async function createAccount() {
		fireEvent.click(await screen.findByRole("button", { name: "Sign in" }));
		const panel = screen.getByRole("dialog", { name: "Typelapse account" });
		fireEvent.click(within(panel).getByRole("button", { name: "New here? Create an account" }));
		fireEvent.change(within(panel).getByLabelText("Name"), { target: { value: "Ada Lovelace" } });
		fireEvent.change(within(panel).getByRole("textbox", { name: "Email" }), {
			target: { value: "ada@example.com" },
		});
		fireEvent.change(within(panel).getByLabelText("Password"), {
			target: { value: "correct horse battery staple" },
		});
		fireEvent.click(within(panel).getByRole("button", { name: "Create account" }));
		return panel;
	}

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("keeps the sign-up form and says how long to wait, and the next press goes through", async () => {
		const { server, json, limited } = authServer();
		server.signUp = () => limited("8");
		renderIsland();

		const panel = await createAccount();

		const refusal = await within(panel).findByRole("alert");
		expect(refusal.textContent).toBe("Too many attempts. Try again in 8 seconds.");
		expect(screen.queryByText("Cloud unavailable")).toBeNull();
		// The person's own form, with what they typed still in it, ready for another press.
		expect((within(panel).getByRole("textbox", { name: "Email" }) as HTMLInputElement).value).toBe(
			"ada@example.com",
		);
		expect(within(panel).getByRole("button", { name: "Create account" })).toBeTruthy();

		server.signUp = () => json({ token: "t", user: SESSION.account });
		fireEvent.click(within(panel).getByRole("button", { name: "Create account" }));

		expect(await screen.findByRole("button", { name: "Account for Ada Lovelace" })).toBeTruthy();
	});

	// The other half of the rule: "Cloud unavailable" is for a service that is
	// actually out of reach, and it still takes the form away.
	it.each([
		[
			"cannot be reached",
			() => {
				throw new TypeError("Failed to fetch");
			},
		],
		[
			"fails with a 503",
			(json: (body: unknown, init?: ResponseInit) => Response) =>
				json({ message: "Service unavailable" }, { status: 503 }),
		],
	])("still reads Cloud unavailable, with no form, when the service %s", async (_case, answer) => {
		const { server, json } = authServer();
		server.signUp = () => answer(json);
		renderIsland();

		const panel = await createAccount();

		expect(await within(panel).findByText("Cloud unavailable")).toBeTruthy();
		expect(within(panel).queryByRole("textbox", { name: "Email" })).toBeNull();
		expect(within(panel).queryByRole("alert")).toBeNull();
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

describe("the account island's material", () => {
	it("defines every token the account control reads in both studio shells", () => {
		const read = (path: string) => readFileSync(resolve(__dirname, "../..", path), "utf8");
		const control = read("src/presentation/components/multimedia/studio-account-control.css");
		const island = read("src/presentation/components/layout/studio-account-island.css");
		const used = new Set([...control.matchAll(/var\((--mm-[a-z-]+)/g)].map((match) => match[1]));
		// The phone shell has no `.studio-camera-root`, so the mapping cannot sit under it.
		const mapping = island.match(/^\.sc-account-island \{([^}]*)\}/m)?.[1] ?? "";

		expect(used.size).toBeGreaterThan(0);
		for (const token of used) {
			expect(mapping, token).toContain(`${token}:`);
		}
	});
});
