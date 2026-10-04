/**
 * The push-in never draws code over the chrome bar (#114).
 *
 * The painter clips the body at its own box before it scales (`clipBody`, then
 * `applyZoom`). The composition used to scale the very box that clipped, so a
 * 1.25 push-in grew the clip with it and the first rows climbed into the bar.
 */

import { render } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { CodeCard } from "../../server/remotion/composition";
import { buildCodeCardInput } from "../../server/render/v2/code-card-input";
import { ZOOM_SCALE } from "../../src/application/magic-move/focus-zoom";
import { proofDocument } from "./remotion-v2-proof-document";

vi.mock("remotion", async () => {
	const ReactRuntime = await import("react");
	return {
		AbsoluteFill: ({ children }: { children?: React.ReactNode }) =>
			ReactRuntime.createElement("div", null, children),
		Audio: () => null,
		delayRender: () => 1,
		continueRender: () => undefined,
		useCurrentFrame: () => 0,
		useVideoConfig: () => ({ fps: 30, width: 1920, height: 1080, durationInFrames: 150 }),
	};
});

const CODE = Array.from({ length: 12 }, (_, i) => `const line${i + 1} = ${i + 1};`).join("\n");

async function zoomedCard() {
	const base = proofDocument();
	return buildCodeCardInput({
		document: {
			...base,
			project: {
				...base.project,
				settings: { ...base.project.settings, focusZoom: true },
				scenes: base.project.scenes.map((scene, index) => ({
					...scene,
					blocks: scene.blocks.map((block) =>
						block.kind === "code"
							? { ...block, code: CODE, ...(index === 0 ? { focus: "5-8" } : {}) }
							: block,
					),
				})),
			},
		},
		loop: false,
	});
}

describe("the composition's push-in", () => {
	it("scales the code inside a clip that stays at the body's own box", async () => {
		const card = await zoomedCard();
		if (!card) {
			throw new Error("no card");
		}
		const { container } = render(<CodeCard input={card} />);
		const scaled = Array.from(container.querySelectorAll<HTMLElement>("div")).find((el) =>
			el.style.transform.startsWith(`scale(${ZOOM_SCALE})`),
		);
		expect(scaled, "a pushed-in body").toBeDefined();
		// The box that scales does not clip: a clip that scales grows over the bar.
		expect(scaled?.style.overflow).not.toBe("hidden");
		const clip = scaled?.parentElement;
		expect(clip?.style.overflow).toBe("hidden");
		expect(clip?.style.transform).toBe("");
		// The clip is the window's body: the chrome bar sits right above it.
		expect(clip?.parentElement?.hasAttribute("data-code-window")).toBe(true);
	});
});
