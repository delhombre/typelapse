import { Organization } from "@/domain/entities/organization";
import { Plan } from "@/domain/value-objects/plan";
import { Role } from "@/domain/value-objects/role";
import { describe, expect, it } from "vitest";

function createOrg(overrides?: { plan?: Plan; slug?: string }) {
	return Organization.create({ name: "Acme", ownerId: "owner-1", ...overrides });
}

describe("Organization", () => {
	describe("creation", () => {
		it("creates an org with the creator as sole owner", () => {
			const org = Organization.create({ name: "Acme Inc", ownerId: "owner-1" });
			expect(org.id).toBeDefined();
			expect(org.name).toBe("Acme Inc");
			expect(org.members).toHaveLength(1);
			expect(org.owner.userId).toBe("owner-1");
			expect(org.owner.role.name).toBe("owner");
		});

		it("defaults to the free single-seat plan", () => {
			const org = createOrg();
			expect(org.plan.tier).toBe("free");
			expect(org.seatsUsed).toBe(1);
			expect(org.seatsAvailable).toBe(0);
		});

		it("derives a slug from the name", () => {
			const org = Organization.create({ name: "Acme Inc!", ownerId: "o" });
			expect(org.slug).toBe("acme-inc");
		});

		it("accepts an explicit slug and plan", () => {
			const org = Organization.create({
				name: "Acme",
				ownerId: "o",
				slug: "custom",
				plan: Plan.team(5),
			});
			expect(org.slug).toBe("custom");
			expect(org.plan.seatLimit).toBe(5);
		});

		it("rejects an empty name", () => {
			expect(() => Organization.create({ name: "", ownerId: "o" })).toThrow();
		});

		it("rejects an empty owner id", () => {
			expect(() => Organization.create({ name: "Acme", ownerId: "" })).toThrow();
		});
	});

	describe("membership", () => {
		it("adds a member when seats are available", () => {
			const org = createOrg({ plan: Plan.team(3) }).addMember("user-2", Role.member());
			expect(org.members).toHaveLength(2);
			expect(org.hasMember("user-2")).toBe(true);
			expect(org.roleOf("user-2")?.name).toBe("member");
			expect(org.seatsUsed).toBe(2);
			expect(org.seatsAvailable).toBe(1);
		});

		it("refuses to add a member when seats are exhausted (paywall)", () => {
			const org = createOrg();
			expect(() => org.addMember("user-2", Role.member())).toThrow();
		});

		it("refuses to add a duplicate member", () => {
			const org = createOrg({ plan: Plan.team(3) }).addMember("user-2", Role.member());
			expect(() => org.addMember("user-2", Role.admin())).toThrow();
		});

		it("refuses to add a second owner directly", () => {
			const org = createOrg({ plan: Plan.team(3) });
			expect(() => org.addMember("user-2", Role.owner())).toThrow();
		});

		it("removes a member", () => {
			const org = createOrg({ plan: Plan.team(3) }).addMember("user-2", Role.member());
			const updated = org.removeMember("user-2");
			expect(updated.hasMember("user-2")).toBe(false);
			expect(updated.seatsUsed).toBe(1);
		});

		it("refuses to remove an unknown member", () => {
			expect(() => createOrg().removeMember("ghost")).toThrow();
		});

		it("refuses to remove the owner (must transfer first)", () => {
			expect(() => createOrg().removeMember("owner-1")).toThrow();
		});

		it("is immutable: addMember returns a new instance", () => {
			const org = createOrg({ plan: Plan.team(3) });
			const updated = org.addMember("user-2", Role.member());
			expect(updated).not.toBe(org);
			expect(org.members).toHaveLength(1);
		});
	});

	describe("roles", () => {
		it("changes a member's role", () => {
			const org = createOrg({ plan: Plan.team(3) }).addMember("user-2", Role.member());
			const updated = org.changeRole("user-2", Role.admin());
			expect(updated.roleOf("user-2")?.name).toBe("admin");
		});

		it("refuses to change the role of an unknown member", () => {
			expect(() => createOrg().changeRole("ghost", Role.admin())).toThrow();
		});

		it("refuses to promote a member to owner via changeRole", () => {
			const org = createOrg({ plan: Plan.team(3) }).addMember("user-2", Role.member());
			expect(() => org.changeRole("user-2", Role.owner())).toThrow();
		});

		it("refuses to demote the owner via changeRole", () => {
			expect(() => createOrg().changeRole("owner-1", Role.admin())).toThrow();
		});
	});

	describe("ownership transfer", () => {
		it("transfers ownership and demotes the previous owner to admin", () => {
			const org = createOrg({ plan: Plan.team(3) }).addMember("user-2", Role.member());
			const updated = org.transferOwnership("user-2");
			expect(updated.owner.userId).toBe("user-2");
			expect(updated.roleOf("owner-1")?.name).toBe("admin");
			expect(updated.members.filter((m) => m.isOwner())).toHaveLength(1);
		});

		it("refuses to transfer to a non-member", () => {
			expect(() => createOrg({ plan: Plan.team(3) }).transferOwnership("ghost")).toThrow();
		});

		it("refuses to transfer to the current owner", () => {
			expect(() => createOrg().transferOwnership("owner-1")).toThrow();
		});
	});

	describe("plan and billing", () => {
		it("upgrades the plan", () => {
			const org = createOrg().changePlan(Plan.team(5));
			expect(org.plan.seatLimit).toBe(5);
			expect(org.seatsAvailable).toBe(4);
		});

		it("refuses to downgrade below the current member count", () => {
			const org = createOrg({ plan: Plan.team(3) })
				.addMember("user-2", Role.member())
				.addMember("user-3", Role.member());
			expect(() => org.changePlan(Plan.free())).toThrow();
		});
	});

	describe("permissions", () => {
		it("answers can(userId, permission) via the member's role", () => {
			const org = createOrg({ plan: Plan.team(3) }).addMember("user-2", Role.member());
			expect(org.can("owner-1", "manage_billing")).toBe(true);
			expect(org.can("user-2", "manage_billing")).toBe(false);
			expect(org.can("user-2", "edit_library")).toBe(true);
		});

		it("returns false for a non-member", () => {
			expect(createOrg().can("ghost", "view_library")).toBe(false);
		});
	});

	describe("rename", () => {
		it("renames immutably", () => {
			const org = createOrg();
			const renamed = org.rename("New Name");
			expect(renamed.name).toBe("New Name");
			expect(org.name).toBe("Acme");
		});

		it("rejects an empty name", () => {
			expect(() => createOrg().rename("")).toThrow();
		});
	});
});
