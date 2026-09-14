import { createHash } from "node:crypto";
import { createHostedRenderJobService, type HostedRenderJobService } from "../../src/application/render/hosted-render-job";
import type { CreatorDatabase } from "../db/database";
import { createProjectDocumentRepository } from "../db/project-document.repository";
import {
	createRenderAssetReadiness,
	createRenderJobRepository,
} from "../db/render-job.repository";

export function hostedRenderJobServiceFromEnv(input: {
	readonly db: CreatorDatabase;
	readonly env?: Readonly<Record<string, string | undefined>>;
}): HostedRenderJobService | null {
	const env = input.env ?? process.env;
	const compilerVersion = env.TYPELAPSE_COMPILER_VERSION;
	if (!compilerVersion) {
		return null;
	}
	return createHostedRenderJobService({
		projects: createProjectDocumentRepository(input.db),
		assets: createRenderAssetReadiness(input.db),
		jobs: createRenderJobRepository(input.db),
		compilerVersion,
		hashOptions: (value) => createHash("sha256").update(value).digest("hex"),
	});
}
