import type { AccountId } from "../../domain/ports/auth.port";
import type { ProjectDocumentV2 } from "./project-document";

export interface StoredProjectDocument {
	readonly id: string;
	readonly ownerId: AccountId;
	readonly revision: number;
	readonly document: ProjectDocumentV2;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export interface ProjectDocumentSummary {
	readonly id: string;
	readonly title: string;
	readonly revision: number;
	readonly sceneCount: number;
	readonly updatedAt: Date;
}

export type CreateProjectDocumentResult =
	| { readonly outcome: "created"; readonly project: StoredProjectDocument }
	| { readonly outcome: "limit-reached"; readonly projectCount: number };

export type DeleteProjectDocumentResult = "deleted" | "not-found" | "render-active";

export type UpdateProjectDocumentResult =
	| { readonly outcome: "updated"; readonly project: StoredProjectDocument }
	| { readonly outcome: "conflict"; readonly currentRevision: number }
	| { readonly outcome: "not-found" };

/** The studio's save also meets the ceiling when it is what makes an automation project count. */
export type SaveProjectDocumentResult =
	| UpdateProjectDocumentResult
	| { readonly outcome: "limit-reached"; readonly projectCount: number };

/**
 * Persistence boundary for hosted project documents.
 *
 * Ownership is part of every lookup/mutation signature. This makes an
 * accidental cross-account query harder to express and keeps authorization at
 * the same boundary as persistence rather than filtering records afterwards.
 *
 * A project is regular or automation. A regular project is one a person has
 * saved from the studio, and the owner's ceiling counts it. An automation
 * project is one only render by URL has written, and the ceiling does not count
 * it until a save from the studio makes it regular. A writer says which it is
 * by the method it calls: `create` and `update` are the studio's, so a writer
 * that does not ask for the exemption by name is counted.
 */
export interface ProjectDocumentRepositoryPort {
	listByOwner(ownerId: AccountId): Promise<readonly ProjectDocumentSummary[]>;
	findOwnedById(ownerId: AccountId, id: string): Promise<StoredProjectDocument | null>;
	/**
	 * The studio's new project: created unless the owner already holds
	 * `maxProjects` regular projects. The count and the insert are one atomic
	 * step, so concurrent creates cannot overshoot it.
	 */
	create(input: {
		readonly ownerId: AccountId;
		readonly document: ProjectDocumentV2;
		readonly maxProjects: number;
	}): Promise<CreateProjectDocumentResult>;
	/**
	 * Render by URL's new project: an automation project, outside the ceiling and
	 * so never refused for it. It rejects when the id is taken, which is how a
	 * rival request for the same source shows itself.
	 */
	createAutomation(input: {
		readonly ownerId: AccountId;
		readonly document: ProjectDocumentV2;
	}): Promise<StoredProjectDocument>;
	/**
	 * The studio's save of a project. It makes an automation project regular, and
	 * from then on the project counts, so the save is refused (`limit-reached`,
	 * nothing written) when the owner already holds `maxProjects` regular
	 * projects, atomically with the count. A regular project is saved as it is,
	 * whatever the ceiling now is: saving what an account holds is not creating
	 * more. A stale revision is a conflict before the ceiling is asked.
	 */
	update(input: {
		readonly ownerId: AccountId;
		readonly id: string;
		readonly expectedRevision: number;
		readonly document: ProjectDocumentV2;
		readonly maxProjects: number;
	}): Promise<SaveProjectDocumentResult>;
	/**
	 * A new revision written by render by URL: the document is replaced under the
	 * same optimistic revision as `update`, and the project's kind does not
	 * change, so a regular project stays regular and an automation project stays
	 * automation.
	 */
	updateAutomation(input: {
		readonly ownerId: AccountId;
		readonly id: string;
		readonly expectedRevision: number;
		readonly document: ProjectDocumentV2;
	}): Promise<UpdateProjectDocumentResult>;
	/**
	 * Takes the project with its media and renders. A project with a render still
	 * queued or running is kept (`render-active`): the render holds a slot of the
	 * account's concurrent renders until it ends, and a delete must not free it.
	 */
	deleteOwnedById(ownerId: AccountId, id: string): Promise<DeleteProjectDocumentResult>;
}
