import type {
	LocalAssetContent,
	LocalAssetContentInput,
	LocalProjectLibraryPort,
} from "@/application/project/local-project-library.port";
import { referencedAssetIds } from "@/application/project/multimedia-authoring";
import {
	type ProjectDocumentV2,
	parseProjectDocument,
} from "@/application/project/project-document";
import { type DBSchema, type IDBPDatabase, openDB } from "idb";

interface StoredProject {
	readonly id: string;
	readonly document: ProjectDocumentV2;
	readonly updatedAt: string;
}

interface StoredAsset {
	readonly assetId: string;
	readonly projectId: string;
	readonly mimeType: string;
	readonly byteSize: number;
	readonly blob: Blob;
}

interface StoredSetting {
	readonly key: "current-project";
	readonly value: string;
}

interface TypelapseLocalDatabase extends DBSchema {
	projects: {
		key: string;
		value: StoredProject;
	};
	assets: {
		key: string;
		value: StoredAsset;
		indexes: { "by-project": string };
	};
	settings: {
		key: StoredSetting["key"];
		value: StoredSetting;
	};
}

/** What the library knows about one stored blob, without the bytes. */
export interface StoredAssetSummary {
	readonly assetId: string;
	readonly projectId: string;
	readonly byteSize: number;
}

export interface IndexedDbLocalProjectAdapterOptions {
	readonly databaseName?: string;
}

function canonicalDocument(input: ProjectDocumentV2): ProjectDocumentV2 {
	const parsed = parseProjectDocument(input);
	if (parsed.schemaVersion !== 2) throw new Error("Local project storage requires a V2 document");
	return parsed.document;
}

function safeIdentifier(value: string, label: string): string {
	const normalized = value.trim();
	if (!normalized) throw new Error(`${label} is required`);
	return normalized;
}

/** Durable local metadata and binary storage. No data URL or object URL is persisted. */
export class IndexedDbLocalProjectAdapter implements LocalProjectLibraryPort {
	private readonly databaseName: string;
	private databasePromise: Promise<IDBPDatabase<TypelapseLocalDatabase>> | null = null;

	constructor({ databaseName = "typelapse-local-v2" }: IndexedDbLocalProjectAdapterOptions = {}) {
		this.databaseName = databaseName;
	}

	private database(): Promise<IDBPDatabase<TypelapseLocalDatabase>> {
		this.databasePromise ??= openDB<TypelapseLocalDatabase>(this.databaseName, 1, {
			upgrade(database) {
				database.createObjectStore("projects", { keyPath: "id" });
				const assets = database.createObjectStore("assets", { keyPath: "assetId" });
				assets.createIndex("by-project", "projectId");
				database.createObjectStore("settings", { keyPath: "key" });
			},
		});
		return this.databasePromise;
	}

	async loadCurrent(): Promise<ProjectDocumentV2 | null> {
		const database = await this.database();
		const setting = await database.get("settings", "current-project");
		if (!setting?.value) return null;
		const stored = await database.get("projects", setting.value);
		if (!stored) return null;
		return canonicalDocument(stored.document);
	}

	/** One local project's composition, keyed by the local project id. */
	async loadProject(projectId: string): Promise<ProjectDocumentV2 | null> {
		const id = safeIdentifier(projectId, "Project id");
		const stored = await (await this.database()).get("projects", id);
		return stored ? canonicalDocument(stored.document) : null;
	}

	/**
	 * Re-key a stored composition onto another project id, in one transaction,
	 * and return it; null when there is nothing to move. The studio used to keep
	 * one composition for every local project; this hands that draft to the
	 * project open at the first boot after the fix, once.
	 */
	async moveProject(fromId: string, toId: string): Promise<ProjectDocumentV2 | null> {
		const from = safeIdentifier(fromId, "Project id");
		const to = safeIdentifier(toId, "Project id");
		const transaction = (await this.database()).transaction("projects", "readwrite");
		const store = transaction.objectStore("projects");
		const stored = await store.get(from);
		if (!stored) {
			await transaction.done;
			return null;
		}
		const document = canonicalDocument({
			...stored.document,
			project: { ...stored.document.project, id: to },
		});
		await store.put({ id: to, document, updatedAt: new Date().toISOString() });
		if (from !== to) {
			await store.delete(from);
		}
		await transaction.done;
		return document;
	}

	async saveProject(input: ProjectDocumentV2): Promise<void> {
		const document = canonicalDocument(input);
		const transaction = (await this.database()).transaction(["projects", "settings"], "readwrite");
		await transaction.objectStore("projects").put({
			id: document.project.id,
			document,
			updatedAt: new Date().toISOString(),
		});
		await transaction.objectStore("settings").put({
			key: "current-project",
			value: document.project.id,
		});
		await transaction.done;
	}

	async loadAsset(input: {
		readonly projectId: string;
		readonly assetId: string;
	}): Promise<LocalAssetContent | null> {
		safeIdentifier(input.projectId, "Project id");
		const assetId = safeIdentifier(input.assetId, "Asset id");
		// Asset ids are minted once per import and the bytes are checked against
		// the descriptor below, so the owner tag is bookkeeping, not a gate: a
		// project file opened into another local project reads the same bytes.
		const stored = await (await this.database()).get("assets", assetId);
		if (!stored) return null;
		if (
			typeof stored.blob?.slice !== "function" ||
			stored.blob.size !== stored.byteSize ||
			stored.blob.type !== stored.mimeType
		) {
			throw new Error("Local media content no longer matches its descriptor");
		}
		return {
			assetId: stored.assetId,
			mimeType: stored.mimeType,
			byteSize: stored.byteSize,
			opaqueHandle: stored.blob,
		};
	}

	async saveAsset(input: LocalAssetContentInput): Promise<void> {
		const projectId = safeIdentifier(input.projectId, "Project id");
		const assetId = safeIdentifier(input.assetId, "Asset id");
		const mimeType = input.mimeType.trim().toLowerCase();
		if (!(input.opaqueHandle instanceof Blob)) {
			throw new Error("Local media content must be a Blob");
		}
		if (input.opaqueHandle.size !== input.byteSize) {
			throw new Error("Local media size does not match its descriptor");
		}
		if (!mimeType || input.opaqueHandle.type.toLowerCase() !== mimeType) {
			throw new Error("Local media type does not match its descriptor");
		}
		await (await this.database()).put("assets", {
			assetId,
			projectId,
			mimeType,
			byteSize: input.byteSize,
			blob: input.opaqueHandle,
		});
	}

	/** The stored blobs, all of them or those one project imported. */
	async listAssets(projectId?: string): Promise<StoredAssetSummary[]> {
		const database = await this.database();
		const stored = projectId
			? await database.getAllFromIndex(
					"assets",
					"by-project",
					safeIdentifier(projectId, "Project id"),
				)
			: await database.getAll("assets");
		return stored.map(({ assetId, projectId: owner, byteSize }) => ({
			assetId,
			projectId: owner,
			byteSize,
		}));
	}

	async deleteAsset(assetId: string): Promise<void> {
		await (await this.database()).delete("assets", safeIdentifier(assetId, "Asset id"));
	}

	/**
	 * Delete every blob that no stored project references, nor any of `keep`
	 * (the open project's live ids), and return the deleted ids. Bytes are shared
	 * by asset id across local projects, so every project is read, in the same
	 * transaction as the deletes. One unreadable project means its references are
	 * unknown, and then nothing is deleted.
	 */
	async deleteUnreferencedAssets(keep: Iterable<string> = []): Promise<string[]> {
		const transaction = (await this.database()).transaction(["projects", "assets"], "readwrite");
		const referenced = new Set(keep);
		for (const stored of await transaction.objectStore("projects").getAll()) {
			let document: ProjectDocumentV2;
			try {
				document = canonicalDocument(stored.document);
			} catch {
				transaction.abort();
				await transaction.done.catch(() => undefined);
				return [];
			}
			for (const assetId of referencedAssetIds(document)) {
				referenced.add(assetId);
			}
		}
		const assets = transaction.objectStore("assets");
		const deleted: string[] = [];
		for (const assetId of await assets.getAllKeys()) {
			if (!referenced.has(assetId)) {
				deleted.push(assetId);
				await assets.delete(assetId);
			}
		}
		await transaction.done;
		return deleted;
	}

	async destroy(): Promise<void> {
		const database = await this.database();
		database.close();
		this.databasePromise = null;
		await new Promise<void>((resolve, reject) => {
			const request = indexedDB.deleteDatabase(this.databaseName);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error ?? new Error("Could not delete local database"));
			request.onblocked = () => reject(new Error("Could not close local database"));
		});
	}
}
