import { createCodeSendCeilings, createCodeSendLimit } from "../../server/auth/code-send-limit";
import { describe, expect, it } from "vitest";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("one fixed-window limit", () => {
	it("allows max per window, then names the wait in whole seconds, counting only what it records", () => {
		let now = 1_000_000;
		const limit = createCodeSendLimit({ max: 2, windowMs: HOUR, now: () => now });

		expect(limit.check("a")).toEqual({ allowed: true });
		limit.record("a");
		now += 10_000;
		limit.record("a");

		expect(limit.check("a")).toEqual({ allowed: false, retryAfterSeconds: 3590 });
		expect(limit.check("a")).toEqual({ allowed: false, retryAfterSeconds: 3590 });
		now = 1_000_000 + HOUR - 1;
		expect(limit.check("a")).toEqual({ allowed: false, retryAfterSeconds: 1 });
		now = 1_000_000 + HOUR;
		expect(limit.check("a")).toEqual({ allowed: true });
	});

	it("drops every window that has passed on each write, so memory holds one window of keys", () => {
		let now = 0;
		const limit = createCodeSendLimit({ max: 1, windowMs: HOUR, now: () => now });

		limit.record("a");
		now = 10;
		limit.record("b");
		now = HOUR + 5;
		limit.record("c");
		expect(limit.size()).toBe(2);
		now = HOUR + 20;
		limit.record("d");

		expect(limit.size()).toBe(2);
	});

	it("keeps a key that opens a new window, and still drops the older ones before it", () => {
		let now = 0;
		const limit = createCodeSendLimit({ max: 1, windowMs: HOUR, now: () => now });

		limit.record("a");
		now = 10;
		limit.record("b");
		now = HOUR;
		limit.record("a");
		now = HOUR + 10;
		limit.record("c");

		expect(limit.size()).toBe(2);
		expect(limit.check("a").allowed).toBe(false);
	});
});

describe("the ceilings on sending a sign-in code", () => {
	it("allows ten codes an hour to one address, then names the wait and the ceiling", () => {
		let now = 1_000_000;
		const ceilings = createCodeSendCeilings({ now: () => now });

		for (let index = 0; index < 10; index += 1) {
			expect(ceilings.consume("ada@example.com")).toEqual({
				allowed: true,
			});
			now += 1000;
		}

		expect(ceilings.consume("ada@example.com")).toEqual({
			allowed: false,
			retryAfterSeconds: 3600 - 10,
			ceiling: "address",
		});
		expect(ceilings.consume("grace@example.com")).toEqual({ allowed: true });
	});

	it("allows twenty codes a day to one address, however they are spread over the hours", () => {
		let now = 0;
		const ceilings = createCodeSendCeilings({ now: () => now });

		for (let hour = 0; hour < 2; hour += 1) {
			now = hour * HOUR;
			for (let index = 0; index < 10; index += 1) {
				expect(ceilings.consume("ada@example.com").allowed).toBe(true);
			}
		}
		now = 2 * HOUR;

		expect(ceilings.consume("ada@example.com")).toEqual({
			allowed: false,
			retryAfterSeconds: (DAY - 2 * HOUR) / 1000,
			ceiling: "address",
		});
		now = DAY;
		expect(ceilings.consume("ada@example.com")).toEqual({ allowed: true });
	});

	it("allows this instance two hundred codes an hour, whatever the addresses", () => {
		let now = 0;
		const ceilings = createCodeSendCeilings({ now: () => now });

		for (let index = 0; index < 200; index += 1) {
			expect(ceilings.consume(`person${index}@example.com`).allowed).toBe(true);
		}
		now = 30 * 60 * 1000;

		expect(ceilings.consume("someone@example.com")).toEqual({
			allowed: false,
			retryAfterSeconds: 30 * 60,
			ceiling: "instance",
		});
		now = HOUR;
		expect(ceilings.consume("someone@example.com")).toEqual({ allowed: true });
	});

	it("spends nothing on a refused send", () => {
		let now = 0;
		const ceilings = createCodeSendCeilings({ now: () => now });
		for (let index = 0; index < 10; index += 1) {
			ceilings.consume("ada@example.com");
		}
		// Refused by the hour: the day must not count these.
		for (let index = 0; index < 50; index += 1) {
			expect(ceilings.consume("ada@example.com").allowed).toBe(false);
		}
		now = HOUR;

		for (let index = 0; index < 10; index += 1) {
			expect(ceilings.consume("ada@example.com").allowed).toBe(true);
		}
	});

	it("holds no more addresses than were seen within the last day", () => {
		let now = 0;
		const ceilings = createCodeSendCeilings({ now: () => now });
		for (let index = 0; index < 50; index += 1) {
			ceilings.consume(`person${index}@example.com`);
		}
		now = DAY;
		ceilings.consume("late@example.com");

		expect(ceilings.addressesHeld()).toBe(1);
	});
});
