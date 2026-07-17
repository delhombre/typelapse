import { Role } from "@/domain/value-objects/role";
import { describe, expect, it } from "vitest";

describe("Role", () => {
	it("creates the owner role", () => {
		const role = Role.owner();
		expect(role.name).toBe("owner");
		expect(role.isOwner()).toBe(true);
	});

	it("creates admin and member roles", () => {
		expect(Role.admin().name).toBe("admin");
		expect(Role.member().name).toBe("member");
		expect(Role.admin().isOwner()).toBe(false);
	});

	it("parses a role from a string", () => {
		expect(Role.fromString("admin").name).toBe("admin");
	});

	it("rejects an unknown role string", () => {
		expect(() => Role.fromString("superuser")).toThrow();
	});

	it("gives the owner every permission", () => {
		const owner = Role.owner();
		expect(owner.can("manage_billing")).toBe(true);
		expect(owner.can("manage_members")).toBe(true);
		expect(owner.can("manage_workspace")).toBe(true);
		expect(owner.can("edit_library")).toBe(true);
		expect(owner.can("view_library")).toBe(true);
	});

	it("lets an admin manage members and the library but not billing", () => {
		const admin = Role.admin();
		expect(admin.can("manage_members")).toBe(true);
		expect(admin.can("manage_workspace")).toBe(true);
		expect(admin.can("edit_library")).toBe(true);
		expect(admin.can("manage_billing")).toBe(false);
	});

	it("lets a member use the shared library but not manage the org", () => {
		const member = Role.member();
		expect(member.can("view_library")).toBe(true);
		expect(member.can("edit_library")).toBe(true);
		expect(member.can("manage_members")).toBe(false);
		expect(member.can("manage_workspace")).toBe(false);
		expect(member.can("manage_billing")).toBe(false);
	});

	it("compares roles by name", () => {
		expect(Role.admin().equals(Role.admin())).toBe(true);
		expect(Role.admin().equals(Role.member())).toBe(false);
	});
});
