import {
	type PrivateMediaFile,
	type PrivateMediaHashOptions,
	type PrivateMediaSha256Port,
	PrivateMediaUploadError,
} from "../../application/assets/private-media-upload.port";
import { IncrementalSha256 } from "./incremental-sha256";

interface BrowserFileHandle {
	arrayBuffer?: () => Promise<ArrayBuffer>;
	stream?: () => ReadableStream<Uint8Array>;
}

export interface BrowserSha256Dependencies {
	readonly digest?: (algorithm: AlgorithmIdentifier, data: BufferSource) => Promise<ArrayBuffer>;
}

function abortError(): Error {
	const error = new Error("The operation was aborted.");
	error.name = "AbortError";
	return error;
}

function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) throw abortError();
}

function browserHandle(file: PrivateMediaFile): BrowserFileHandle {
	const handle = file.opaqueHandle;
	if (typeof handle !== "object" || handle === null) {
		throw new PrivateMediaUploadError("invalid-file", "The selected media file is unavailable.");
	}
	const candidate = handle as BrowserFileHandle;
	if (typeof candidate.stream !== "function" && typeof candidate.arrayBuffer !== "function") {
		throw new PrivateMediaUploadError("invalid-file", "The selected media file cannot be read.");
	}
	return candidate;
}

async function readStream(
	stream: ReadableStream<Uint8Array>,
	file: PrivateMediaFile,
	options: PrivateMediaHashOptions,
): Promise<string> {
	const reader = stream.getReader();
	const hasher = new IncrementalSha256();
	let loadedBytes = 0;
	const cancel = () => {
		void reader.cancel().catch(() => undefined);
	};
	options.signal?.addEventListener("abort", cancel, { once: true });
	options.onProgress?.({ loadedBytes, totalBytes: file.byteSize });
	try {
		while (true) {
			throwIfAborted(options.signal);
			const result = await reader.read();
			throwIfAborted(options.signal);
			if (result.done) break;
			hasher.update(result.value);
			loadedBytes += result.value.byteLength;
			if (loadedBytes > file.byteSize) {
				throw new PrivateMediaUploadError(
					"invalid-file",
					"The selected media size changed while it was being read.",
				);
			}
			options.onProgress?.({ loadedBytes, totalBytes: file.byteSize });
		}
	} finally {
		options.signal?.removeEventListener("abort", cancel);
		reader.releaseLock();
	}
	if (loadedBytes !== file.byteSize) {
		throw new PrivateMediaUploadError(
			"invalid-file",
			"The selected media size changed while it was being read.",
		);
	}
	return toHex(hasher.digest());
}

async function readArrayBuffer(
	arrayBuffer: () => Promise<ArrayBuffer>,
	file: PrivateMediaFile,
	options: PrivateMediaHashOptions,
): Promise<Uint8Array> {
	options.onProgress?.({ loadedBytes: 0, totalBytes: file.byteSize });
	throwIfAborted(options.signal);
	const value = await arrayBuffer();
	throwIfAborted(options.signal);
	if (value.byteLength !== file.byteSize) {
		throw new PrivateMediaUploadError(
			"invalid-file",
			"The selected media size changed while it was being read.",
		);
	}
	options.onProgress?.({ loadedBytes: value.byteLength, totalBytes: file.byteSize });
	return new Uint8Array(value);
}

function toHex(value: ArrayBuffer | Uint8Array): string {
	const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
	return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Browser SHA-256 with cancellable stream reads and an arrayBuffer fallback. */
export class BrowserFileSha256Adapter implements PrivateMediaSha256Port {
	private readonly digest: (
		algorithm: AlgorithmIdentifier,
		data: BufferSource,
	) => Promise<ArrayBuffer>;

	constructor(dependencies: BrowserSha256Dependencies = {}) {
		this.digest =
			dependencies.digest ??
			((algorithm, data) => {
				if (!globalThis.crypto?.subtle) {
					throw new PrivateMediaUploadError(
						"unavailable",
						"Secure media hashing is unavailable in this browser.",
					);
				}
				return globalThis.crypto.subtle.digest(algorithm, data);
			});
	}

	async sha256(file: PrivateMediaFile, options: PrivateMediaHashOptions): Promise<string> {
		throwIfAborted(options.signal);
		const handle = browserHandle(file);
		if (typeof handle.stream === "function") {
			return readStream(handle.stream(), file, options);
		}
		if (typeof handle.arrayBuffer !== "function") {
			throw new PrivateMediaUploadError("invalid-file", "The selected media file cannot be read.");
		}
		const bytes = await readArrayBuffer(handle.arrayBuffer.bind(handle), file, options);
		throwIfAborted(options.signal);
		const digest = await this.digest("SHA-256", bytes.buffer as ArrayBuffer);
		throwIfAborted(options.signal);
		return toHex(digest);
	}
}

/** Creates the only browser-specific wrapper application code needs. */
export function privateMediaFileFromBrowser(file: File): PrivateMediaFile {
	return {
		name: file.name,
		mimeType: file.type,
		byteSize: file.size,
		opaqueHandle: file,
	};
}
