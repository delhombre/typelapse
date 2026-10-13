import { type CloudAccount, cloudGate } from "@/application/billing/cloud-gate";
import { Plan } from "@/domain/value-objects/plan";
import { describe, expect, it } from "vitest";

/**
 * Where lists Cloud in every hosted build that has accounts, and the plan decides
 * only what pressing it does (ux-waves D3): a sheet to sign in, a sheet to
 * upgrade, or Cloud itself. A local build never lists it.
 */
describe("cloudGate", () => {
	const free = Plan.free();
	const creator = Plan.pro();

	it("lists nothing in a local build, whatever the account", () => {
		for (const account of ["none", "checking", "signed-out", "signed-in"] as CloudAccount[]) {
			expect(cloudGate({ hosted: false, account, plan: creator })).toBe("absent");
		}
	});

	it("lists nothing in a hosted build without accounts: there is no way in to offer", () => {
		expect(cloudGate({ hosted: true, account: "none", plan: free })).toBe("absent");
	});

	it("asks a signed-out visitor to sign in, and so while the session is still being read", () => {
		expect(cloudGate({ hosted: true, account: "signed-out", plan: free })).toBe("sign-in");
		expect(cloudGate({ hosted: true, account: "checking", plan: free })).toBe("sign-in");
	});

	it("offers Creator to a free account, which has no hosted render time", () => {
		expect(cloudGate({ hosted: true, account: "signed-in", plan: free })).toBe("upgrade");
	});

	it("opens Cloud to a plan with hosted render time", () => {
		expect(cloudGate({ hosted: true, account: "signed-in", plan: creator })).toBe("open");
		expect(cloudGate({ hosted: true, account: "signed-in", plan: Plan.team(3) })).toBe("open");
	});
});
