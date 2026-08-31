import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
	launchObjectDeletionWorker,
	runObjectDeletionEntrypoint,
} from "../../server/workers/object-deletion.entrypoint";

class Signals extends EventEmitter {
	override once(event: "SIGINT" | "SIGTERM", listener: () => void): this {
		return super.once(event, listener);
	}

	override off(event: "SIGINT" | "SIGTERM", listener: () => void): this {
		return super.off(event, listener);
	}
}

describe("object deletion process entrypoint", () => {
	it.each(["SIGTERM", "SIGINT"] as const)(
		"aborts gracefully on %s and removes both signal listeners",
		async (shutdownSignal) => {
			const signals = new Signals();
			const observed: { signal?: AbortSignal } = {};
			const running = runObjectDeletionEntrypoint({
				signals,
				logger: { info: vi.fn(), error: vi.fn() },
				createRuntime: () => ({
					run: async (signal) => {
						observed.signal = signal;
						await new Promise<void>((resolve) =>
							signal.addEventListener("abort", () => resolve(), { once: true }),
						);
					},
				}),
			});

			expect(signals.listenerCount("SIGTERM")).toBe(1);
			expect(signals.listenerCount("SIGINT")).toBe(1);
			signals.emit(shutdownSignal);
			await running;

			expect(observed.signal?.aborted).toBe(true);
			expect(signals.listenerCount("SIGTERM")).toBe(0);
			expect(signals.listenerCount("SIGINT")).toBe(0);
		},
	);

	it("fails closed with one generic process log and no secret error text", async () => {
		const errors: string[] = [];
		const signals = new Signals();

		await expect(
			launchObjectDeletionWorker({
				signals,
				logger: { info: () => undefined, error: (message) => errors.push(message) },
				createRuntime: () => {
					throw new Error("R2_SECRET_ACCESS_KEY=do-not-log");
				},
			}),
		).resolves.toBe(1);
		expect(errors).toEqual(["Object deletion worker failed"]);
		expect(errors.join(" ")).not.toContain("do-not-log");
		expect(signals.listenerCount("SIGTERM")).toBe(0);
		expect(signals.listenerCount("SIGINT")).toBe(0);
	});
});
