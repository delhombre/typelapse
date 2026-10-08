import { createApp } from "../index";
import {
	assessHostedReadiness,
	billingSettings,
	mailSettings,
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
		const mail = mailSettings(process.env);
		if (result.missing.includes("mail") && mail.length > 0) {
			console.error(`Mail (SMTP) needs: ${mail.join(", ")}`);
		}
		const billing = billingSettings(process.env);
		if (result.missing.includes("billing") && billing.missing.length > 0) {
			console.error(`Billing (Polar) needs: ${billing.missing.join(", ")}`);
		}
	} else {
		console.log(
			"Hosted configuration ready: auth, mail, projects, private assets, billing, rendering and API keys",
		);
	}
	// Said either way, and never a reason to fail: the operator fixing the rest sees them too.
	for (const line of [...optionalHostedSettings(process.env), ...billingSettings(process.env).notes]) {
		console.log(`Optional: ${line}`);
	}
	if (!result.ready) {
		process.exitCode = 1;
	}
}

void main();
