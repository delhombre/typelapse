import {
	type ImportLocalMediaOptions,
	type ImportLocalMediaResult,
	createImportLocalMedia,
} from "../../application/assets/import-local-media";
import {
	type PrivateMediaFile,
	type PrivateMediaMetadataPort,
	type PrivateMediaSha256Port,
	PrivateMediaUploadError,
} from "../../application/assets/private-media-upload.port";
import type {
	LocalSceneAssetSourceFactoryPort,
	SceneAssetSourceLease,
	SceneAssetSourceRegistryPort,
} from "../../application/assets/scene-asset-source.port";
import { BrowserFileSha256Adapter, privateMediaFileFromBrowser } from "./browser-file-hasher";
import { BrowserMediaMetadataAdapter } from "./browser-media-metadata.adapter";

export interface BrowserObjectUrlEnvironment {
	createObjectURL(source: Blob): string;
	revokeObjectURL(url: string): void;
}

function defaultObjectUrls(): BrowserObjectUrlEnvironment {
	return {
		createObjectURL: (source) => URL.createObjectURL(source),
		revokeObjectURL: (url) => URL.revokeObjectURL(url),
	};
}

function abortError(): Error {
	const error = new Error("The operation was aborted.");
	error.name = "AbortError";
	return error;
}

function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) {
		throw abortError();
	}
}

function browserBlob(file: PrivateMediaFile): Blob {
	if (!(file.opaqueHandle instanceof Blob)) {
		throw new PrivateMediaUploadError("invalid-file", "The selected media file is unavailable.");
	}
	return file.opaqueHandle;
}

/** Owns browser object URLs and makes their release idempotent. */
export class BrowserObjectUrlSceneAssetSourceFactory implements LocalSceneAssetSourceFactoryPort {
	constructor(private readonly objectUrls = defaultObjectUrls()) {}

	create(
		assetId: string,
		file: PrivateMediaFile,
		options: ImportLocalMediaOptions,
	): SceneAssetSourceLease {
		throwIfAborted(options.signal);
		const blob = browserBlob(file);
		let src: string;
		try {
			src = this.objectUrls.createObjectURL(blob);
		} catch {
			throw new PrivateMediaUploadError("unavailable", "A local preview URL could not be created.");
		}

		let released = false;
		const release = () => {
			if (released) {
				return;
			}
			released = true;
			try {
				this.objectUrls.revokeObjectURL(src);
			} catch {}
		};
		try {
			if (!src.startsWith("blob:")) {
				throw new PrivateMediaUploadError(
					"unavailable",
					"A local preview URL could not be created.",
				);
			}
			throwIfAborted(options.signal);
		} catch (error) {
			release();
			throw error;
		}

		return Object.freeze({
			source: Object.freeze({ assetId, src }),
			release,
		});
	}
}

export interface BrowserLocalMediaImporterDependencies {
	readonly registry: SceneAssetSourceRegistryPort;
	readonly hasher?: PrivateMediaSha256Port;
	readonly metadata?: PrivateMediaMetadataPort;
	readonly objectUrls?: BrowserObjectUrlEnvironment;
	readonly sourceFactory?: LocalSceneAssetSourceFactoryPort;
	readonly createAssetId?: () => string;
}

export interface BrowserLocalMediaImporter {
	importFile(file: File, options?: ImportLocalMediaOptions): Promise<ImportLocalMediaResult>;
}

/** Browser composition seam for the future media picker. */
export function createBrowserLocalMediaImporter({
	registry,
	hasher = new BrowserFileSha256Adapter(),
	metadata = new BrowserMediaMetadataAdapter(),
	objectUrls,
	sourceFactory = new BrowserObjectUrlSceneAssetSourceFactory(objectUrls),
	createAssetId,
}: BrowserLocalMediaImporterDependencies): BrowserLocalMediaImporter {
	const importer = createImportLocalMedia({
		hasher,
		metadata,
		sourceFactory,
		registry,
		...(createAssetId ? { createAssetId } : {}),
	});
	return {
		importFile(file, options) {
			const input = { file: privateMediaFileFromBrowser(file) };
			return options ? importer.execute(input, options) : importer.execute(input);
		},
	};
}
