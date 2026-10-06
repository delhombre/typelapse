import { createHash } from "node:crypto";
import type { ProjectDocumentRepositoryPort } from "../../src/application/project/project-document-repository.port";
import type { HostedRenderJobService } from "../../src/application/render/hosted-render-job";
import {
	createRenderBySourceService,
	type RenderBySourceService,
} from "../../src/application/render/render-by-source";
import { createGitHubFetchers } from "../../src/infrastructure/import/github-fetchers";
import { createAccountUsageRepository } from "../db/account-usage.repository";
import type { CreatorDatabase } from "../db/database";

/** One source's reads, from the first request to the last: a release of thirty commits fits. */
export const SOURCE_READ_BUDGET_MS = 30_000;

/**
 * Render by URL on this server: the studio's own GitHub importers, the account's
 * projects and the render queue the Cloud choice already uses.
 *
 * Without a token nothing sent to GitHub carries a credential, so what is read
 * is what anyone can read: a private repository answers 404 and is refused as
 * such, at GitHub's anonymous limit of 60 requests an hour for this server's
 * address, which a release of thirty commits spends half of. With a token
 * (`TYPELAPSE_GITHUB_TOKEN`, meant to be fine-grained and limited to public
 * repositories) the limit is the token's, and "public repositories only" is
 * still ours to keep: the readers check that a repository says it is public
 * before the token reads any of it, so a token set too wide changes nothing.
 * Each source is read inside a budget, so a slow GitHub refuses the request
 * instead of holding its connection.
 */
export function renderBySourceServiceFor(input: {
	readonly db: CreatorDatabase;
	readonly projects: ProjectDocumentRepositoryPort;
	readonly jobs: HostedRenderJobService;
	/** Read-only; empty is none. */
	readonly githubToken?: string;
	readonly readBudgetMs?: number;
}): RenderBySourceService {
	const token = input.githubToken?.trim();
	return createRenderBySourceService({
		projects: input.projects,
		jobs: input.jobs,
		usage: createAccountUsageRepository(input.db),
		fetchers: createGitHubFetchers(token ? { token } : {}),
		readBudgetMs: input.readBudgetMs ?? SOURCE_READ_BUDGET_MS,
		hash: (value) => createHash("sha256").update(value).digest("hex"),
	});
}
