import { createApp } from "../index";
import { assessHostedReadiness, type RuntimeHealth } from "./hosted-readiness";

async function main(): Promise<void> {
	const app = await createApp({ deploymentMode: "hosted" });
	const response = await app.request("http://localhost/health");
	const health = (await response.json()) as RuntimeHealth;
	const result = assessHostedReadiness(health);
	if (!result.ready) {
		console.error(`Hosted configuration incomplete: ${result.missing.join(", ")}`);
		process.exitCode = 1;
		return;
	}
	console.log("Hosted configuration ready: auth, projects, private assets, billing and rendering");
}

void main();
