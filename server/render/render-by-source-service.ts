import { createHash } from "node:crypto";
import type { ProjectDocumentRepositoryPort } from "../../src/application/project/project-document-repository.port";
import type { HostedRenderJobService } from "../../src/application/render/hosted-render-job";
import {
	createRenderBySourceService,
	type RenderBySourceService,
} from "../../src/application/render/render-by-source";
import { fetchCommitDiff, fetchPrWalkthrough } from "../../src/infrastructure/import/pr-import";
import { fetchReleaseChapters } from "../../src/infrastructure/import/release-import";
import { createAccountUsageRepository } from "../db/account-usage.repository";
import type { CreatorDatabase } from "../db/database";

/**
 * Render by URL on this server: the studio's own GitHub importers, the account's
 * projects and the render queue the Cloud choice already uses.
 *
 * Nothing sent to GitHub carries a credential, here or anywhere in the importers,
 * so what they read is what anyone can read: a private repository answers 404
 * and is refused as such. A token on this server would change that, whoever's
 * repositories it could see, so none is read. The cost is GitHub's anonymous
 * rate limit, 60 requests an hour for this server's address, which a release of
 * thirty commits spends half of.
 */
export function renderBySourceServiceFor(input: {
	readonly db: CreatorDatabase;
	readonly projects: ProjectDocumentRepositoryPort;
	readonly jobs: HostedRenderJobService;
}): RenderBySourceService {
	return createRenderBySourceService({
		projects: input.projects,
		jobs: input.jobs,
		usage: createAccountUsageRepository(input.db),
		fetchers: {
			fetchPr: fetchPrWalkthrough,
			fetchCommit: fetchCommitDiff,
			fetchRelease: fetchReleaseChapters,
		},
		hash: (value) => createHash("sha256").update(value).digest("hex"),
	});
}
