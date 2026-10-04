import type { PrivateMediaFile } from "@/application/assets/private-media-upload.port";
import {
	type BrowserMediaElementProbe,
	BrowserMediaMetadataAdapter,
	type BrowserMediaMetadataEnvironment,
} from "@/infrastructure/assets/browser-media-metadata.adapter";
import { describe, expect, it, vi } from "vitest";

function file(mimeType: string): PrivateMediaFile {
	return {
		name: `sample.${mimeType.split("/")[1]}`,
		mimeType,
		byteSize: 3,
		opaqueHandle: new Blob([new Uint8Array([1, 2, 3])], { type: mimeType }),
	};
}

class FakeMediaElement implements BrowserMediaElementProbe {
	readonly listeners = new Map<string, Set<() => void>>();
	readonly actions: string[] = [];
	duration = 1.25;
	videoWidth = 1920;
	videoHeight = 1080;
	preload = "";
	src = "";
	autofire: "loadedmetadata" | "error" | null = "loadedmetadata";
	canPlayType?: (type: string) => string;

	addEventListener(type: string, listener: () => void): void {
		const listeners = this.listeners.get(type) ?? new Set();
		listeners.add(listener);
		this.listeners.set(type, listeners);
	}

	removeEventListener(type: string, listener: () => void): void {
		this.listeners.get(type)?.delete(listener);
	}

	load(): void {
		this.actions.push("load");
		if (this.src && this.autofire) {
			for (const listener of this.listeners.get(this.autofire) ?? []) listener();
		}
	}

	pause(): void {
		this.actions.push("pause");
	}

	removeAttribute(name: string): void {
		this.actions.push(`remove:${name}`);
		if (name === "src") this.src = "";
	}
}

function environment(element = new FakeMediaElement()) {
	const actions: string[] = [];
	const bitmap = { width: 640, height: 480, close: vi.fn() };
	const env: BrowserMediaMetadataEnvironment = {
		createImageBitmap: vi.fn(async () => bitmap),
		createMediaElement: vi.fn(() => element),
		createObjectURL: vi.fn(() => {
			actions.push("create-url");
			return "blob:private-probe";
		}),
		revokeObjectURL: vi.fn((url) => actions.push(`revoke:${url}`)),
	};
	return { actions, bitmap, element, env };
}

describe("browser media metadata adapter", () => {
	it("extracts image dimensions and always closes the image probe", async () => {
		const { bitmap, env } = environment();
		const adapter = new BrowserMediaMetadataAdapter(env);

		await expect(adapter.inspect(file("image/png"), {})).resolves.toEqual({
			kind: "image",
			width: 640,
			height: 480,
		});
		expect(bitmap.close).toHaveBeenCalledOnce();
	});

	it("rejects image probing promptly on abort and closes a bitmap that resolves late", async () => {
		const controller = new AbortController();
		const { bitmap, env } = environment();
		let resolveBitmap: ((value: typeof bitmap) => void) | undefined;
		env.createImageBitmap = () =>
			new Promise((resolve) => {
				resolveBitmap = resolve;
			});
		const adapter = new BrowserMediaMetadataAdapter(env);
		const pending = adapter.inspect(file("image/png"), { signal: controller.signal });
		const outcome = pending.then(
			() => "resolved",
			(error: Error) => error.name,
		);

		controller.abort();

		await expect(
			Promise.race([
				outcome,
				new Promise<string>((resolve) => setTimeout(() => resolve("still-pending"), 0)),
			]),
		).resolves.toBe("AbortError");
		resolveBitmap?.(bitmap);
		await Promise.resolve();
		expect(bitmap.close).toHaveBeenCalledOnce();
	});

	it("extracts video metadata then clears the probe and revokes its object URL", async () => {
		const { actions, element, env } = environment();
		const adapter = new BrowserMediaMetadataAdapter(env);

		await expect(adapter.inspect(file("video/mp4"), {})).resolves.toEqual({
			kind: "video",
			width: 1920,
			height: 1080,
			durationMs: 1_250,
		});
		expect(element.actions).toEqual(["load", "pause", "remove:src", "load"]);
		expect(actions).toEqual(["create-url", "revoke:blob:private-probe"]);
	});

	it("extracts audio duration without inventing dimensions", async () => {
		const { env } = environment();
		const adapter = new BrowserMediaMetadataAdapter(env);

		await expect(adapter.inspect(file("audio/mpeg"), {})).resolves.toEqual({
			kind: "audio",
			durationMs: 1_250,
		});
	});

	it("aborts a pending media probe and still cleans every object URL and listener", async () => {
		const controller = new AbortController();
		const probe = new FakeMediaElement();
		probe.autofire = null;
		const { actions, env } = environment(probe);
		const adapter = new BrowserMediaMetadataAdapter(env);
		const pending = adapter.inspect(file("video/mp4"), { signal: controller.signal });

		controller.abort();

		await expect(pending).rejects.toMatchObject({ name: "AbortError" });
		expect(actions).toEqual(["create-url", "revoke:blob:private-probe"]);
		expect(probe.listeners.get("loadedmetadata")?.size ?? 0).toBe(0);
		expect(probe.listeners.get("error")?.size ?? 0).toBe(0);
	});

	it("maps probe failures safely while still clearing the allocated media element", async () => {
		const { element, env } = environment();
		env.createObjectURL = () => {
			throw new Error("blob storage token=private");
		};
		const adapter = new BrowserMediaMetadataAdapter(env);

		const failure = await adapter.inspect(file("video/mp4"), {}).catch((error: unknown) => error);

		expect(failure).toMatchObject({ code: "invalid-metadata" });
		expect(String(failure)).not.toContain("token=private");
		expect(element.actions).toEqual(["pause", "remove:src", "load"]);
	});

	it("names the formats this browser plays when it cannot decode the file", async () => {
		const element = new FakeMediaElement();
		element.autofire = "error";
		const playable = new Set(["audio/wav", "audio/ogg", "audio/webm"]);
		element.canPlayType = (type: string) => (playable.has(type) ? "maybe" : "");
		const { env } = environment(element);
		const adapter = new BrowserMediaMetadataAdapter(env);

		await expect(adapter.inspect(file("audio/mpeg"), {})).rejects.toMatchObject({
			code: "unsupported-media-type",
			message: "This browser cannot play MP3 files. It plays WAV, WebM and Ogg.",
		});
	});

	it("keeps the generic sentence when the browser says it can play the type", async () => {
		const element = new FakeMediaElement();
		element.autofire = "error";
		element.canPlayType = () => "probably";
		const { env } = environment(element);
		const adapter = new BrowserMediaMetadataAdapter(env);

		await expect(adapter.inspect(file("video/mp4"), {})).rejects.toMatchObject({
			code: "invalid-metadata",
			message: "The media metadata could not be read.",
		});
	});

	it("says a file that does not decode as an image is not one", async () => {
		const { env } = environment();
		env.createImageBitmap = vi.fn(async () => {
			throw new Error("InvalidStateError");
		});
		const adapter = new BrowserMediaMetadataAdapter(env);

		await expect(adapter.inspect(file("image/png"), {})).rejects.toMatchObject({
			code: "invalid-metadata",
			message: "This file could not be opened as an image.",
		});
	});

	it("rejects unsupported media before allocating a probe", async () => {
		const { env } = environment();
		const adapter = new BrowserMediaMetadataAdapter(env);

		await expect(adapter.inspect(file("application/pdf"), {})).rejects.toMatchObject({
			code: "unsupported-media-type",
		});
		expect(env.createImageBitmap).not.toHaveBeenCalled();
		expect(env.createMediaElement).not.toHaveBeenCalled();
	});
});
