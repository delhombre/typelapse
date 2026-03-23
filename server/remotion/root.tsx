import React from "react";
import { Composition, registerRoot } from "remotion";
import { TypelapseComposition } from "./composition";
import type { RenderInput } from "./types";

const DEFAULT_INPUT: RenderInput = {
	title: "Untitled",
	language: "typescript",
	theme: {
		name: "midnight",
		background: "#0d1117",
		foreground: "#e6edf3",
		fontFamily: "'JetBrains Mono', monospace",
		fontSize: 14,
		padding: 24,
		borderRadius: 12,
	},
	steps: [
		{ code: "const x = 1;", duration: 1000 },
		{ code: "const x = 2;", duration: 1000 },
	],
	background: "radial-gradient(ellipse at 30% 20%, #1e3a5f 0%, #0d1117 50%, #0a0e14 100%)",
	framePadding: 24,
	stepHtmlFrames: [
		"<pre><code>const x = 1;</code></pre>",
		"<pre><code>const x = 2;</code></pre>",
	],
	transitionDurationFrames: 15,
};

function RemotionRoot() {
	return (
		<Composition
			id="Typelapse"
			component={TypelapseComposition}
			durationInFrames={300}
			fps={30}
			width={1920}
			height={1080}
			defaultProps={{ input: DEFAULT_INPUT }}
		/>
	);
}

registerRoot(RemotionRoot);
