import { type SQL, sql } from "drizzle-orm";

/**
 * Hosted render milliseconds an account has spent since `periodStart`, read from
 * the usage ledger. The enqueue that enforces the ceiling and the allowance that
 * shows it read this one statement, so what is shown is what is enforced, and a
 * deleted project's jobs are still in it.
 */
export function hostedRenderMsSince(ownerId: string, periodStart: Date): SQL {
	return sql`(SELECT COALESCE(SUM(duration_ms), 0)
		FROM render_usage
		WHERE owner_id = ${ownerId}
			AND released_at IS NULL
			AND accepted_at >= ${periodStart})`;
}

/**
 * Renders in flight for an account: the jobs still queued or running, each
 * holding a slot of the concurrent-renders ceiling. Enforcement and the
 * allowance count them with this one statement; the delete of a project asks the
 * same question of one project's jobs with `isActiveRenderStatus`.
 */
export function activeRendersOf(ownerId: string): SQL {
	return sql`(SELECT count(*)
		FROM render_jobs
		WHERE owner_id = ${ownerId} AND status IN ('queued', 'running'))`;
}
