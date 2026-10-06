export type HostedCapability =
	| "auth"
	| "projectSync"
	| "privateAssets"
	| "billing"
	| "hostedRendering"
	| "apiKeys";

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
