export type HostedCapability =
	| "auth"
	| "projectSync"
	| "privateAssets"
	| "billing"
	| "hostedRendering"
	| "apiKeys"
	| "mail";

export interface RuntimeHealth {
	readonly status: "ok";
	readonly deploymentMode: "local" | "hosted";
	readonly capabilities: Readonly<Record<HostedCapability | "localMultimediaRendering", boolean>>;
}

export interface HostedReadiness {
	readonly ready: boolean;
	readonly missing: readonly (HostedCapability | "deploymentMode")[];
}

const REQUIRED_CAPABILITIES: readonly HostedCapability[] = [
	"auth",
	"projectSync",
	"privateAssets",
	"billing",
	"hostedRendering",
	"apiKeys",
	"mail",
];

/** Pure deployment gate used by CI and the operator-facing CLI. */
export function assessHostedReadiness(health: RuntimeHealth): HostedReadiness {
	if (health.deploymentMode !== "hosted") {
		return { ready: false, missing: ["deploymentMode"] };
	}
	const missing = REQUIRED_CAPABILITIES.filter(
		(capability) => !health.capabilities[capability],
	);
	return { ready: missing.length === 0, missing };
}

/**
 * Settings a deployment may leave out, said back to the operator beside the
 * verdict: what is set, and what that changes. Never a reason to fail the check,
 * and never the value of a secret.
 */
export function optionalHostedSettings(env: Readonly<Record<string, string | undefined>>): string[] {
	return env.TYPELAPSE_GITHUB_TOKEN?.trim()
		? [
				"TYPELAPSE_GITHUB_TOKEN is set: render by URL reads GitHub with it, and still only repositories that are public.",
			]
		: [
				"TYPELAPSE_GITHUB_TOKEN is not set: render by URL reads GitHub without a credential, at 60 requests an hour for this server's address. Set a read-only fine-grained token limited to public repositories to raise it.",
			];
}

const MAIL_VARIABLES = ["SMTP_URL", "MAIL_FROM"] as const;

/**
 * What the mail capability reads from the environment, by name and never by
 * value. Without mail no code leaves, so nobody signs in, and auth and everything
 * behind it reads as missing too: this line names the cause.
 */
export function mailSettings(env: Readonly<Record<string, string | undefined>>): string[] {
	return MAIL_VARIABLES.filter((name) => !env[name]?.trim());
}

const BILLING_VARIABLES = [
	"POLAR_ACCESS_TOKEN",
	"POLAR_WEBHOOK_SECRET",
	"POLAR_CREATOR_MONTHLY_PRODUCT_ID",
] as const;

/**
 * What the billing capability reads from the environment, said by name so the
 * operator is not left guessing why `billing` is missing. Names only, never a value.
 */
export function billingSettings(env: Readonly<Record<string, string | undefined>>): {
	readonly missing: string[];
	readonly notes: string[];
} {
	const isSet = (name: string) => Boolean(env[name]?.trim());
	const missing: string[] = BILLING_VARIABLES.filter((name) => !isSet(name));
	if (!isSet("TYPELAPSE_APP_URL") && !isSet("BETTER_AUTH_URL")) {
		missing.push("TYPELAPSE_APP_URL");
	}
	const environment = env.POLAR_ENVIRONMENT?.trim().toLowerCase();
	if (environment && environment !== "sandbox" && environment !== "production") {
		missing.push("POLAR_ENVIRONMENT (sandbox or production)");
	}
	const notes: string[] = [];
	if (!isSet("POLAR_CREATOR_ANNUAL_PRODUCT_ID")) {
		notes.push("POLAR_CREATOR_ANNUAL_PRODUCT_ID is not set: only the monthly Creator plan is sold.");
	}
	if (environment === "sandbox") {
		notes.push(
			"POLAR_ENVIRONMENT is sandbox: checkouts run against sandbox.polar.sh and no real money moves.",
		);
	}
	return { missing, notes };
}
