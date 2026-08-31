import { BrowserHostedProjectReferenceStore } from "@/infrastructure/project/browser-hosted-project-reference";
import { describe, expect, it, vi } from "vitest";

describe("BrowserHostedProjectReferenceStore", () => {
	it("stores only the current hosted id under an account-scoped key", () => {
		const storage = { getItem: vi.fn(() => " project-7 "), setItem: vi.fn() };
		const references = new BrowserHostedProjectReferenceStore(storage);

		expect(references.load("account@example.test")).toBe("project-7");
		references.save("account@example.test", "project-8");

		expect(storage.getItem).toHaveBeenCalledWith("typelapse:hosted-project:account%40example.test");
		expect(storage.setItem).toHaveBeenCalledWith(
			"typelapse:hosted-project:account%40example.test",
			"project-8",
		);
	});

	it("fails closed when browser storage is unavailable", () => {
		const references = new BrowserHostedProjectReferenceStore({
			getItem: () => {
				throw new Error("blocked");
			},
			setItem: () => {
				throw new Error("blocked");
			},
		});

		expect(references.load("account-1")).toBeNull();
		expect(() => references.save("account-1", "project-1")).not.toThrow();
	});
});
