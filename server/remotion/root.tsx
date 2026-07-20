import React from "react";
import { Composition, registerRoot } from "remotion";
import { TypelapseComposition } from "./composition";
import type { RenderInput } from "./types";

const FG = "#e6edf3";

const DEFAULT_INPUT: RenderInput = {
	title: "sum.ts",
	language: "typescript",
	theme: {
		name: "midnight",
		background: "#0d1117",
		foreground: FG,
		fontFamily: "'JetBrains Mono', monospace",
		fontSize: 14,
		padding: 24,
		borderRadius: 12,
	},
	steps: [
		{ code: "const x = 1;", duration: 1000 },
		{ code: "const x = 2;", duration: 1000 },
	],
	background: "mesh:aurora",
	windowChrome: "macos",
	showLineNumbers: true,
	lineNumberStart: 1,
	framePadding: 24,
	cardMargin: 32,
	transitionMs: 650,
	loop: false,
	typewriter: false,
	focusZoom: false,
	progressStyle: "reels",
	plan: {
		frames: [
			{ tokens: [{ key: "x", content: "const x = 1;", line: 0, col: 0, color: FG }], lineCount: 1 },
			{ tokens: [{ key: "x", content: "const x = 2;", line: 0, col: 0, color: FG }], lineCount: 1 },
		],
		transitions: [
			{
				from: [{ key: "x", content: "const x = 1;", line: 0, col: 0, color: FG }],
				to: [{ key: "x", content: "const x = 2;", line: 0, col: 0, color: FG }],
			},
		],
	},
};

function RemotionRoot() {
	return (
		<Composition
			id="Typelapse"
			component={TypelapseComposition}
			durationInFrames={150}
			fps={30}
			width={1920}
			height={1080}
			defaultProps={{ input: DEFAULT_INPUT }}
		/>
	);
}

registerRoot(RemotionRoot);
