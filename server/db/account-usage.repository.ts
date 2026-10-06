import { sql } from "drizzle-orm";
import type { AccountUsagePort } from "../../src/application/billing/plan-allowance";
import type { CreatorDatabase } from "./database";
import { regularProjectsOf } from "./project-document.repository";
import { activeRendersOf, hostedRenderMsSince } from "./render-usage";

interface UsageRow extends Record<string, unknown> {
	readonly cloudProjects: number | string;
	readonly mediaBytes: number | string;
	readonly hostedRenderMs: number | string;
	readonly activeRenders: number | string;
}

/**
 * Usage derived from the rows the account owns, counted the same way the
 * enforcing queries count them: projects as the ceiling counts them (regular
 * ones only), media as the asset reservation sums it, minutes as the render
 * enqueue sums them: from the usage ledger, which a project's delete does not
 * touch. Renders in flight come from the jobs, since a project with one cannot
 * be deleted.
 */
export function createAccountUsageRepository(db: CreatorDatabase): AccountUsagePort {
	return {
		async usageFor(ownerId, periodStart) {
			const result = await db.execute<UsageRow>(
				sql`SELECT
					(SELECT count(*) FROM projects WHERE ${regularProjectsOf(ownerId)}) AS "cloudProjects",
					(SELECT COALESCE(SUM(a.byte_size), 0)
						FROM assets a
						INNER JOIN projects p ON p.id = a.project_id
						WHERE p.owner_id = ${ownerId} AND a.upload_status <> 'deleted') AS "mediaBytes",
					${hostedRenderMsSince(ownerId, periodStart)} AS "hostedRenderMs",
					${activeRendersOf(ownerId)} AS "activeRenders"`,
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
