import type { ProjectDocumentV1, ProjectDocumentV2 } from "./project-document";
import { parseProjectDocument } from "./project-document";

function hashString(value: string): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(36).padStart(7, "0");
}

function normalize(document: ProjectDocumentV1): ProjectDocumentV1 {
	const parsed = parseProjectDocument(document);
	if (parsed.schemaVersion !== 1) {
		throw new Error("Expected a V1 project");
	}
	return parsed.document;
}

export function migrateV1ToV2(document: ProjectDocumentV1): ProjectDocumentV2 {
	const source = normalize(document);
	const sourceKey = hashString(JSON.stringify(source));
	const projectId = `legacy-project-${sourceKey}`;
	const captured = source.steps.length > 0;
	const steps = captured ? source.steps : [{ code: source.code, duration: 1000 }];
	const transitionMs = source.transitionMs ?? 650;

	return {
		schemaVersion: 2,
		project: {
			id: projectId,
			title: source.title,
			canvas: {
				width: source.width ?? 1920,
				height: source.height ?? 1080,
				background: source.background,
			},
			settings: {
				progressStyle: source.progressStyle ?? "reels",
				transitionMs,
				...(source.transitionEasing ? { transitionEasing: source.transitionEasing } : {}),
				typewriter: source.typewriter ?? false,
				focusZoom: source.focusZoom ?? false,
				watermark: source.watermark ?? "",
			},
			assets: [],
			audioCues: [],
			legacySource: { liveCode: source.code, hadCapturedSteps: captured },
			scenes: steps.map((step, index) => ({
				id: `${projectId}-scene-${index + 1}`,
				durationMs: step.duration,
				...(step.caption ? { caption: step.caption } : {}),
				...(index < steps.length - 1
					? { transitionOut: { kind: "magic-move" as const, durationMs: transitionMs } }
					: {}),
				blocks: [
					{
						id: `${projectId}-scene-${index + 1}-code`,
						kind: "code" as const,
						code: step.code,
						language: source.language,
						themeName: source.themeName,
						...(source.fontFamily ? { fontFamily: source.fontFamily } : {}),
						...(source.borderRadius !== undefined ? { borderRadius: source.borderRadius } : {}),
						...(step.focus ? { focus: step.focus } : {}),
						chrome: source.windowChrome ?? "macos",
						showLineNumbers: source.showLineNumbers ?? true,
						lineNumberStart: source.lineNumberStart ?? 1,
						framePadding: source.framePadding ?? 24,
						cardMargin: source.cardMargin ?? 32,
						continuityKey: "primary-code",
						opacity: 1,
						placement: { x: 0, y: 0, width: 1, height: 1 },
					},
				],
			})),
		},
	};
}

export function projectV2ToV1(document: ProjectDocumentV2): ProjectDocumentV1 {
	if (document.project.assets.length > 0 || document.project.audioCues.length > 0) {
		throw new Error("only code-only V2 projects can roll back");
	}
	const codeBlocks = document.project.scenes.map((scene) => {
		if (scene.blocks.length !== 1 || scene.blocks[0]?.kind !== "code") {
			throw new Error("only code-only V2 projects can roll back");
		}
		return scene.blocks[0];
	});
	const first = codeBlocks[0];
	if (!first) {
		throw new Error("only code-only V2 projects can roll back");
	}
	for (const block of codeBlocks) {
		if (
			block.language !== first.language ||
			block.themeName !== first.themeName ||
			block.chrome !== first.chrome ||
			block.showLineNumbers !== first.showLineNumbers ||
			block.lineNumberStart !== first.lineNumberStart ||
			block.framePadding !== first.framePadding ||
			block.cardMargin !== first.cardMargin
		) {
			throw new Error("only uniform code-only V2 projects can roll back");
		}
	}

	const hadCapturedSteps = document.project.legacySource?.hadCapturedSteps ?? true;
	const liveCode =
		document.project.legacySource?.liveCode ??
		codeBlocks[codeBlocks.length - 1]?.code ??
		first.code;
	const raw: ProjectDocumentV1 = {
		title: document.project.title,
		code: liveCode,
		language: first.language,
		themeName: first.themeName,
		...(first.fontFamily ? { fontFamily: first.fontFamily } : {}),
		...(first.borderRadius !== undefined ? { borderRadius: first.borderRadius } : {}),
		background: document.project.canvas.background,
		windowChrome: first.chrome,
		showLineNumbers: first.showLineNumbers,
		lineNumberStart: first.lineNumberStart,
		framePadding: first.framePadding,
		cardMargin: first.cardMargin,
		watermark: document.project.settings.watermark ?? "",
		progressStyle: document.project.settings.progressStyle,
		typewriter: document.project.settings.typewriter,
		focusZoom: document.project.settings.focusZoom,
		transitionMs: document.project.settings.transitionMs,
		...(document.project.settings.transitionEasing
			? { transitionEasing: document.project.settings.transitionEasing }
			: {}),
		width: document.project.canvas.width,
		height: document.project.canvas.height,
		steps: hadCapturedSteps
			? document.project.scenes.map((scene, index) => {
					const block = codeBlocks[index];
					if (!block) {
						throw new Error("only code-only V2 projects can roll back");
					}
					return {
						code: block.code,
						duration: scene.durationMs,
						...(block.focus ? { focus: block.focus } : {}),
						...(scene.caption ? { caption: scene.caption } : {}),
					};
				})
			: [],
	};
	return normalize(raw);
}
