import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import {
	canonicalizeHostedProjectUpdate,
	type HostedProjectAssetResolverPort,
} from "../../src/application/assets/canonicalize-hosted-project-assets";
import { authenticateAccount } from "../../src/application/auth/authenticate-account";
import { hydrateProjectDocument } from "../../src/application/project/hydrate-project-document";
import { migrateV1ToV2 } from "../../src/application/project/migrate-v1-project";
import type { ProjectDocumentRepositoryPort } from "../../src/application/project/project-document-repository.port";
import {
	parseProjectDocument,
	type ProjectDocumentV2,
} from "../../src/application/project/project-document";
import type { AuthPort } from "../../src/domain/ports/auth.port";

const MAX_PROJECT_DOCUMENT_BYTES = 2 * 1024 * 1024;

interface ProjectsRouteEnv {
	Variables: {
		accountId: string;
	};
}

export interface ProjectsRouteDeps {
	readonly auth: AuthPort;
	readonly projects: ProjectDocumentRepositoryPort;
	readonly assets?: HostedProjectAssetResolverPort;
	readonly now?: () => Date;
	readonly createId?: () => string;
}

function withProjectId(document: ProjectDocumentV2, id: string): ProjectDocumentV2 {
	return {
		...document,
		project: { ...document.project, id },
	};
}

function normalizeDocument(input: unknown): ProjectDocumentV2 {
	const parsed = parseProjectDocument(input);
	const document = parsed.schemaVersion === 1 ? migrateV1ToV2(parsed.document) : parsed.document;
	hydrateProjectDocument(document);
	return document;
}

function isV2Document(input: unknown): boolean {
	return typeof input === "object" && input !== null && "schemaVersion" in input;
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
	const input = await request.json().catch(() => null);
	if (typeof input !== "object" || input === null || Array.isArray(input)) {
		return null;
	}
	return input as Record<string, unknown>;
}

/** Authenticated, owner-scoped CRUD and optimistic sync for hosted projects. */
export function createProjectsRoute({
	auth,
	projects,
	assets = { resolveReadyForProject: async () => [] },
	now = () => new Date(),
	createId = () => `project_${crypto.randomUUID()}`,
}: ProjectsRouteDeps): Hono<ProjectsRouteEnv> {
	const route = new Hono<ProjectsRouteEnv>();

	route.use("*", async (c, next) => {
		const accountId = await authenticateAccount({
			credential: c.req.header("cookie") ?? null,
			auth,
			now: now(),
		});
		if (!accountId) {
			return c.json({ error: "Sign in to sync projects" }, 401);
		}
		c.set("accountId", accountId);
		await next();
	});

	route.use(
		"*",
		bodyLimit({
			maxSize: MAX_PROJECT_DOCUMENT_BYTES,
			onError: (c) => c.json({ error: "Project document is too large" }, 413),
		}),
	);

	route.get("/", async (c) => {
		const items = await projects.listByOwner(c.get("accountId"));
		return c.json({ projects: items });
	});

	route.post("/", async (c) => {
		const input = await readJson(c.req.raw);
		if (!input || !("document" in input)) {
			return c.json({ error: "A project document is required" }, 400);
		}
		try {
			const document = withProjectId(normalizeDocument(input.document), createId());
			if (document.project.assets.length > 0) {
				throw new Error("Create the hosted project before attaching assets");
			}
			const project = await projects.create({ ownerId: c.get("accountId"), document });
			return c.json({ project }, 201);
		} catch (error) {
			return c.json(
				{ error: error instanceof Error ? error.message : "Invalid project document" },
				400,
			);
		}
	});

	route.get("/:id", async (c) => {
		const project = await projects.findOwnedById(c.get("accountId"), c.req.param("id"));
		if (!project) {
			return c.json({ error: "Project not found" }, 404);
		}
		return c.json({ project });
	});

	route.put("/:id", async (c) => {
		const input = await readJson(c.req.raw);
		if (
			!input ||
			!("document" in input) ||
			typeof input.expectedRevision !== "number" ||
			!Number.isSafeInteger(input.expectedRevision) ||
			input.expectedRevision < 0
		) {
			return c.json({ error: "Document and expectedRevision are required" }, 400);
		}
		try {
			const id = c.req.param("id");
			const ownerId = c.get("accountId");
			if (!(await projects.findOwnedById(ownerId, id))) {
				return c.json({ error: "Project not found" }, 404);
			}
			const document = isV2Document(input.document)
				? await canonicalizeHostedProjectUpdate({
						ownerId,
						projectId: id,
						document: input.document,
						assets,
					})
				: withProjectId(normalizeDocument(input.document), id);
			const result = await projects.update({
				ownerId,
				id,
				expectedRevision: input.expectedRevision,
				document,
			});
			if (result.outcome === "not-found") {
				return c.json({ error: "Project not found" }, 404);
			}
			if (result.outcome === "conflict") {
				return c.json(
					{
						error: "Project revision conflict",
						currentRevision: result.currentRevision,
					},
					409,
				);
			}
			return c.json({ project: result.project });
		} catch (error) {
			return c.json(
				{ error: error instanceof Error ? error.message : "Invalid project document" },
				400,
			);
		}
	});

	route.delete("/:id", async (c) => {
		const deleted = await projects.deleteOwnedById(c.get("accountId"), c.req.param("id"));
		if (!deleted) {
			return c.json({ error: "Project not found" }, 404);
		}
		return c.body(null, 204);
	});

	return route;
}
