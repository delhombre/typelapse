import type { EncodedProjectHistory } from "./project-history";

/**
 * Where a local project's history is kept between visits, keyed by the local
 * project id. `load` returns what was stored, unvalidated: the history module
 * decides whether it can be trusted.
 */
export interface ProjectHistoryStorePort {
	load(projectId: string): Promise<unknown>;
	save(history: EncodedProjectHistory): Promise<void>;
}
