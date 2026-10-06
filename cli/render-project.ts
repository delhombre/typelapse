/**
 * A project file → the bytes the studio's server export would download.
 *
 * Shared by the CLI and `scripts/render-demo.mjs`, which is how the README demo
 * stays "a plain Typelapse export": both build the exact JSON body the studio's
 * export panel POSTs and hand it to the shipped `/render` handler in process.
 * `renderRoute` is a Hono app, and Hono apps answer `request()` directly, so
 * this is the real route, its clamps and its Remotion bundle, without a port.
 */

import { focusLineSet, parseLineRanges } from "@/application/focus/line-ranges";
import { frameLineCount } from "@/application/magic-move/engine";
import type { ProjectDocumentV2 } from "@/application/project/project-document";
import type { ProjectPayload } from "@/application/project/project-payload";
import type { HostedRenderOptions } from "@/application/render/hosted-render-job";
import { THEMES } from "@/presentation/components/controls/control-presets";

/** What the export panel decides rather than the project: the encode. */
export interface RenderSettings {
	format: "mp4" | "webm" | "gif";
	fps: number;
	/** Morph the last step back into the first, so a replay is not a hard cut. */
	loop: boolean;
}

/** The route answered with an error: its status says whose fault it was. */
export class RenderFailure extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
		this.name = "RenderFailure";
	}
}

/** Project file → the exact JSON body the studio's export panel POSTs. */
export function renderRequestBody(payload: ProjectPayload, settings: RenderSettings) {
	return {
		title: payload.title,
		language: payload.language,
		theme: themeData(payload),
		steps: payload.steps.map((step) => {
			const focus = [
				...focusLineSet(parseLineRanges(step.focus ?? "") ?? [], frameLineCount(step.code)),
			];
			return {
				code: step.code,
				duration: step.duration,
				focus: focus.length > 0 ? focus : undefined,
				caption: step.caption || undefined,
			};
		}),
		background: payload.background,
		windowChrome: payload.windowChrome ?? "macos",
		showLineNumbers: payload.showLineNumbers ?? true,
		lineNumberStart: payload.lineNumberStart ?? 1,
		framePadding: payload.framePadding ?? 24,
		cardMargin: payload.cardMargin ?? 32,
		width: payload.width,
		height: payload.height,
		fps: settings.fps,
		format: settings.format,
		loop: settings.loop,
		typewriter: payload.typewriter ?? false,
		focusZoom: payload.focusZoom ?? false,
		// The studio's default, and GIF has no audio track to put a tick in.
		sound: false,
		progressStyle: payload.progressStyle ?? "reels",
		transitionMs: payload.transitionMs ?? 650,
		transitionEasing: payload.transitionEasing,
		watermark: payload.watermark || undefined,
	};
}

/** Resolve `themeName` through the studio's own theme table, then the two fields it edits in place. */
export function themeData(payload: ProjectPayload) {
	const preset = THEMES.find((entry) => entry.name === payload.themeName);
	if (!preset) {
		throw new Error(`Unknown theme '${payload.themeName}'`);
	}
	const theme = preset.factory();
	return {
		name: theme.name,
		background: theme.background,
		foreground: theme.foreground,
		fontFamily: payload.fontFamily ?? theme.fontFamily,
		fontSize: theme.fontSize,
		borderRadius: payload.borderRadius ?? theme.borderRadius,
	};
}

/** A GIF's logical screen size, from bytes 6..9 of its own header; null for any other file. */
export function gifHeaderSize(bytes: Uint8Array): { width: number; height: number } | null {
	if (
		bytes.length < 10 ||
		String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0) !== "GIF"
	) {
		return null;
	}
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
}

type RouteModule = typeof import("../server/routes/render");

let route: Promise<RouteModule> | null = null;

/*
 * The route rebuilds its Remotion bundle on every request in dev, which for a
 * one-shot render means bundling the composition twice for one file. `isDev`
 * is read once at the route's module scope, so production is set before the
 * first import, and the import waits until a render is actually asked for.
 */
function loadRoute(): Promise<RouteModule> {
	process.env.NODE_ENV ??= "production";
	route ??= import("../server/routes/render");
	return route;
}

/** Drive the real render handler in process and return the file it would have downloaded. */
export async function renderProject(
	payload: ProjectPayload,
	settings: RenderSettings,
): Promise<Uint8Array> {
	const { renderRoute } = await loadRoute();
	const response = await renderRoute.request("/render", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(renderRequestBody(payload, settings)),
	});
	if (!response.ok) {
		const detail = await response.text();
		let message = detail;
		try {
			message = (JSON.parse(detail) as { error?: string }).error ?? detail;
		} catch {
			// Not JSON: the text is the message.
		}
		throw new RenderFailure(response.status, message);
	}
	return new Uint8Array(await response.arrayBuffer());
}

/**
 * A layered V2 project with no media → the bytes the studio's Server export of
 * it would download: the shipped local multimedia route, in process, with no
 * asset parts because the document names none.
 */
export async function renderLayeredDocument(
	document: ProjectDocumentV2,
	options: HostedRenderOptions,
): Promise<Uint8Array> {
	process.env.NODE_ENV ??= "production";
	const { createLocalMultimediaRenderRoute } = await import(
		"../server/routes/local-multimedia-render"
	);
	const form = new FormData();
	form.set("document", JSON.stringify(document));
	form.set("options", JSON.stringify(options));
	const response = await createLocalMultimediaRenderRoute().request("/render/v2", {
		method: "POST",
		body: form,
	});
	if (!response.ok) {
		const detail = await response.text();
		let message = detail;
		try {
			message = (JSON.parse(detail) as { error?: string }).error ?? detail;
		} catch {
			// Not JSON: the text is the message.
		}
		throw new RenderFailure(response.status, message);
	}
	return new Uint8Array(await response.arrayBuffer());
}

/** The shared bundle is ~21 MB in the OS temp dir and nothing else will ever remove it. */
export async function disposeRenderer(): Promise<void> {
	if (!route) {
		return;
	}
	const loaded = await route.catch(() => null);
	await loaded?.disposeSharedBundle();
}
