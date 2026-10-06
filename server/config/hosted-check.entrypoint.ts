import { createApp } from "../index";
import {
	assessHostedReadiness,
	optionalHostedSettings,
	type RuntimeHealth,
} from "./hosted-readiness";

async function main(): Promise<void> {
	const app = await createApp({ deploymentMode: "hosted" });
	const response = await app.request("http://localhost/health");
	const health = (await response.json()) as RuntimeHealth;
	const result = assessHostedReadiness(health);
	if (!result.ready) {
		console.error(`Hosted configuration incomplete: ${result.missing.join(", ")}`);
	} else {
		console.log(
			"Hosted configuration ready: auth, projects, private assets, billing, rendering and API keys",
		);
	}
	// Said either way, and never a reason to fail: the operator fixing the rest sees them too.
	for (const line of optionalHostedSettings(process.env)) {
		console.log(`Optional: ${line}`);
	}
	if (!result.ready) {
		process.exitCode = 1;
	}
}

void main();
