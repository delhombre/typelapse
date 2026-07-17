import { Plan } from "../value-objects/plan";
import { type Permission, Role } from "../value-objects/role";
import { Member } from "./member";

export interface OrganizationCreateProps {
	name: string;
	ownerId: string;
	slug?: string;
	plan?: Plan;
}

interface OrganizationProps {
	id: string;
	name: string;
	slug: string;
	plan: Plan;
	members: readonly Member[];
}

function slugify(value: string): string {
	return value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/**
 * The organization aggregate root, the billable B2B tenant. It owns its
 * members and enforces the tenancy invariants: exactly one owner at all times,
 * unique members, and no more members than the plan's seat limit.
 */
export class Organization {
	readonly id: string;
	readonly name: string;
	readonly slug: string;
	readonly plan: Plan;
	readonly members: readonly Member[];

	private constructor(props: OrganizationProps) {
		this.id = props.id;
		this.name = props.name;
		this.slug = props.slug;
		this.plan = props.plan;
		this.members = props.members;
	}

	static create(props: OrganizationCreateProps): Organization {
		if (!props.name.trim()) {
			throw new Error("Organization name must not be empty");
		}
		if (!props.ownerId.trim()) {
			throw new Error("Organization must have an owner");
		}
		const slug = props.slug?.trim() ? props.slug.trim() : slugify(props.name);
		if (!slug) {
			throw new Error("Could not derive a slug from the organization name");
		}
		const owner = Member.create({ userId: props.ownerId, role: Role.owner() });
		return new Organization({
			id: crypto.randomUUID(),
			name: props.name,
			slug,
			plan: props.plan ?? Plan.free(),
			members: [owner],
		});
	}

	get owner(): Member {
		const owner = this.members.find((m) => m.isOwner());
		if (!owner) {
			throw new Error("Organization invariant violated: no owner");
		}
		return owner;
	}

	get seatsUsed(): number {
		return this.members.length;
	}

	get seatsAvailable(): number {
		return this.plan.seatLimit - this.members.length;
	}

	hasMember(userId: string): boolean {
		return this.members.some((m) => m.userId === userId);
	}

	memberOf(userId: string): Member | undefined {
		return this.members.find((m) => m.userId === userId);
	}

	roleOf(userId: string): Role | undefined {
		return this.memberOf(userId)?.role;
	}

	can(userId: string, permission: Permission): boolean {
		return this.memberOf(userId)?.can(permission) ?? false;
	}

	addMember(userId: string, role: Role): Organization {
		if (role.isOwner()) {
			throw new Error("Cannot add a second owner; use transferOwnership");
		}
		if (this.hasMember(userId)) {
			throw new Error(`User ${userId} is already a member`);
		}
		if (this.seatsAvailable <= 0) {
			throw new Error(`No seats available on the ${this.plan.tier} plan (${this.plan.seatLimit})`);
		}
		return this.withMembers([...this.members, Member.create({ userId, role })]);
	}

	removeMember(userId: string): Organization {
		const member = this.memberOf(userId);
		if (!member) {
			throw new Error(`User ${userId} is not a member`);
		}
		if (member.isOwner()) {
			throw new Error("Cannot remove the owner; transfer ownership first");
		}
		return this.withMembers(this.members.filter((m) => m.userId !== userId));
	}

	changeRole(userId: string, role: Role): Organization {
		const member = this.memberOf(userId);
		if (!member) {
			throw new Error(`User ${userId} is not a member`);
		}
		if (role.isOwner()) {
			throw new Error("Cannot promote to owner; use transferOwnership");
		}
		if (member.isOwner()) {
			throw new Error("Cannot change the owner's role; transfer ownership first");
		}
		return this.withMembers(this.members.map((m) => (m.userId === userId ? m.withRole(role) : m)));
	}

	transferOwnership(toUserId: string): Organization {
		const target = this.memberOf(toUserId);
		if (!target) {
			throw new Error(`User ${toUserId} is not a member`);
		}
		if (target.isOwner()) {
			throw new Error(`User ${toUserId} is already the owner`);
		}
		const currentOwnerId = this.owner.userId;
		return this.withMembers(
			this.members.map((m) => {
				if (m.userId === toUserId) {
					return m.withRole(Role.owner());
				}
				if (m.userId === currentOwnerId) {
					return m.withRole(Role.admin());
				}
				return m;
			}),
		);
	}

	rename(name: string): Organization {
		if (!name.trim()) {
			throw new Error("Organization name must not be empty");
		}
		return new Organization({ ...this, name });
	}

	changePlan(plan: Plan): Organization {
		if (plan.seatLimit < this.members.length) {
			throw new Error(
				`Cannot switch to a ${plan.seatLimit}-seat plan with ${this.members.length} members`,
			);
		}
		return new Organization({ ...this, plan });
	}

	private withMembers(members: readonly Member[]): Organization {
		return new Organization({ ...this, members });
	}
}
