import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
	launchHostedRenderWorker,
	runHostedRenderEntrypoint,
} from "../../server/workers/hosted-render.entrypoint";

class Signals extends EventEmitter {
	override once(event: "SIGINT" | "SIGTERM", listener: () => void): this {
		return super.once(event, listener);
	}

	override off(event: "SIGINT" | "SIGTERM", listener: () => void): this {
		return super.off(event, listener);
	}
}

describe("hosted render process entrypoint", () => {
	it.each(["SIGTERM", "SIGINT"] as const)(
		"aborts gracefully on %s and removes both signal listeners",
		async (shutdownSignal) => {
			const signals = new Signals();
			const observed: { signal?: AbortSignal } = {};
			const running = runHostedRenderEntrypoint({
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
			launchHostedRenderWorker({
				signals,
				logger: { info: () => undefined, error: (message) => errors.push(message) },
				createRuntime: () => {
					throw new Error("DATABASE_URL=do-not-log");
				},
			}),
		).resolves.toBe(1);
		expect(errors).toEqual(["Hosted render worker failed"]);
		expect(errors.join(" ")).not.toContain("do-not-log");
		expect(signals.listenerCount("SIGTERM")).toBe(0);
		expect(signals.listenerCount("SIGINT")).toBe(0);
	});
});
