import type { ProjectDocumentV2 } from "@/application/project/project-document";
import type {
	CreateProjectDocumentResult,
	DeleteProjectDocumentResult,
	ProjectDocumentRepositoryPort,
	ProjectDocumentSummary,
	SaveProjectDocumentResult,
	StoredProjectDocument,
	UpdateProjectDocumentResult,
} from "@/application/project/project-document-repository.port";

/**
 * The second adapter of the project store, beside the PostgreSQL one: it counts
 * what it creates and updates, can lose a race on demand, and keeps the same
 * rules about what the ceiling counts, which
 * `tests/server/project-document-repository.contract.test.ts` holds both
 * adapters to.
 */
export class MemoryProjectRepository implements ProjectDocumentRepositoryPort {
	readonly records = new Map<string, StoredProjectDocument>();
	/** The ids of the automation projects; a record that is not here is regular and counts. */
	readonly automation = new Set<string>();
	/** The ids of the projects with a render still queued or running: they are kept. */
	readonly rendering = new Set<string>();
	creates = 0;
	updates = 0;
	/** Thrown by the next create, after `beforeCreateFails` ran: a rival got there first. */
	failNextCreate: Error | null = null;
	beforeCreateFails: () => void = () => undefined;
	/** The next update meets a revision somebody else just wrote. */
	staleNextUpdate = false;

	constructor(private readonly at = new Date("2026-10-05T12:00:00.000Z")) {}

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

	async findOwnedById(ownerId: string, id: string) {
		const record = this.records.get(id);
		return record?.ownerId === ownerId ? record : null;
	}

	async existsOwnedById(ownerId: string, id: string): Promise<boolean> {
		return this.records.get(id)?.ownerId === ownerId;
	}

	/** What the ceiling counts: the owner's regular projects. */
	private regularCount(ownerId: string): number {
		return [...this.records.values()].filter(
			(row) => row.ownerId === ownerId && !this.automation.has(row.id),
		).length;
	}

	private insert(ownerId: string, document: ProjectDocumentV2): StoredProjectDocument {
		if (this.failNextCreate) {
			const failure = this.failNextCreate;
			this.failNextCreate = null;
			this.beforeCreateFails();
			throw failure;
		}
		// The primary key of the PostgreSQL adapter: ids are global, not per owner.
		if (this.records.has(document.project.id)) {
			throw new Error(`duplicate key value violates unique constraint: ${document.project.id}`);
		}
		this.creates += 1;
		const record: StoredProjectDocument = {
			id: document.project.id,
			ownerId,
			revision: 1,
			document,
			createdAt: this.at,
			updatedAt: this.at,
		};
		this.records.set(record.id, record);
		return record;
	}

	async create(input: {
		readonly ownerId: string;
		readonly document: ProjectDocumentV2;
		readonly maxProjects: number;
	}): Promise<CreateProjectDocumentResult> {
		const projectCount = this.regularCount(input.ownerId);
		if (projectCount >= input.maxProjects) {
			return { outcome: "limit-reached", projectCount };
		}
		return { outcome: "created", project: this.insert(input.ownerId, input.document) };
	}

	async createAutomation(input: {
		readonly ownerId: string;
		readonly document: ProjectDocumentV2;
	}): Promise<StoredProjectDocument> {
		const record = this.insert(input.ownerId, input.document);
		this.automation.add(record.id);
		return record;
	}

	async update(input: {
		readonly ownerId: string;
		readonly id: string;
		readonly expectedRevision: number;
		readonly document: ProjectDocumentV2;
		readonly maxProjects: number;
	}): Promise<SaveProjectDocumentResult> {
		const current = await this.findOwnedById(input.ownerId, input.id);
		if (!current) {
			return { outcome: "not-found" };
		}
		const stale = this.conflictOf(current, input.expectedRevision);
		if (stale) {
			return stale;
		}
		// The studio's save makes an automation project regular, so it takes a place.
		if (this.automation.has(current.id)) {
			const projectCount = this.regularCount(input.ownerId);
			if (projectCount >= input.maxProjects) {
				return { outcome: "limit-reached", projectCount };
			}
			this.automation.delete(current.id);
		}
		return this.write(current, input.document);
	}

	async updateAutomation(input: {
		readonly ownerId: string;
		readonly id: string;
		readonly expectedRevision: number;
		readonly document: ProjectDocumentV2;
	}): Promise<UpdateProjectDocumentResult> {
		const current = await this.findOwnedById(input.ownerId, input.id);
		if (!current) {
			return { outcome: "not-found" };
		}
		return this.conflictOf(current, input.expectedRevision) ?? this.write(current, input.document);
	}

	/** The revision a writer expected is not the stored one, or somebody else wrote just now. */
	private conflictOf(
		current: StoredProjectDocument,
		expectedRevision: number,
	): { readonly outcome: "conflict"; readonly currentRevision: number } | null {
		if (this.staleNextUpdate) {
			this.staleNextUpdate = false;
			this.records.set(current.id, { ...current, revision: current.revision + 1 });
			return { outcome: "conflict", currentRevision: current.revision + 1 };
		}
		return current.revision === expectedRevision
			? null
			: { outcome: "conflict", currentRevision: current.revision };
	}

	private write(
		current: StoredProjectDocument,
		document: ProjectDocumentV2,
	): UpdateProjectDocumentResult {
		this.updates += 1;
		const project = { ...current, revision: current.revision + 1, document };
		this.records.set(project.id, project);
		return { outcome: "updated", project };
	}

	async deleteOwnedById(ownerId: string, id: string): Promise<DeleteProjectDocumentResult> {
		if (!(await this.findOwnedById(ownerId, id))) {
			return "not-found";
		}
		if (this.rendering.has(id)) {
			return "render-active";
		}
		this.automation.delete(id);
		this.records.delete(id);
		return "deleted";
	}
}
