import { and, desc, eq, sql } from "drizzle-orm";
import type {
	ProjectDocumentRepositoryPort,
	ProjectDocumentSummary,
	StoredProjectDocument,
} from "../../src/application/project/project-document-repository.port";
import {
	parseProjectDocument,
	type ProjectDocumentV2,
} from "../../src/application/project/project-document";
import { projects } from "./creator-schema";
import type { CreatorDatabase } from "./database";

type ProjectRow = typeof projects.$inferSelect;

function verifiedDocument(input: unknown): ProjectDocumentV2 {
	const parsed = parseProjectDocument(input);
	if (parsed.schemaVersion !== 2) {
		throw new Error("Hosted persistence returned a non-V2 project document");
	}
	return parsed.document;
}

export function storedProjectFromRow(row: ProjectRow): StoredProjectDocument {
	return {
		id: row.id,
		ownerId: row.ownerId,
		revision: row.revision,
		document: verifiedDocument(row.document),
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

/** PostgreSQL/Drizzle implementation with ownership embedded in every mutation. */
export function createProjectDocumentRepository(
	db: CreatorDatabase,
): ProjectDocumentRepositoryPort {
	return {
		async listByOwner(ownerId) {
			const rows = await db
				.select()
				.from(projects)
				.where(eq(projects.ownerId, ownerId))
				.orderBy(desc(projects.updatedAt));
			return rows.map((row): ProjectDocumentSummary => {
				const document = verifiedDocument(row.document);
				return {
					id: row.id,
					title: row.title,
					revision: row.revision,
					sceneCount: document.project.scenes.length,
					updatedAt: row.updatedAt,
				};
			});
		},

		async findOwnedById(ownerId, id) {
			const [row] = await db
				.select()
				.from(projects)
				.where(and(eq(projects.id, id), eq(projects.ownerId, ownerId)))
				.limit(1);
			return row ? storedProjectFromRow(row) : null;
		},

		async create(input) {
			// Same owner lock as asset reservation and render enqueue: a burst of
			// creates serializes, so the count it reads is the count it inserts against.
			return db.transaction(async (tx) => {
				await tx.execute(
					sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.ownerId}, 0))`,
				);
				if (Number.isFinite(input.maxProjects)) {
					const [owned] = await tx
						.select({ count: sql<number>`count(*)::int` })
						.from(projects)
						.where(eq(projects.ownerId, input.ownerId));
					const projectCount = Number(owned?.count ?? 0);
					if (projectCount >= input.maxProjects) {
						return { outcome: "limit-reached" as const, projectCount };
					}
				}
				const [row] = await tx
					.insert(projects)
					.values({
						id: input.document.project.id,
						ownerId: input.ownerId,
						title: input.document.project.title,
						document: input.document,
					})
					.returning();
				if (!row) {
					throw new Error("Project persistence returned no created row");
				}
				return { outcome: "created" as const, project: storedProjectFromRow(row) };
			});
		},

		async update(input) {
			const [row] = await db
				.update(projects)
				.set({
					title: input.document.project.title,
					document: input.document,
					revision: sql`${projects.revision} + 1`,
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(projects.id, input.id),
						eq(projects.ownerId, input.ownerId),
						eq(projects.revision, input.expectedRevision),
					),
				)
				.returning();
			if (row) {
				return { outcome: "updated", project: storedProjectFromRow(row) };
			}
			const [current] = await db
				.select({ revision: projects.revision })
				.from(projects)
				.where(and(eq(projects.id, input.id), eq(projects.ownerId, input.ownerId)))
				.limit(1);
			return current
				? { outcome: "conflict", currentRevision: current.revision }
				: { outcome: "not-found" };
		},

		async deleteOwnedById(ownerId, id) {
			const deleted = await db
				.delete(projects)
				.where(and(eq(projects.id, id), eq(projects.ownerId, ownerId)))
				.returning({ id: projects.id });
			return deleted.length > 0;
		},
	};
}
