// Groundwork: team-workspaces domain, intentional but not yet wired into the running app.
const ROLE_NAMES = ["owner", "admin", "member"] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

const PERMISSIONS = [
	"manage_billing",
	"manage_members",
	"manage_workspace",
	"edit_library",
	"view_library",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<RoleName, readonly Permission[]> = {
	owner: ["manage_billing", "manage_members", "manage_workspace", "edit_library", "view_library"],
	admin: ["manage_members", "manage_workspace", "edit_library", "view_library"],
	member: ["edit_library", "view_library"],
};

/**
 * A member's role within an organization. Roles are ordered by authority
 * (owner > admin > member) and drive access control through {@link Role.can}.
 */
export class Role {
	readonly name: RoleName;

	private constructor(name: RoleName) {
		this.name = name;
	}

	static create(name: RoleName): Role {
		if (!ROLE_NAMES.includes(name)) {
			throw new Error(`Invalid role: ${name}. Must be one of: ${ROLE_NAMES.join(", ")}`);
		}
		return new Role(name);
	}

	/** Parse a role from untrusted input (e.g. a persisted record or API payload). */
	static fromString(value: string): Role {
		return Role.create(value as RoleName);
	}

	static owner(): Role {
		return new Role("owner");
	}

	static admin(): Role {
		return new Role("admin");
	}

	static member(): Role {
		return new Role("member");
	}

	can(permission: Permission): boolean {
		return ROLE_PERMISSIONS[this.name].includes(permission);
	}

	isOwner(): boolean {
		return this.name === "owner";
	}

	equals(other: Role): boolean {
		return this.name === other.name;
	}
}
