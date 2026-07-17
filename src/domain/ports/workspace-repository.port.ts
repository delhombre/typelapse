import type { Workspace } from "../entities/workspace";

/**
 * Persistence boundary for the {@link Workspace} aggregate. Adapters
 * (in-memory, SQL, ...) live in the infrastructure layer.
 */
export interface WorkspaceRepositoryPort {
	save(workspace: Workspace): Promise<void>;
	findById(id: string): Promise<Workspace | null>;
	/** Workspaces belonging to an organization. */
	findByOrganization(organizationId: string): Promise<Workspace[]>;
	delete(id: string): Promise<void>;
}
