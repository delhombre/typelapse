import { Member } from "@/domain/entities/member";
import { Role } from "@/domain/value-objects/role";
import { describe, expect, it } from "vitest";

describe("Member", () => {
	it("creates a member with a user id and role", () => {
		const member = Member.create({ userId: "user-1", role: Role.member() });
		expect(member.userId).toBe("user-1");
		expect(member.role.name).toBe("member");
	});

	it("rejects an empty user id", () => {
		expect(() => Member.create({ userId: "", role: Role.member() })).toThrow();
		expect(() => Member.create({ userId: "   ", role: Role.member() })).toThrow();
	});

	it("delegates permission checks to its role", () => {
		const admin = Member.create({ userId: "u", role: Role.admin() });
		expect(admin.can("manage_members")).toBe(true);
		expect(admin.can("manage_billing")).toBe(false);
	});

	it("reports whether it is the owner", () => {
		expect(Member.create({ userId: "u", role: Role.owner() }).isOwner()).toBe(true);
		expect(Member.create({ userId: "u", role: Role.member() }).isOwner()).toBe(false);
	});

	it("changes role immutably", () => {
		const member = Member.create({ userId: "u", role: Role.member() });
		const promoted = member.withRole(Role.admin());
		expect(promoted.role.name).toBe("admin");
		expect(member.role.name).toBe("member");
		expect(promoted).not.toBe(member);
	});
});
