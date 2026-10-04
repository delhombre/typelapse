import { type CaptureRecord, sortCaptures } from "@/application/captures/capture-record";

const DATABASE_NAME = "typelapse-captures";
const STORE_NAME = "captures";
const DATABASE_VERSION = 1;

export const CAPTURES_CHANGED_EVENT = "typelapse:captures-changed";

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
	});
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		transaction.oncomplete = () => resolve();
		transaction.onerror = () =>
			reject(transaction.error ?? new Error("IndexedDB transaction failed"));
		transaction.onabort = () =>
			reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
	});
}

/**
 * Device-local output library. Blobs live in IndexedDB rather than localStorage
 * (which is both synchronous and far too small). A count and byte ceiling keep
 * a useful history without quietly filling the device with duplicate exports.
 */
export class BrowserCaptureLibrary {
	static readonly MAX_CAPTURE_BYTES = 150 * 1024 * 1024;
	static readonly MAX_CAPTURE_COUNT = 24;

	private databasePromise: Promise<IDBDatabase | null> | null = null;

	async list(): Promise<CaptureRecord[]> {
		const database = await this.database();
		if (!database) {
			return [];
		}
		try {
			const transaction = database.transaction(STORE_NAME, "readonly");
			const records = await requestResult(
				transaction.objectStore(STORE_NAME).getAll() as IDBRequest<CaptureRecord[]>,
			);
			await transactionDone(transaction);
			return sortCaptures(records);
		} catch {
			return [];
		}
	}

	async add(capture: CaptureRecord): Promise<boolean> {
		if (capture.bytes > BrowserCaptureLibrary.MAX_CAPTURE_BYTES) {
			return false;
		}
		const database = await this.database();
		if (!database) {
			return false;
		}
		try {
			const existing = await this.list();
			let retainedBytes = existing.reduce((sum, record) => sum + record.bytes, 0);
			const oldestFirst = [...existing].sort((a, b) => a.createdAt - b.createdAt);
			while (
				oldestFirst.length >= BrowserCaptureLibrary.MAX_CAPTURE_COUNT ||
				retainedBytes + capture.bytes > BrowserCaptureLibrary.MAX_CAPTURE_BYTES
			) {
				const oldest = oldestFirst.shift();
				if (!oldest) {
					break;
				}
				await this.deleteFrom(database, oldest.id);
				retainedBytes -= oldest.bytes;
			}

			const transaction = database.transaction(STORE_NAME, "readwrite");
			transaction.objectStore(STORE_NAME).put(capture);
			await transactionDone(transaction);
			window.dispatchEvent(new Event(CAPTURES_CHANGED_EVENT));
			return true;
		} catch {
			return false;
		}
	}

	async remove(id: string): Promise<boolean> {
		const database = await this.database();
		if (!database) {
			return false;
		}
		try {
			await this.deleteFrom(database, id);
			window.dispatchEvent(new Event(CAPTURES_CHANGED_EVENT));
			return true;
		} catch {
			return false;
		}
	}

	subscribe(listener: () => void): () => void {
		window.addEventListener(CAPTURES_CHANGED_EVENT, listener);
		return () => window.removeEventListener(CAPTURES_CHANGED_EVENT, listener);
	}

	private async deleteFrom(database: IDBDatabase, id: string): Promise<void> {
		const transaction = database.transaction(STORE_NAME, "readwrite");
		transaction.objectStore(STORE_NAME).delete(id);
		await transactionDone(transaction);
	}

	private database(): Promise<IDBDatabase | null> {
		if (this.databasePromise) {
			return this.databasePromise;
		}
		this.databasePromise = new Promise((resolve) => {
			if (typeof indexedDB === "undefined") {
				resolve(null);
				return;
			}
			try {
				const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
				request.onupgradeneeded = () => {
					const database = request.result;
					if (!database.objectStoreNames.contains(STORE_NAME)) {
						const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
						store.createIndex("createdAt", "createdAt");
					}
				};
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => resolve(null);
				request.onblocked = () => resolve(null);
			} catch {
				resolve(null);
			}
		});
		return this.databasePromise;
	}
}

export const browserCaptureLibrary = new BrowserCaptureLibrary();
