export type HostedCapability =
	| "auth"
	| "projectSync"
	| "privateAssets"
	| "billing"
	| "hostedRendering";

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
