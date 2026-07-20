import { Workspace } from "@/domain/entities/workspace";
import { describe, expect, it } from "vitest";

describe("Workspace", () => {
	it("creates a workspace bound to an organization", () => {
		const ws = Workspace.create({ organizationId: "org-1", name: "Shared" });
		expect(ws.id).toBeDefined();
		expect(ws.organizationId).toBe("org-1");
		expect(ws.name).toBe("Shared");
		expect(ws.snippetIds).toEqual([]);
		expect(ws.templateIds).toEqual([]);
	});

	it("rejects an empty organization id", () => {
		expect(() => Workspace.create({ organizationId: "", name: "S" })).toThrow();
	});

	it("rejects an empty name", () => {
		expect(() => Workspace.create({ organizationId: "o", name: "" })).toThrow();
	});

	describe("shared snippet library", () => {
		it("shares a snippet into the library", () => {
			const ws = Workspace.create({ organizationId: "o", name: "S" }).shareSnippet("snip-1");
			expect(ws.snippetIds).toEqual(["snip-1"]);
			expect(ws.hasSnippet("snip-1")).toBe(true);
		});

		it("refuses to share the same snippet twice", () => {
			const ws = Workspace.create({ organizationId: "o", name: "S" }).shareSnippet("snip-1");
			expect(() => ws.shareSnippet("snip-1")).toThrow();
		});

		it("unshares a snippet", () => {
			const ws = Workspace.create({ organizationId: "o", name: "S" })
				.shareSnippet("snip-1")
				.unshareSnippet("snip-1");
			expect(ws.hasSnippet("snip-1")).toBe(false);
		});

		it("refuses to unshare a snippet that is not in the library", () => {
			const ws = Workspace.create({ organizationId: "o", name: "S" });
			expect(() => ws.unshareSnippet("ghost")).toThrow();
		});

		it("is immutable: shareSnippet returns a new instance", () => {
			const ws = Workspace.create({ organizationId: "o", name: "S" });
			const updated = ws.shareSnippet("snip-1");
			expect(updated).not.toBe(ws);
			expect(ws.snippetIds).toEqual([]);
		});
	});

	describe("org templates", () => {
		it("adds and removes templates", () => {
			const ws = Workspace.create({ organizationId: "o", name: "S" })
				.addTemplate("tpl-1")
				.addTemplate("tpl-2");
			expect(ws.templateIds).toEqual(["tpl-1", "tpl-2"]);
			const updated = ws.removeTemplate("tpl-1");
			expect(updated.templateIds).toEqual(["tpl-2"]);
		});

		it("refuses duplicate templates", () => {
			const ws = Workspace.create({ organizationId: "o", name: "S" }).addTemplate("tpl-1");
			expect(() => ws.addTemplate("tpl-1")).toThrow();
		});

		it("refuses to remove an unknown template", () => {
			const ws = Workspace.create({ organizationId: "o", name: "S" });
			expect(() => ws.removeTemplate("ghost")).toThrow();
		});
	});

	it("renames immutably", () => {
		const ws = Workspace.create({ organizationId: "o", name: "S" });
		const renamed = ws.rename("Renamed");
		expect(renamed.name).toBe("Renamed");
		expect(ws.name).toBe("S");
	});
});
