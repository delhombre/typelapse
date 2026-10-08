type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

export const EXIT_WHEN_IDLE_KEY = "TYPELAPSE_WORKER_EXIT_WHEN_IDLE";

/**
 * Drain mode, shared by both workers. When true, a worker exits (code 0) the
 * first time a claim finds nothing to do, instead of sleeping and polling again,
 * so it can run as a scheduled job that drains its queue. Unset means false, the
 * long-running loop. Only "true" and "false" are accepted.
 */
export function exitWhenIdleFrom(environment: RuntimeEnvironment): boolean {
	const raw = environment[EXIT_WHEN_IDLE_KEY];
	if (raw === undefined || raw === "false") {
		return false;
	}
	if (raw === "true") {
		return true;
	}
	throw new Error(`${EXIT_WHEN_IDLE_KEY} must be true or false`);
}
