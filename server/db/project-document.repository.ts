import { and, desc, eq, type SQL, sql } from "drizzle-orm";
import type {
	DeleteProjectDocumentResult,
	ProjectDocumentRepositoryPort,
	ProjectDocumentSummary,
	StoredProjectDocument,
	UpdateProjectDocumentResult,
} from "../../src/application/project/project-document-repository.port";
import {
	parseProjectDocument,
	type ProjectDocumentV2,
} from "../../src/application/project/project-document";
import { projects } from "./creator-schema";
import type { CreatorDatabase } from "./database";

type ProjectRow = typeof projects.$inferSelect;

/**
 * What the cloud-projects ceiling counts: the owner's regular projects. The
 * allowance reads the same rows, so what is shown is what is enforced.
 */
export function regularProjectsOf(ownerId: string) {
	return and(eq(projects.ownerId, ownerId), eq(projects.automation, false));
}

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

/** The database, or a transaction of it. */
type Executor = Pick<CreatorDatabase, "select" | "update" | "execute">;

interface Save {
	readonly ownerId: string;
	readonly id: string;
	readonly expectedRevision: number;
	readonly document: ProjectDocumentV2;
}

/**
 * Same owner lock as asset reservation and render enqueue: what counts a
 * project and then writes one serializes, so the count it reads is the count it
 * writes against.
 */
async function lockOwner(executor: Executor, ownerId: string): Promise<void> {
	await executor.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${ownerId}, 0))`);
}

async function countRegular(executor: Executor, ownerId: string): Promise<number> {
	const [owned] = await executor
		.select({ count: sql<number>`count(*)::int` })
		.from(projects)
		.where(regularProjectsOf(ownerId));
	return Number(owned?.count ?? 0);
}

/**
 * The write every save starts from: the revision moves only if it is the one
 * asked for. `only` narrows the rows it may touch, and `becomes` sets the kind
 * as the document is written; without it the kind is left as it is.
 */
async function writeRevision(
	executor: Executor,
	input: Save,
	options: { readonly only?: SQL; readonly becomes?: { readonly automation: false } } = {},
): Promise<ProjectRow | undefined> {
	const [row] = await executor
		.update(projects)
		.set({
			title: input.document.project.title,
			document: input.document,
			revision: sql`${projects.revision} + 1`,
			updatedAt: new Date(),
			...options.becomes,
		})
		.where(
			and(
				eq(projects.id, input.id),
				eq(projects.ownerId, input.ownerId),
				eq(projects.revision, input.expectedRevision),
				options.only,
			),
		)
		.returning();
	return row;
}

/** Why a write that touched nothing touched nothing: the project is gone, or its revision moved. */
async function refusalOf(
	executor: Executor,
	input: Save,
): Promise<Exclude<UpdateProjectDocumentResult, { readonly outcome: "updated" }>> {
	const [current] = await executor
		.select({ revision: projects.revision })
		.from(projects)
		.where(and(eq(projects.id, input.id), eq(projects.ownerId, input.ownerId)))
		.limit(1);
	return current
		? { outcome: "conflict", currentRevision: current.revision }
		: { outcome: "not-found" };
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
			return db.transaction(async (tx) => {
				await lockOwner(tx, input.ownerId);
				if (Number.isFinite(input.maxProjects)) {
					const projectCount = await countRegular(tx, input.ownerId);
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

		async createAutomation(input) {
			// Nothing is counted, so there is nothing to lock: two requests for one
			// source meet at the primary key, and the loser learns it from the error.
			const [row] = await db
				.insert(projects)
				.values({
					id: input.document.project.id,
					ownerId: input.ownerId,
					title: input.document.project.title,
					document: input.document,
					automation: true,
				})
				.returning();
			if (!row) {
				throw new Error("Project persistence returned no created row");
			}
			return storedProjectFromRow(row);
		},

		async update(input) {
			// A regular project is saved as it always was: one write, no lock, and
			// whatever the ceiling now is, since saving what an account holds is not
			// creating more.
			const regular = await writeRevision(db, input, { only: eq(projects.automation, false) });
			if (regular) {
				return { outcome: "updated", project: storedProjectFromRow(regular) };
			}
			// What is left is an automation project, which this save makes regular, or
			// a project that is stale or not there. Counting and writing are one step
			// under the owner lock, as for a new project.
			return db.transaction(async (tx) => {
				await lockOwner(tx, input.ownerId);
				const [current] = await tx
					.select({ revision: projects.revision, automation: projects.automation })
					.from(projects)
					.where(and(eq(projects.id, input.id), eq(projects.ownerId, input.ownerId)))
					.limit(1);
				if (!current) {
					return { outcome: "not-found" as const };
				}
				if (current.revision !== input.expectedRevision) {
					return { outcome: "conflict" as const, currentRevision: current.revision };
				}
				if (current.automation && Number.isFinite(input.maxProjects)) {
					const projectCount = await countRegular(tx, input.ownerId);
					if (projectCount >= input.maxProjects) {
						return { outcome: "limit-reached" as const, projectCount };
					}
				}
				const row = await writeRevision(tx, input, { becomes: { automation: false } });
				if (row) {
					return { outcome: "updated" as const, project: storedProjectFromRow(row) };
				}
				// Render by URL revised it between the read and the write.
				return refusalOf(tx, input);
			});
		},

		async updateAutomation(input) {
			const row = await writeRevision(db, input);
			return row
				? { outcome: "updated", project: storedProjectFromRow(row) }
				: refusalOf(db, input);
		},

		async deleteOwnedById(ownerId, id): Promise<DeleteProjectDocumentResult> {
			// The owner lock every other writer of the account takes, so a delete never
			// interleaves with a reservation or an enqueue.
			return db.transaction(async (tx): Promise<DeleteProjectDocumentResult> => {
				await lockOwner(tx, ownerId);
				const [owned] = await tx
					.select({ id: projects.id })
					.from(projects)
					.where(and(eq(projects.id, id), eq(projects.ownerId, ownerId)))
					.for("update");
				if (!owned) {
					return "not-found";
				}
				// The jobs are held first, so no worker ends one between this read and the
				// delete: a job still queued or running keeps its project, and the slot it
				// holds is counted until it ends. Its minutes are in the usage ledger
				// either way, which the delete does not touch.
				const held = await tx.execute<{ readonly status: string }>(
					sql`SELECT status FROM render_jobs WHERE project_id = ${id} FOR UPDATE`,
				);
				if (held.rows.some((job) => job.status === "queued" || job.status === "running")) {
					return "render-active";
				}
				// Its media and renders go with it by cascade, but the files they name sit
				// in the bucket, which a cascade cannot reach: each gets a note for the
				// cleanup worker, written in this transaction so it is as durable as the
				// delete.
				await tx.execute(
					sql`INSERT INTO object_deletion_outbox (id, object_key)
						SELECT stored.id, stored.object_key FROM (
							SELECT a.id AS id, a.object_key AS object_key
							FROM assets a
							WHERE a.project_id = ${id} AND a.upload_status <> 'deleted'
							UNION ALL
							SELECT j.id || ':output', j.output_object_key
							FROM render_jobs j
							WHERE j.project_id = ${id} AND j.output_object_key IS NOT NULL
							UNION ALL
							SELECT j.id || ':poster', j.output_poster_key
							FROM render_jobs j
							WHERE j.project_id = ${id} AND j.output_poster_key IS NOT NULL
						) AS stored
						ON CONFLICT DO NOTHING`,
				);
				await tx.delete(projects).where(and(eq(projects.id, id), eq(projects.ownerId, ownerId)));
				return "deleted";
			});
		},
	};
}
