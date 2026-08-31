import {
	type PrivateMediaFile,
	type PrivateMediaInspection,
	type PrivateMediaMetadataPort,
	type PrivateMediaPortOptions,
	PrivateMediaUploadError,
} from "../../application/assets/private-media-upload.port";

export interface BrowserImageBitmapProbe {
	readonly width: number;
	readonly height: number;
	close(): void;
}

export interface BrowserMediaElementProbe {
	duration: number;
	videoWidth: number;
	videoHeight: number;
	preload: string;
	src: string;
	addEventListener(type: "loadedmetadata" | "error", listener: () => void): void;
	removeEventListener(type: "loadedmetadata" | "error", listener: () => void): void;
	load(): void;
	pause(): void;
	removeAttribute(name: "src"): void;
}

export interface BrowserMediaMetadataEnvironment {
	createImageBitmap(source: Blob): Promise<BrowserImageBitmapProbe>;
	createMediaElement(kind: "video" | "audio"): BrowserMediaElementProbe;
	createObjectURL(source: Blob): string;
	revokeObjectURL(url: string): void;
}

function defaultEnvironment(): BrowserMediaMetadataEnvironment {
	return {
		createImageBitmap: (source) => globalThis.createImageBitmap(source),
		createMediaElement: (kind) =>
			document.createElement(kind) as unknown as BrowserMediaElementProbe,
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
	if (signal?.aborted) throw abortError();
}

function blobFrom(file: PrivateMediaFile): Blob {
	if (!(file.opaqueHandle instanceof Blob)) {
		throw new PrivateMediaUploadError("invalid-file", "The selected media file is unavailable.");
	}
	return file.opaqueHandle;
}

function positiveInteger(value: number): boolean {
	return Number.isSafeInteger(value) && value > 0;
}

function validateInspection(inspection: PrivateMediaInspection): PrivateMediaInspection {
	if (inspection.kind === "image") {
		if (!positiveInteger(inspection.width) || !positiveInteger(inspection.height)) {
			throw new PrivateMediaUploadError(
				"invalid-metadata",
				"The image metadata could not be read.",
			);
		}
		return inspection;
	}
	if (inspection.kind === "video") {
		if (
			!positiveInteger(inspection.width) ||
			!positiveInteger(inspection.height) ||
			!positiveInteger(inspection.durationMs)
		) {
			throw new PrivateMediaUploadError(
				"invalid-metadata",
				"The video metadata could not be read.",
			);
		}
		return inspection;
	}
	if (!positiveInteger(inspection.durationMs)) {
		throw new PrivateMediaUploadError("invalid-metadata", "The audio metadata could not be read.");
	}
	return inspection;
}

function imageBitmap(
	source: Blob,
	environment: BrowserMediaMetadataEnvironment,
	signal?: AbortSignal,
): Promise<BrowserImageBitmapProbe> {
	throwIfAborted(signal);
	let pending: Promise<BrowserImageBitmapProbe>;
	try {
		pending = environment.createImageBitmap(source);
	} catch {
		throw new PrivateMediaUploadError("invalid-metadata", "The image metadata could not be read.");
	}
	return new Promise((resolve, reject) => {
		let settled = false;
		const cleanup = () => signal?.removeEventListener("abort", abort);
		const abort = () => {
			if (settled) return;
			settled = true;
			cleanup();
			reject(abortError());
		};
		signal?.addEventListener("abort", abort, { once: true });
		if (signal?.aborted) abort();
		pending.then(
			(bitmap) => {
				if (settled) {
					bitmap.close();
					return;
				}
				settled = true;
				cleanup();
				resolve(bitmap);
			},
			() => {
				if (settled) return;
				settled = true;
				cleanup();
				reject(
					new PrivateMediaUploadError("invalid-metadata", "The image metadata could not be read."),
				);
			},
		);
	});
}

async function waitForMetadata(
	element: BrowserMediaElementProbe,
	signal?: AbortSignal,
): Promise<void> {
	throwIfAborted(signal);
	let loaded: () => void = () => undefined;
	let failed: () => void = () => undefined;
	let aborted: () => void = () => undefined;
	try {
		await new Promise<void>((resolve, reject) => {
			loaded = () => resolve();
			failed = () =>
				reject(
					new PrivateMediaUploadError("invalid-metadata", "The media metadata could not be read."),
				);
			aborted = () => reject(abortError());
			element.addEventListener("loadedmetadata", loaded);
			element.addEventListener("error", failed);
			signal?.addEventListener("abort", aborted, { once: true });
			if (signal?.aborted) {
				aborted();
				return;
			}
			element.load();
		});
	} finally {
		element.removeEventListener("loadedmetadata", loaded);
		element.removeEventListener("error", failed);
		signal?.removeEventListener("abort", aborted);
	}
	throwIfAborted(signal);
}

async function timedMetadata(
	file: PrivateMediaFile,
	kind: "video" | "audio",
	environment: BrowserMediaMetadataEnvironment,
	options: PrivateMediaPortOptions,
): Promise<PrivateMediaInspection> {
	throwIfAborted(options.signal);
	const blob = blobFrom(file);
	const element = environment.createMediaElement(kind);
	let objectUrl: string | null = null;
	try {
		throwIfAborted(options.signal);
		objectUrl = environment.createObjectURL(blob);
		throwIfAborted(options.signal);
		element.preload = "metadata";
		element.src = objectUrl;
		await waitForMetadata(element, options.signal);
		const durationMs = Math.round(element.duration * 1000);
		if (kind === "video") {
			return validateInspection({
				kind,
				width: element.videoWidth,
				height: element.videoHeight,
				durationMs,
			});
		}
		return validateInspection({ kind, durationMs });
	} catch (error) {
		throwIfAborted(options.signal);
		if (error instanceof PrivateMediaUploadError) throw error;
		if (error instanceof Error && error.name === "AbortError") throw abortError();
		throw new PrivateMediaUploadError("invalid-metadata", "The media metadata could not be read.");
	} finally {
		try {
			element.pause();
		} catch {}
		try {
			element.removeAttribute("src");
		} catch {}
		try {
			element.load();
		} catch {}
		if (objectUrl !== null) {
			try {
				environment.revokeObjectURL(objectUrl);
			} catch {}
		}
	}
}

/** DOM probes stay in this adapter; application receives validated numbers only. */
export class BrowserMediaMetadataAdapter implements PrivateMediaMetadataPort {
	constructor(private readonly environment = defaultEnvironment()) {}

	async inspect(
		file: PrivateMediaFile,
		options: PrivateMediaPortOptions,
	): Promise<PrivateMediaInspection> {
		throwIfAborted(options.signal);
		const mimeType = file.mimeType.trim().toLowerCase();
		if (mimeType === "image/svg+xml") {
			throw new PrivateMediaUploadError("unsupported-media-type", "SVG media is not supported.");
		}
		if (mimeType.startsWith("image/")) {
			const bitmap = await imageBitmap(blobFrom(file), this.environment, options.signal);
			try {
				throwIfAborted(options.signal);
				return validateInspection({
					kind: "image",
					width: bitmap.width,
					height: bitmap.height,
				});
			} finally {
				bitmap.close();
			}
		}
		if (mimeType.startsWith("video/")) {
			return timedMetadata(file, "video", this.environment, options);
		}
		if (mimeType.startsWith("audio/")) {
			return timedMetadata(file, "audio", this.environment, options);
		}
		throw new PrivateMediaUploadError(
			"unsupported-media-type",
			"Choose a supported image, video, or audio file.",
		);
	}
}
