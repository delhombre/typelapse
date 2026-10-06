import { describe, expect, it } from "vitest";
import { billingNotice } from "../../src/application/billing/billing-notice";

const SINCE = new Date("2026-10-06T10:00:00.000Z");
const DAY_MS = 24 * 60 * 60_000;
const within = new Date(SINCE.getTime() + 3 * DAY_MS);
const after = new Date(SINCE.getTime() + 31 * DAY_MS);

describe("the account's billing notice", () => {
	it("says nothing to a Creator, to a free account that never subscribed, or to one still in checkout", () => {
		expect(
			billingNotice({ tier: "creator", status: "active", since: SINCE, now: within }),
		).toBeNull();
		expect(billingNotice({ tier: "free", status: "none", since: null, now: within })).toBeNull();
		expect(
			billingNotice({ tier: "free", status: "incomplete", since: SINCE, now: within }),
		).toBeNull();
		expect(
			billingNotice({ tier: "free", status: "incomplete_expired", since: SINCE, now: within }),
		).toBeNull();
	});

	it("tells a past due account why Creator is paused, what fixes it and until when renders stay", () => {
		expect(billingNotice({ tier: "free", status: "past_due", since: SINCE, now: within })).toEqual({
			kind: "past-due",
			sentence:
				"Your last payment failed and Creator is paused; update your card in Manage billing, and past renders stay downloadable until 5 November 2026.",
		});
	});

	it("drops the grace clause once the 30 days are over, the payment still being the thing to fix", () => {
		expect(billingNotice({ tier: "free", status: "past_due", since: SINCE, now: after })).toEqual({
			kind: "past-due",
			sentence:
				"Your last payment failed and Creator is paused; update your card in Manage billing.",
		});
	});

	it("treats unpaid like past due", () => {
		expect(billingNotice({ tier: "free", status: "unpaid", since: SINCE, now: within })?.kind).toBe(
			"past-due",
		);
	});

	it("tells an account whose plan ended how long its past renders stay downloadable", () => {
		expect(billingNotice({ tier: "free", status: "canceled", since: SINCE, now: within })).toEqual({
			kind: "ended",
			sentence:
				"Your Creator plan has ended; past renders stay downloadable until 5 November 2026.",
		});
	});

	it("has nothing to add once an ended plan's grace is over", () => {
		expect(
			billingNotice({ tier: "free", status: "canceled", since: SINCE, now: after }),
		).toBeNull();
	});
});
