import {
	assessHostedReadiness,
	billingSettings,
	optionalHostedSettings,
} from "../../server/config/hosted-readiness";
import { describe, expect, it } from "vitest";

describe("hosted configuration readiness", () => {
	it("names every missing capability without pretending the deployment is ready", () => {
		const result = assessHostedReadiness({
			status: "ok",
			deploymentMode: "hosted",
			capabilities: {
				auth: true,
				projectSync: true,
				privateAssets: false,
				billing: false,
				hostedRendering: false,
				apiKeys: false,
				mail: false,
				localMultimediaRendering: false,
			},
		});

		expect(result).toEqual({
			ready: false,
			missing: ["privateAssets", "billing", "hostedRendering", "apiKeys", "mail"],
		});
	});

	it("is not ready without mail, even with every other capability mounted", () => {
		const result = assessHostedReadiness({
			status: "ok",
			deploymentMode: "hosted",
			capabilities: {
				auth: true,
				projectSync: true,
				privateAssets: true,
				billing: true,
				hostedRendering: true,
				apiKeys: true,
				mail: false,
				localMultimediaRendering: false,
			},
		});

		expect(result).toEqual({ ready: false, missing: ["mail"] });
	});

	it("accepts only a hosted runtime with all commercial capabilities mounted", () => {
		expect(
			assessHostedReadiness({
				status: "ok",
				deploymentMode: "hosted",
				capabilities: {
					auth: true,
					projectSync: true,
					privateAssets: true,
					billing: true,
					hostedRendering: true,
					apiKeys: true,
					mail: true,
					localMultimediaRendering: false,
				},
			}),
		).toEqual({ ready: true, missing: [] });
	});

	it("rejects a local server even if test doubles claim hosted capabilities", () => {
		const result = assessHostedReadiness({
			status: "ok",
			deploymentMode: "local",
			capabilities: {
				auth: true,
				projectSync: true,
				privateAssets: true,
				billing: true,
				hostedRendering: true,
				apiKeys: true,
				mail: true,
				localMultimediaRendering: true,
			},
		});

		expect(result.ready).toBe(false);
		expect(result.missing).toEqual(["deploymentMode"]);
	});
});

describe("optional hosted settings", () => {
	it("says what render by URL reads GitHub with when no token is set", () => {
		expect(optionalHostedSettings({})).toEqual([
			"TYPELAPSE_GITHUB_TOKEN is not set: render by URL reads GitHub without a credential, at 60 requests an hour for this server's address. Set a read-only fine-grained token limited to public repositories to raise it.",
		]);
		expect(optionalHostedSettings({ TYPELAPSE_GITHUB_TOKEN: "  " })).toHaveLength(1);
	});

	it("says it is set, and that public repositories are still the only ones read", () => {
		expect(optionalHostedSettings({ TYPELAPSE_GITHUB_TOKEN: "github_pat_x" })).toEqual([
			"TYPELAPSE_GITHUB_TOKEN is set: render by URL reads GitHub with it, and still only repositories that are public.",
		]);
	});

	it("never prints the token", () => {
		expect(optionalHostedSettings({ TYPELAPSE_GITHUB_TOKEN: "github_pat_secret" }).join("")).not.toContain(
			"github_pat_secret",
		);
	});
});

describe("billing settings", () => {
	it("names every Polar variable a deployment still has to set", () => {
		expect(billingSettings({}).missing).toEqual([
			"POLAR_ACCESS_TOKEN",
			"POLAR_WEBHOOK_SECRET",
			"POLAR_CREATOR_MONTHLY_PRODUCT_ID",
			"TYPELAPSE_APP_URL",
		]);
		expect(
			billingSettings({
				POLAR_ACCESS_TOKEN: "polar_oat_x",
				POLAR_WEBHOOK_SECRET: "whs",
				POLAR_CREATOR_MONTHLY_PRODUCT_ID: "prod_m",
				BETTER_AUTH_URL: "https://typelapse.test",
			}).missing,
		).toEqual([]);
	});

	it("treats a blank value as unset and a mistyped environment as a missing setting", () => {
		const base = {
			POLAR_ACCESS_TOKEN: "polar_oat_x",
			POLAR_WEBHOOK_SECRET: "whs",
			POLAR_CREATOR_MONTHLY_PRODUCT_ID: "prod_m",
			TYPELAPSE_APP_URL: "https://typelapse.test",
		};

		expect(billingSettings({ ...base, POLAR_ACCESS_TOKEN: "  " }).missing).toEqual([
			"POLAR_ACCESS_TOKEN",
		]);
		expect(billingSettings({ ...base, POLAR_ENVIRONMENT: "sandbx" }).missing).toEqual([
			"POLAR_ENVIRONMENT (sandbox or production)",
		]);
	});

	it("says what the annual product and the sandbox change, never a secret", () => {
		const env = {
			POLAR_ACCESS_TOKEN: "polar_oat_secret",
			POLAR_WEBHOOK_SECRET: "whs_secret",
			POLAR_CREATOR_MONTHLY_PRODUCT_ID: "prod_m",
			TYPELAPSE_APP_URL: "https://typelapse.test",
			POLAR_ENVIRONMENT: "sandbox",
		};

		const { notes } = billingSettings(env);

		expect(notes).toEqual([
			"POLAR_CREATOR_ANNUAL_PRODUCT_ID is not set: only the monthly Creator plan is sold.",
			"POLAR_ENVIRONMENT is sandbox: checkouts run against sandbox.polar.sh and no real money moves.",
		]);
		expect(notes.join("")).not.toContain("secret");
	});
});
