import type { EncodedProjectHistory } from "@/application/project/project-history";
import type { ProjectHistoryStorePort } from "@/application/project/project-history-store.port";
import { type DBSchema, type IDBPDatabase, openDB } from "idb";

interface ProjectHistoryDatabase extends DBSchema {
	histories: {
		key: string;
		value: EncodedProjectHistory;
	};
}

/**
 * The project histories, one record per local project id, in their own
 * database: a history is disposable, and dropping it must never touch the
 * projects or their media.
 */
export class IndexedDbProjectHistoryAdapter implements ProjectHistoryStorePort {
	private readonly databaseName: string;
	private databasePromise: Promise<IDBPDatabase<ProjectHistoryDatabase>> | null = null;

	constructor({ databaseName = "typelapse-project-history" }: { databaseName?: string } = {}) {
		this.databaseName = databaseName;
	}

	private database(): Promise<IDBPDatabase<ProjectHistoryDatabase>> {
		this.databasePromise ??= openDB<ProjectHistoryDatabase>(this.databaseName, 1, {
			upgrade(database) {
				database.createObjectStore("histories", { keyPath: "projectId" });
			},
		});
		return this.databasePromise;
	}

	async load(projectId: string): Promise<unknown> {
		return (await (await this.database()).get("histories", projectId)) ?? null;
	}

	async save(history: EncodedProjectHistory): Promise<void> {
		await (await this.database()).put("histories", history);
	}

	/** Test cleanup: close and delete the database. */
	async destroy(): Promise<void> {
		const database = await this.database();
		database.close();
		this.databasePromise = null;
		await new Promise<void>((resolve, reject) => {
			const request = indexedDB.deleteDatabase(this.databaseName);
			request.onsuccess = () => resolve();
			request.onerror = () =>
				reject(request.error ?? new Error("Could not delete history database"));
		});
	}
}
