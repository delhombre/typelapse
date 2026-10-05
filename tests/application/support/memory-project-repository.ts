import type { ProjectDocumentV2 } from "@/application/project/project-document";
import type {
	CreateProjectDocumentResult,
	ProjectDocumentRepositoryPort,
	ProjectDocumentSummary,
	StoredProjectDocument,
	UpdateProjectDocumentResult,
} from "@/application/project/project-document-repository.port";

/**
 * The second adapter of the project store, beside the PostgreSQL one: it counts
 * what it creates and updates, can lose a race on demand, and refuses to delete,
 * so a test that expects nothing to be removed says so by running.
 */
export class MemoryProjectRepository implements ProjectDocumentRepositoryPort {
	readonly records = new Map<string, StoredProjectDocument>();
	creates = 0;
	updates = 0;
	/** Thrown by the next create, after `beforeCreateFails` ran: a rival got there first. */
	failNextCreate: Error | null = null;
	beforeCreateFails: () => void = () => undefined;
	/** The next update meets a revision somebody else just wrote. */
	staleNextUpdate = false;

	constructor(private readonly at = new Date("2026-10-05T12:00:00.000Z")) {}

	async listByOwner(): Promise<readonly ProjectDocumentSummary[]> {
		return [];
	}

	async findOwnedById(ownerId: string, id: string) {
		const record = this.records.get(id);
		return record?.ownerId === ownerId ? record : null;
	}

	async create(input: {
		readonly ownerId: string;
		readonly document: ProjectDocumentV2;
		readonly maxProjects: number;
	}): Promise<CreateProjectDocumentResult> {
		if (this.failNextCreate) {
			const failure = this.failNextCreate;
			this.failNextCreate = null;
			this.beforeCreateFails();
			throw failure;
		}
		const owned = [...this.records.values()].filter((row) => row.ownerId === input.ownerId);
		if (owned.length >= input.maxProjects) {
			return { outcome: "limit-reached", projectCount: owned.length };
		}
		this.creates += 1;
		const record: StoredProjectDocument = {
			id: input.document.project.id,
			ownerId: input.ownerId,
			revision: 1,
			document: input.document,
			createdAt: this.at,
			updatedAt: this.at,
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
		if (this.staleNextUpdate) {
			this.staleNextUpdate = false;
			this.records.set(current.id, { ...current, revision: current.revision + 1 });
			return { outcome: "conflict", currentRevision: current.revision + 1 };
		}
		if (current.revision !== input.expectedRevision) {
			return { outcome: "conflict", currentRevision: current.revision };
		}
		this.updates += 1;
		const project = { ...current, revision: current.revision + 1, document: input.document };
		this.records.set(project.id, project);
		return { outcome: "updated", project };
	}

	async deleteOwnedById(): Promise<boolean> {
		throw new Error("a refused render must not delete anything");
	}
}
