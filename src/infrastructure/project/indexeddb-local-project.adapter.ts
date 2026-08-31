import type {
	LocalAssetContent,
	LocalAssetContentInput,
	LocalProjectLibraryPort,
} from "@/application/project/local-project-library.port";
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
		const projectId = safeIdentifier(input.projectId, "Project id");
		const assetId = safeIdentifier(input.assetId, "Asset id");
		const stored = await (await this.database()).get("assets", assetId);
		if (!stored || stored.projectId !== projectId) return null;
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
