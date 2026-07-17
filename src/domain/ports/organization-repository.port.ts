import type { Organization } from "../entities/organization";

/**
 * Persistence boundary for the {@link Organization} aggregate. Adapters
 * (in-memory, SQL, ...) live in the infrastructure layer.
 */
export interface OrganizationRepositoryPort {
	save(organization: Organization): Promise<void>;
	findById(id: string): Promise<Organization | null>;
	findBySlug(slug: string): Promise<Organization | null>;
	/** Organizations the given user belongs to, in any role. */
	findByMember(userId: string): Promise<Organization[]>;
	delete(id: string): Promise<void>;
}
