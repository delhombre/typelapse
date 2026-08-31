import { Composition, registerRoot } from "remotion";
import { V2RemotionComposition } from "./composition";
import type { RemotionV2CompositionInput } from "./types";

const DEFAULT_INPUT: RemotionV2CompositionInput = {
	document: {
		schemaVersion: 2,
		project: {
			id: "remotion-v2-default",
			title: "Typelapse V2",
			canvas: { width: 1920, height: 1080, background: "#111111" },
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
					id: "default-scene",
					durationMs: 1_000,
					blocks: [
						{
							id: "default-text",
							kind: "text",
							text: "Typelapse",
							opacity: 1,
							placement: { x: 0, y: 0, width: 1, height: 1 },
							typography: {
								fontFamily: "sans-serif",
								fontSize: 96,
								fontWeight: 700,
								color: "#ffffff",
								align: "center",
							},
						},
					],
				},
			],
		},
	},
	assetSources: [],
	includeAudio: true,
};

function RemotionV2Root() {
	return (
		<Composition
			id="TypelapseV2"
			component={V2RemotionComposition}
			durationInFrames={30}
			fps={30}
			width={1920}
			height={1080}
			defaultProps={{ input: DEFAULT_INPUT }}
		/>
	);
}

registerRoot(RemotionV2Root);
