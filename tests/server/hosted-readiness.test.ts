import { assessHostedReadiness } from "../../server/config/hosted-readiness";
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
				localMultimediaRendering: false,
			},
		});

		expect(result).toEqual({
			ready: false,
			missing: ["privateAssets", "billing", "hostedRendering"],
		});
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
				localMultimediaRendering: true,
			},
		});

		expect(result.ready).toBe(false);
		expect(result.missing).toEqual(["deploymentMode"]);
	});
});
