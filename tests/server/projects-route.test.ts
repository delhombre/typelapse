import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createProjectsRoute } from "../../server/routes/projects";
import type {
	HostedProjectAssetResolverPort,
	ReadyHostedProjectAsset,
} from "../../src/application/assets/hosted-project-asset-resolver.port";
import type {
	CreateProjectDocumentResult,
	ProjectDocumentRepositoryPort,
	ProjectDocumentSummary,
	StoredProjectDocument,
	UpdateProjectDocumentResult,
} from "../../src/application/project/project-document-repository.port";
import type { ProjectDocumentV2 } from "../../src/application/project/project-document";
import type { AuthPort } from "../../src/domain/ports/auth.port";
import { Plan } from "../../src/domain/value-objects/plan";

const NOW = new Date("2026-08-30T20:00:00.000Z");
const LEGACY = {
	title: "First project",
	code: "const value = 1;",
	language: "typescript",
	themeName: "midnight",
	background: "mesh:solar",
	steps: [{ code: "const value = 1;", duration: 900 }],
};

function projectWithImageAsset(): ProjectDocumentV2 {
	return {
		schemaVersion: 2,
		project: {
			id: "local-project",
			title: "Image project",
			canvas: { width: 1920, height: 1080, background: "mesh:solar" },
			settings: {
				progressStyle: "none",
				transitionMs: 650,
				typewriter: false,
				focusZoom: false,
			},
			assets: [
				{
					id: "asset-image",
					kind: "image",
					fileName: "client-controlled.png",
					mimeType: "image/png",
					byteSize: 123,
					checksum: "client-controlled",
					width: 800,
					height: 600,
				},
			],
			scenes: [
				{
					id: "scene-image",
					durationMs: 1000,
					blocks: [
						{
							id: "block-image",
							kind: "image",
							assetId: "asset-image",
							placement: { x: 0, y: 0, width: 1, height: 1 },
							opacity: 1,
							fit: "cover",
							focalPoint: { x: 0.5, y: 0.5 },
						},
					],
				},
			],
			audioCues: [],
		},
	};
}

class MemoryProjects implements ProjectDocumentRepositoryPort {
	readonly records = new Map<string, StoredProjectDocument>();

	async listByOwner(ownerId: string): Promise<readonly ProjectDocumentSummary[]> {
		return [...this.records.values()]
			.filter((record) => record.ownerId === ownerId)
			.map((record) => ({
				id: record.id,
				title: record.document.project.title,
				revision: record.revision,
				sceneCount: record.document.project.scenes.length,
				updatedAt: record.updatedAt,
			}));
	}

	async findOwnedById(ownerId: string, id: string): Promise<StoredProjectDocument | null> {
		const record = this.records.get(id);
		return record?.ownerId === ownerId ? record : null;
	}

	async create(input: {
		readonly ownerId: string;
		readonly document: ProjectDocumentV2;
		readonly maxProjects: number;
	}): Promise<CreateProjectDocumentResult> {
		const owned = [...this.records.values()].filter((record) => record.ownerId === input.ownerId);
		if (owned.length >= input.maxProjects) {
			return { outcome: "limit-reached", projectCount: owned.length };
		}
		const record: StoredProjectDocument = {
			id: input.document.project.id,
			ownerId: input.ownerId,
			revision: 1,
			document: input.document,
			createdAt: NOW,
			updatedAt: NOW,
		};
		this.records.set(record.id, record);
		return { outcome: "created", project: record };
	}

	async update(input: {
		readonly ownerId: string;
		readonly id: string;
		readonly expectedRevision: number;
		readonly document: ProjectDocumentV2;
	}): Promise<UpdateProjectDocumentResult> {
		const current = await this.findOwnedById(input.ownerId, input.id);
		if (!current) {
			return { outcome: "not-found" };
		}
		if (current.revision !== input.expectedRevision) {
			return { outcome: "conflict", currentRevision: current.revision };
		}
		const project: StoredProjectDocument = {
			...current,
			revision: current.revision + 1,
			document: input.document,
			updatedAt: NOW,
		};
		this.records.set(project.id, project);
		return { outcome: "updated", project };
	}

	async deleteOwnedById(ownerId: string, id: string): Promise<boolean> {
		if (!(await this.findOwnedById(ownerId, id))) {
			return false;
		}
		return this.records.delete(id);
	}
}

interface MemoryAssetRecord extends ReadyHostedProjectAsset {
	readonly ownerId: string;
	readonly projectId: string;
	readonly status: "pending" | "ready";
}

class MemoryAssets implements HostedProjectAssetResolverPort {
	readonly records = new Map<string, MemoryAssetRecord>();

	async resolveReadyForProject(input: {
		readonly ownerId: string;
		readonly projectId: string;
		readonly assetIds: readonly string[];
	}): Promise<readonly ReadyHostedProjectAsset[]> {
		return input.assetIds.flatMap((id) => {
			const asset = this.records.get(id);
			return asset?.ownerId === input.ownerId &&
				asset.projectId === input.projectId &&
				asset.status === "ready"
				? [{ id: asset.id, metadata: asset.metadata }]
				: [];
		});
	}
}

function verifiedImageAsset(
	overrides: Partial<Pick<MemoryAssetRecord, "ownerId" | "projectId" | "status">> = {},
): MemoryAssetRecord {
	return {
		id: "asset-image",
		ownerId: "account-1",
		projectId: "project-server-1",
		status: "ready",
		metadata: {
			kind: "image",
			fileName: "verified.png",
			mimeType: "image/png",
			byteSize: 456,
			checksum: "verified-server-checksum",
			width: 1600,
			height: 900,
		},
		...overrides,
	};
}

function signedInAs(accountId: string): AuthPort {
	return {
		verify: async () => ({ accountId, expiresAt: new Date(NOW.getTime() + 60_000) }),
	};
}

function appFor(
	projects: MemoryProjects,
	auth: AuthPort = signedInAs("account-1"),
	assets: HostedProjectAssetResolverPort = new MemoryAssets(),
	plan: Plan = Plan.free(),
) {
	let created = 0;
	return new Hono().route(
		"/api/projects",
		createProjectsRoute({
			auth,
			projects,
			assets,
			subscriptions: { planFor: async () => plan },
			now: () => NOW,
			createId: () => (created++ === 0 ? "project-server-1" : `project-server-${created}`),
		}),
	);
}

function request(path: string, init?: RequestInit): Request {
	const headers = new Headers(init?.headers);
	headers.set("cookie", "session=valid");
	if (init?.body) {
		headers.set("content-type", "application/json");
	}
	return new Request(`http://localhost${path}`, { ...init, headers });
}

describe("hosted project documents", () => {
	it("requires an active account session on every endpoint", async () => {
		const projects = new MemoryProjects();
		const app = appFor(projects, { verify: async () => null });

		const response = await app.request("http://localhost/api/projects");

		expect(response.status).toBe(401);
	});

	it("migrates a V1 project and assigns its hosted identity on create", async () => {
		const projects = new MemoryProjects();
		const app = appFor(projects);

		const response = await app.request(
			request("/api/projects", {
				method: "POST",
				body: JSON.stringify({ document: LEGACY }),
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(201);
		expect(body.project).toMatchObject({ id: "project-server-1", revision: 1 });
		expect(body.project.document).toMatchObject({
			schemaVersion: 2,
			project: { id: "project-server-1", title: "First project" },
		});
		expect(projects.records.get("project-server-1")?.ownerId).toBe("account-1");
	});

	it("refuses a free account's fourth cloud project with the ceiling and the plan that lifts it", async () => {
		const projects = new MemoryProjects();
		const app = appFor(projects);
		const create = () =>
			app.request(
				request("/api/projects", { method: "POST", body: JSON.stringify({ document: LEGACY }) }),
			);

		const statuses = [];
		for (let index = 0; index < 3; index += 1) {
			statuses.push((await create()).status);
		}
		const fourth = await create();

		expect(statuses).toEqual([201, 201, 201]);
		expect(fourth.status).toBe(402);
		expect(await fourth.json()).toEqual({
			error: "Free keeps 3 cloud projects; Creator keeps 100",
			code: "plan-limit",
			ceiling: "cloudProjects",
			limit: 3,
			used: 3,
			plan: "free",
			upgradeTo: "creator",
		});
		expect(projects.records.size).toBe(3);
	});

	it("lets a Creator account keep more than three cloud projects", async () => {
		const projects = new MemoryProjects();
		const app = appFor(projects, signedInAs("account-1"), new MemoryAssets(), Plan.pro());

		for (let index = 0; index < 4; index += 1) {
			const response = await app.request(
				request("/api/projects", { method: "POST", body: JSON.stringify({ document: LEGACY }) }),
			);
			expect(response.status).toBe(201);
		}
	});

	it("requires the hosted project to exist before any asset can be attached", async () => {
		const projects = new MemoryProjects();
		const app = appFor(projects);

		const response = await app.request(
			request("/api/projects", {
				method: "POST",
				body: JSON.stringify({ document: projectWithImageAsset() }),
			}),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Create the hosted project before attaching assets",
		});
		expect(projects.records.size).toBe(0);
	});

	it("lists only the caller's projects", async () => {
		const projects = new MemoryProjects();
		const app = appFor(projects);
		await app.request(
			request("/api/projects", {
				method: "POST",
				body: JSON.stringify({ document: LEGACY }),
			}),
		);
		const foreign = projects.records.get("project-server-1");
		if (!foreign) {
			throw new Error("Expected a project");
		}
		projects.records.set("project-foreign", {
			...foreign,
			id: "project-foreign",
			ownerId: "account-2",
			document: {
				...foreign.document,
				project: { ...foreign.document.project, id: "project-foreign" },
			},
		});

		const response = await app.request(request("/api/projects"));
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.projects).toHaveLength(1);
		expect(body.projects[0].id).toBe("project-server-1");
	});

	it("does not reveal whether a foreign project id exists", async () => {
		const projects = new MemoryProjects();
		const firstApp = appFor(projects, signedInAs("account-1"));
		await firstApp.request(
			request("/api/projects", {
				method: "POST",
				body: JSON.stringify({ document: LEGACY }),
			}),
		);
		const secondApp = appFor(projects, signedInAs("account-2"));

		const get = await secondApp.request(request("/api/projects/project-server-1"));
		const remove = await secondApp.request(
			request("/api/projects/project-server-1", { method: "DELETE" }),
		);
		const updateForeign = await secondApp.request(
			request("/api/projects/project-server-1", {
				method: "PUT",
				body: JSON.stringify({ expectedRevision: 1, document: LEGACY }),
			}),
		);
		const updateMissing = await secondApp.request(
			request("/api/projects/project-missing", {
				method: "PUT",
				body: JSON.stringify({ expectedRevision: 1, document: LEGACY }),
			}),
		);

		expect(get.status).toBe(404);
		expect(remove.status).toBe(404);
		expect(updateForeign.status).toBe(404);
		expect(updateMissing.status).toBe(404);
	});

	it("uses an expected revision to reject lost updates", async () => {
		const projects = new MemoryProjects();
		const app = appFor(projects);
		const createResponse = await app.request(
			request("/api/projects", {
				method: "POST",
				body: JSON.stringify({ document: LEGACY }),
			}),
		);
		const created = (await createResponse.json()).project as StoredProjectDocument;
		const changed = {
			...created.document,
			project: { ...created.document.project, title: "Changed" },
		};

		const response = await app.request(
			request("/api/projects/project-server-1", {
				method: "PUT",
				body: JSON.stringify({ expectedRevision: 0, document: changed }),
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(409);
		expect(body).toEqual({ error: "Project revision conflict", currentRevision: 1 });
	});

	it("keeps a code-only V2 update valid without an asset resolver result", async () => {
		const projects = new MemoryProjects();
		const app = appFor(projects);
		const createdResponse = await app.request(
			request("/api/projects", {
				method: "POST",
				body: JSON.stringify({ document: LEGACY }),
			}),
		);
		const created = (await createdResponse.json()).project as StoredProjectDocument;
		const codeOnly = {
			...created.document,
			project: { ...created.document.project, title: "Code only, still valid", assets: [] },
		};

		const response = await app.request(
			request("/api/projects/project-server-1", {
				method: "PUT",
				body: JSON.stringify({ expectedRevision: 1, document: codeOnly }),
			}),
		);

		expect(response.status).toBe(200);
		expect((await response.json()).project).toMatchObject({
			revision: 2,
			document: { project: { title: "Code only, still valid", assets: [] } },
		});
	});

	it("updates with canonical metadata from ready assets owned by this project", async () => {
		const projects = new MemoryProjects();
		const assets = new MemoryAssets();
		assets.records.set("asset-image", verifiedImageAsset());
		const app = appFor(projects, signedInAs("account-1"), assets);
		await app.request(
			request("/api/projects", {
				method: "POST",
				body: JSON.stringify({ document: LEGACY }),
			}),
		);

		const response = await app.request(
			request("/api/projects/project-server-1", {
				method: "PUT",
				body: JSON.stringify({ expectedRevision: 1, document: projectWithImageAsset() }),
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.project.document.project.assets).toEqual([
			{ id: "asset-image", ...verifiedImageAsset().metadata },
		]);
	});

	it.each([
		["missing", null],
		["foreign owner", verifiedImageAsset({ ownerId: "account-2" })],
		["another project", verifiedImageAsset({ projectId: "project-other" })],
		["pending", verifiedImageAsset({ status: "pending" })],
	] as const)("collapses a %s asset into the same BOLA-safe refusal", async (_case, asset) => {
		const projects = new MemoryProjects();
		const assets = new MemoryAssets();
		if (asset) {
			assets.records.set(asset.id, asset);
		}
		const app = appFor(projects, signedInAs("account-1"), assets);
		await app.request(
			request("/api/projects", {
				method: "POST",
				body: JSON.stringify({ document: LEGACY }),
			}),
		);

		const response = await app.request(
			request("/api/projects/project-server-1", {
				method: "PUT",
				body: JSON.stringify({ expectedRevision: 1, document: projectWithImageAsset() }),
			}),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "One or more project assets are unavailable",
		});
		expect(projects.records.get("project-server-1")?.revision).toBe(1);
	});

	it("rejects malformed documents before they reach persistence", async () => {
		const projects = new MemoryProjects();
		const app = appFor(projects);

		const response = await app.request(
			request("/api/projects", {
				method: "POST",
				body: JSON.stringify({ document: { ...LEGACY, code: "" } }),
			}),
		);

		expect(response.status).toBe(400);
		expect(projects.records.size).toBe(0);
	});
});
