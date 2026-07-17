import type { Permission, Role } from "../value-objects/role";

export interface MemberProps {
	userId: string;
	role: Role;
}

/**
 * A user's membership in an organization: the pairing of a user with a role.
 * A member is uniquely identified within an organization by its {@link userId}.
 */
export class Member {
	readonly userId: string;
	readonly role: Role;

	private constructor(props: MemberProps) {
		this.userId = props.userId;
		this.role = props.role;
	}

	static create(props: MemberProps): Member {
		if (!props.userId.trim()) {
			throw new Error("Member userId must not be empty");
		}
		return new Member(props);
	}

	withRole(role: Role): Member {
		return new Member({ userId: this.userId, role });
	}

	can(permission: Permission): boolean {
		return this.role.can(permission);
	}

	isOwner(): boolean {
		return this.role.isOwner();
	}
}
