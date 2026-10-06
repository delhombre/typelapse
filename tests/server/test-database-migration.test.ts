// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { migrateTestDatabase } from "../global-setup";

describe("migrating the contract test database", () => {
	it("does nothing, and never opens a connection, when no database is named", async () => {
		const open = vi.fn();

		await migrateTestDatabase(undefined, open);
		await migrateTestDatabase("   ", open);

		expect(open).not.toHaveBeenCalled();
	});

	it("applies the migrations once on the named database and closes its pool", async () => {
		const calls: string[] = [];
		const open = vi.fn((url: string) => {
			calls.push(`open ${url}`);
			return {
				migrate: async () => void calls.push("migrate"),
				close: async () => void calls.push("close"),
			};
		});

		await migrateTestDatabase("postgres://example/db", open);

		expect(calls).toEqual(["open postgres://example/db", "migrate", "close"]);
	});

	it("closes the pool even when a migration fails", async () => {
		const close = vi.fn(async () => undefined);
		const open = () => ({
			migrate: async () => {
				throw new Error("boom");
			},
			close,
		});

		await expect(migrateTestDatabase("postgres://example/db", open)).rejects.toThrow("boom");
		expect(close).toHaveBeenCalledOnce();
	});
});
