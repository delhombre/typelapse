export type DeploymentMode = "local" | "hosted";

interface DeploymentModeEnvironment {
	readonly TYPELAPSE_DEPLOYMENT_MODE?: string;
}

/**
 * Resolve how this server is deployed.
 *
 * No value keeps the existing OSS/dev behavior. Any configured value must be
 * exact: a typo must stop startup instead of silently exposing local compute.
 */
export function deploymentModeFrom(
	environment: DeploymentModeEnvironment = process.env,
): DeploymentMode {
	const configured = environment.TYPELAPSE_DEPLOYMENT_MODE;
	if (configured === undefined) {
		return "local";
	}
	if (configured === "local" || configured === "hosted") {
		return configured;
	}
	throw new Error('TYPELAPSE_DEPLOYMENT_MODE must be either "local" or "hosted"');
}
