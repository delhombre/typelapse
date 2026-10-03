import {
	type ProjectDocumentV1,
	type ProjectDocumentV2,
	parseProjectDocument,
} from "@/application/project/project-document";
import { describe, expect, it } from "vitest";

const LEGACY: ProjectDocumentV1 = {
	title: "Legacy",
	code: "const value = 1;",
	language: "typescript",
	themeName: "midnight",
	background: "mesh:solar",
	steps: [{ code: "const value = 1;", duration: 900 }],
};

function validV2(): ProjectDocumentV2 {
	return {
		schemaVersion: 2,
		project: {
			id: "project-1",
			title: "V2",
			canvas: { width: 1920, height: 1080, background: "#fff" },
			settings: {
				progressStyle: "none",
				transitionMs: 650,
				typewriter: false,
				focusZoom: false,
			},
			assets: [],
			audioCues: [],
			scenes: [
				{
					id: "scene-1",
					durationMs: 1000,
					blocks: [
						{
							id: "block-1",
							kind: "text",
							text: "Hello",
							opacity: 1,
							placement: { x: 0, y: 0, width: 1, height: 1 },
							typography: {
								fontFamily: "Inter",
								fontSize: 72,
								fontWeight: 700,
								color: "#111",
								align: "center",
							},
						},
					],
				},
			],
		},
	};
}

function firstScene(document: ProjectDocumentV2) {
	const scene = document.project.scenes[0];
	if (!scene) {
		throw new Error("Expected a scene");
	}
	return scene;
}

function firstAudioCue(document: ProjectDocumentV2) {
	const cue = document.project.audioCues[0];
	if (!cue) {
		throw new Error("Expected an audio cue");
	}
	return cue;
}

describe("parseProjectDocument", () => {
	it("recognizes an unversioned code project as V1", () => {
		const parsed = parseProjectDocument(LEGACY);

		expect(parsed.schemaVersion).toBe(1);
		expect(parsed.document).toMatchObject(LEGACY);
	});

	it("normalizes optional V1 fields deterministically", () => {
		const parsed = parseProjectDocument({
			title: "Minimal",
			code: "print('ok')",
			language: "python",
			themeName: "nord",
		});

		expect(parsed.schemaVersion).toBe(1);
		if (parsed.schemaVersion !== 1) {
			throw new Error("Expected V1");
		}
		expect(parsed.document).toMatchObject({
			background: "mesh:solar",
			steps: [],
			windowChrome: "macos",
			showLineNumbers: true,
			lineNumberStart: 1,
			framePadding: 24,
			cardMargin: 32,
			width: 1920,
			height: 1080,
			transitionMs: 650,
			progressStyle: "reels",
			typewriter: false,
			focusZoom: false,
		});
	});

	it("rejects malformed V1 input before any hydration", () => {
		expect(() => parseProjectDocument({ ...LEGACY, code: "" })).toThrow(
			"Missing or invalid 'code'",
		);
		expect(() => parseProjectDocument({ ...LEGACY, steps: [{ duration: 1000 }] })).toThrow(
			"Each step must have a 'code'",
		);
	});

	it("reads a step with empty code as a blank step", () => {
		const parsed = parseProjectDocument({
			...LEGACY,
			steps: [
				{ code: "  ", duration: 1000, caption: "Title" },
				{ code: "const a = 1;", duration: 1000 },
			],
		});
		expect(parsed.schemaVersion).toBe(1);
		if (parsed.schemaVersion === 1) {
			expect(parsed.document.steps.map((step) => step.code)).toEqual(["", "const a = 1;"]);
			expect(parsed.document.steps[0]?.caption).toBe("Title");
		}
	});

	it("rejects an unknown schema version explicitly", () => {
		expect(() => parseProjectDocument({ schemaVersion: 99, project: {} })).toThrow(
			"Unsupported project schema version '99'",
		);
	});

	it("accepts a well-formed V2 envelope without changing it", () => {
		const document = validV2();

		expect(parseProjectDocument(document)).toEqual({ schemaVersion: 2, document });
	});

	it("rejects undeclared fields instead of persisting untrusted renderer input", () => {
		const envelope = validV2() as unknown as Record<string, unknown>;
		envelope.privateUrl = "https://storage.invalid/leak";
		expect(() => parseProjectDocument(envelope)).toThrow(
			"Unexpected project document field 'privateUrl'",
		);

		const project = validV2();
		(project.project as unknown as Record<string, unknown>).billingTier = "creator";
		expect(() => parseProjectDocument(project)).toThrow("Unexpected project field 'billingTier'");

		const scene = validV2();
		(firstScene(scene) as unknown as Record<string, unknown>).renderCommand = "trusted";
		expect(() => parseProjectDocument(scene)).toThrow("Unexpected scene field 'renderCommand'");

		const block = validV2();
		(firstScene(block).blocks[0] as unknown as Record<string, unknown>).sourceUrl =
			"https://storage.invalid/leak";
		expect(() => parseProjectDocument(block)).toThrow("Unexpected text block field 'sourceUrl'");
	});

	it("refuses V2 scenes whose asset references are absent", () => {
		expect(() =>
			parseProjectDocument({
				schemaVersion: 2,
				project: {
					id: "p",
					title: "broken",
					canvas: { width: 1920, height: 1080, background: "#000" },
					settings: {
						progressStyle: "none",
						transitionMs: 650,
						typewriter: false,
						focusZoom: false,
					},
					assets: [],
					audioCues: [],
					scenes: [
						{
							id: "s",
							durationMs: 1000,
							blocks: [
								{
									id: "b",
									kind: "image",
									assetId: "missing",
									fit: "cover",
									focalPoint: { x: 0.5, y: 0.5 },
									opacity: 1,
									placement: { x: 0, y: 0, width: 1, height: 1 },
								},
							],
						},
					],
				},
			}),
		).toThrow("references missing asset 'missing'");
	});

	it("rejects invalid V2 render settings at the document boundary", () => {
		const invalid = validV2() as unknown as {
			project: { settings: Record<string, unknown> };
		};
		invalid.project.settings.progressStyle = "spinner";

		expect(() => parseProjectDocument(invalid)).toThrow("progress style");

		invalid.project.settings.progressStyle = "none";
		invalid.project.settings.transitionMs = 275;
		expect(() => parseProjectDocument(invalid)).toThrow("transition duration");

		invalid.project.settings.transitionMs = 650;
		invalid.project.settings.typewriter = "yes";
		expect(() => parseProjectDocument(invalid)).toThrow("typewriter");
	});

	it("rejects unsafe or incomplete asset metadata", () => {
		const invalid = validV2() as ProjectDocumentV2;
		invalid.project.assets.push({
			id: "asset-image",
			kind: "image",
			fileName: "unsafe.svg",
			mimeType: "image/svg+xml",
			byteSize: 1,
			checksum: "sha256:svg",
			width: 1,
			height: 1,
		});

		expect(() => parseProjectDocument(invalid)).toThrow("SVG assets are not supported");

		invalid.project.assets[0] = {
			id: "asset-image",
			kind: "image",
			fileName: "hero.png",
			mimeType: "video/mp4",
			byteSize: 1,
			checksum: "sha256:svg",
			width: 1,
			height: 1,
		};
		expect(() => parseProjectDocument(invalid)).toThrow("MIME type");

		invalid.project.assets[0] = {
			id: "asset-image",
			kind: "image",
			fileName: "hero.png",
			mimeType: "image/png",
			byteSize: 1,
			checksum: " ",
			width: 1,
			height: 1,
		};
		expect(() => parseProjectDocument(invalid)).toThrow("checksum");
	});

	it("rejects blocks that escape the canvas or contain malformed media controls", () => {
		const invalidPlacement = validV2();
		const block = invalidPlacement.project.scenes[0]?.blocks[0];
		if (!block) {
			throw new Error("Expected a block");
		}
		block.placement = { x: 0.75, y: 0, width: 0.5, height: 1 };
		expect(() => parseProjectDocument(invalidPlacement)).toThrow("inside the canvas");

		const invalidVideo = validV2();
		invalidVideo.project.assets.push({
			id: "asset-video",
			kind: "video",
			fileName: "demo.mp4",
			mimeType: "video/mp4",
			byteSize: 100,
			checksum: "sha256:video",
			width: 1920,
			height: 1080,
			durationMs: 1000,
		});
		firstScene(invalidVideo).blocks = [
			{
				id: "video-block",
				kind: "video",
				assetId: "asset-video",
				fit: "cover",
				focalPoint: { x: 0.5, y: 0.5 },
				trim: { startMs: 900, endMs: 1200 },
				playbackRate: 1,
				muted: true,
				opacity: 1,
				placement: { x: 0, y: 0, width: 1, height: 1 },
			},
		];
		expect(() => parseProjectDocument(invalidVideo)).toThrow("trim");
	});

	it("validates audio cues completely and keeps their ids globally unique", () => {
		const invalid = validV2();
		invalid.project.assets.push({
			id: "asset-audio",
			kind: "audio",
			fileName: "voice.wav",
			mimeType: "audio/wav",
			byteSize: 100,
			checksum: "sha256:audio",
			durationMs: 1000,
		});
		invalid.project.audioCues.push({
			id: "scene-1",
			assetId: "asset-audio",
			startMs: 0,
			trim: { startMs: 0, endMs: 1000 },
			gain: 1,
			fadeInMs: 0,
			fadeOutMs: 0,
		});

		expect(() => parseProjectDocument(invalid)).toThrow("Duplicate id 'scene-1'");

		const cue = firstAudioCue(invalid);
		cue.id = "cue-1";
		cue.gain = -0.1;
		expect(() => parseProjectDocument(invalid)).toThrow("gain");

		cue.gain = 1;
		cue.trim = { startMs: 900, endMs: 1_200 };
		expect(() => parseProjectDocument(invalid)).toThrow("trim");

		cue.trim = { startMs: 0, endMs: 1_000 };
		cue.fadeInMs = 600;
		cue.fadeOutMs = 500;
		expect(() => parseProjectDocument(invalid)).toThrow("fades");
	});

	it("accepts an audio-only document and empty visual scenes when audio supplies content", () => {
		const document = validV2();
		document.project.assets.push({
			id: "asset-audio",
			kind: "audio",
			fileName: "voice.wav",
			mimeType: "audio/wav",
			byteSize: 100,
			checksum: "sha256:audio",
			durationMs: 2_000,
		});
		document.project.scenes = [];
		document.project.audioCues.push({
			id: "cue-voice",
			assetId: "asset-audio",
			startMs: 500,
			trim: { startMs: 0, endMs: 2_000 },
			gain: 0.8,
			fadeInMs: 100,
			fadeOutMs: 100,
		});

		expect(parseProjectDocument(document)).toEqual({ schemaVersion: 2, document });

		document.project.scenes = [{ id: "blank", durationMs: 1_000, blocks: [] }];
		expect(parseProjectDocument(document)).toEqual({ schemaVersion: 2, document });
	});

	it("rejects a content-empty project and the unpublished audioTracks spelling", () => {
		const empty = validV2();
		empty.project.scenes = [];
		expect(() => parseProjectDocument(empty)).toThrow(
			"V2 project needs a visual block or an audio cue",
		);

		const oldWire: unknown = {
			...empty,
			project: {
				...empty.project,
				audioTracks: [],
			},
		};
		expect(() => parseProjectDocument(oldWire)).toThrow(
			"V2 field 'audioTracks' is unsupported; use 'audioCues'",
		);
	});

	it("keeps scene captions and transitions inside the domain contract", () => {
		const invalidTransition = validV2();
		firstScene(invalidTransition).transitionOut = {
			kind: "cut",
			durationMs: 120,
		};
		expect(() => parseProjectDocument(invalidTransition)).toThrow(
			"cut transition must have zero duration",
		);

		const invalidCaption = validV2();
		firstScene(invalidCaption).caption = "x".repeat(81);
		expect(() => parseProjectDocument(invalidCaption)).toThrow(
			"Scene caption must be at most 80 characters",
		);
	});
});
