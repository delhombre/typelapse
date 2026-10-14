import { type CloudAccount, cloudGate } from "@/application/billing/cloud-gate";
import {
	CLOUD_HASH,
	CLOUD_INTENT_PATH,
	cloudIntentAction,
	cloudIntentFrom,
} from "@/application/billing/cloud-intent";
import { Plan } from "@/domain/value-objects/plan";
import { describe, expect, it } from "vitest";

/** What a hosted build does for each account, so the cases read as people. */
function actionFor(account: CloudAccount, plan: Plan, planKnown = true) {
	const gate = cloudGate({ hosted: true, account, plan, planKnown });
	return cloudIntentAction({ gate, account });
}

describe("cloudIntentFrom", () => {
	it("reads the one hash that means Cloud", () => {
		expect(cloudIntentFrom(CLOUD_HASH)).toBe("cloud");
		expect(cloudIntentFrom("#cloud")).toBe("cloud");
	});

	it("leaves every other hash to the readers that own it", () => {
		for (const hash of ["", "#", "#clouds", "#Cloud", "#cloud=1", "#import=abc", "#share=abc"]) {
			expect(cloudIntentFrom(hash)).toBeNull();
		}
	});

	it("is the hash the pricing page links to", () => {
		expect(CLOUD_INTENT_PATH).toBe("/app#cloud");
	});
});

describe("cloudIntentAction", () => {
	it("signed out: opens the sheet, which shows the gains and Sign in", () => {
		expect(actionFor("signed-out", Plan.free())).toBe("open-sheet");
	});

	it("Free: opens the sheet, which shows the allowance and one Upgrade", () => {
		expect(actionFor("signed-in", Plan.free())).toBe("open-sheet");
	});

	it("Creator: chooses Cloud and opens nothing", () => {
		expect(actionFor("signed-in", Plan.pro())).toBe("choose-cloud");
	});

	it("waits while a signed-in account's plan is not read: Free is only a default", () => {
		expect(actionFor("signed-in", Plan.free(), false)).toBe("wait");
	});

	it("waits while the session is read, so a Creator never sees the signed-out offer", () => {
		expect(actionFor("checking", Plan.free())).toBe("wait");
	});

	it("does nothing where there is no Cloud to open: a local build, or a hosted one with no accounts", () => {
		const local = cloudGate({ hosted: false, account: "none", plan: Plan.free(), planKnown: true });
		expect(cloudIntentAction({ gate: local, account: "none" })).toBe("none");
		expect(actionFor("none", Plan.free())).toBe("none");
	});
});
