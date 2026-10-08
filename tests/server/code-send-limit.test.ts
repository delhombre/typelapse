import { createCodeSendLimit } from "../../server/auth/code-send-limit";
import { describe, expect, it } from "vitest";

const HOUR = 60 * 60 * 1000;

describe("the per-address limit on sending a sign-in code", () => {
	it("allows ten codes an hour to one address, then names the wait in whole seconds", () => {
		let now = 1_000_000;
		const limit = createCodeSendLimit({ max: 10, windowMs: HOUR, now: () => now });

		for (let index = 0; index < 10; index += 1) {
			expect(limit.consume("ada@example.com")).toEqual({ allowed: true });
			now += 1000;
		}

		expect(limit.consume("ada@example.com")).toEqual({
			allowed: false,
			retryAfterSeconds: 3600 - 10,
		});
	});

	it("counts an address whatever its case or surrounding spaces", () => {
		const limit = createCodeSendLimit({ max: 1, windowMs: HOUR, now: () => 0 });

		expect(limit.consume("Ada@Example.com")).toEqual({ allowed: true });
		expect(limit.consume(" ada@example.com ").allowed).toBe(false);
	});

	it("keeps each address to its own count", () => {
		const limit = createCodeSendLimit({ max: 1, windowMs: HOUR, now: () => 0 });

		expect(limit.consume("ada@example.com").allowed).toBe(true);
		expect(limit.consume("grace@example.com").allowed).toBe(true);
	});

	it("opens again once the window has passed", () => {
		let now = 0;
		const limit = createCodeSendLimit({ max: 1, windowMs: HOUR, now: () => now });

		limit.consume("ada@example.com");
		now = HOUR - 1;
		expect(limit.consume("ada@example.com")).toEqual({ allowed: false, retryAfterSeconds: 1 });
		now = HOUR;
		expect(limit.consume("ada@example.com")).toEqual({ allowed: true });
	});

	it("forgets windows that have passed, so memory does not grow with every address ever seen", () => {
		let now = 0;
		const limit = createCodeSendLimit({ max: 1, windowMs: HOUR, now: () => now, pruneAbove: 2 });

		limit.consume("a@example.com");
		limit.consume("b@example.com");
		now = HOUR;
		limit.consume("c@example.com");

		expect(limit.size()).toBe(1);
	});
});
