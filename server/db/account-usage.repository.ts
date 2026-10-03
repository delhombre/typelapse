import { sql } from "drizzle-orm";
import type { AccountUsagePort } from "../../src/application/billing/plan-allowance";
import type { CreatorDatabase } from "./database";

interface UsageRow extends Record<string, unknown> {
	readonly cloudProjects: number | string;
	readonly mediaBytes: number | string;
	readonly hostedRenderMs: number | string;
	readonly activeRenders: number | string;
}

/**
 * Usage derived from the rows the account owns, counted the same way the
 * enforcing queries count them: media as the asset reservation sums it, minutes
 * as the render enqueue sums them.
 */
export function createAccountUsageRepository(db: CreatorDatabase): AccountUsagePort {
	return {
		async usageFor(ownerId, periodStart) {
			const result = await db.execute<UsageRow>(
				sql`SELECT
					(SELECT count(*) FROM projects WHERE owner_id = ${ownerId}) AS "cloudProjects",
					(SELECT COALESCE(SUM(a.byte_size), 0)
						FROM assets a
						INNER JOIN projects p ON p.id = a.project_id
						WHERE p.owner_id = ${ownerId} AND a.upload_status <> 'deleted') AS "mediaBytes",
					(SELECT COALESCE(SUM(duration_ms), 0)
						FROM render_jobs
						WHERE owner_id = ${ownerId}
							AND status IN ('queued', 'running', 'succeeded')
							AND created_at >= ${periodStart}) AS "hostedRenderMs",
					(SELECT count(*)
						FROM render_jobs
						WHERE owner_id = ${ownerId} AND status IN ('queued', 'running')) AS "activeRenders"`,
			);
			const row = result.rows[0];
			return {
				cloudProjects: Number(row?.cloudProjects ?? 0),
				mediaBytes: Number(row?.mediaBytes ?? 0),
				hostedRenderMsThisMonth: Number(row?.hostedRenderMs ?? 0),
				activeRenders: Number(row?.activeRenders ?? 0),
			};
		},
	};
}
