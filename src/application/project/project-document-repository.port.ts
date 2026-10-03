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

export type UpdateProjectDocumentResult =
	| { readonly outcome: "updated"; readonly project: StoredProjectDocument }
	| { readonly outcome: "conflict"; readonly currentRevision: number }
	| { readonly outcome: "not-found" };

/**
 * Persistence boundary for hosted project documents.
 *
 * Ownership is part of every lookup/mutation signature. This makes an
 * accidental cross-account query harder to express and keeps authorization at
 * the same boundary as persistence rather than filtering records afterwards.
 */
export interface ProjectDocumentRepositoryPort {
	listByOwner(ownerId: AccountId): Promise<readonly ProjectDocumentSummary[]>;
	findOwnedById(ownerId: AccountId, id: string): Promise<StoredProjectDocument | null>;
	/**
	 * Create unless the owner already holds `maxProjects`. The count and the
	 * insert are one atomic step, so concurrent creates cannot overshoot it.
	 */
	create(input: {
		readonly ownerId: AccountId;
		readonly document: ProjectDocumentV2;
		readonly maxProjects: number;
	}): Promise<CreateProjectDocumentResult>;
	update(input: {
		readonly ownerId: AccountId;
		readonly id: string;
		readonly expectedRevision: number;
		readonly document: ProjectDocumentV2;
	}): Promise<UpdateProjectDocumentResult>;
	deleteOwnedById(ownerId: AccountId, id: string): Promise<boolean>;
}
