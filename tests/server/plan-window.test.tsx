/**
 * The server's card follows a long file's plan window (#104): the focus reaches
 * the plan, and the composition draws the window's rows and gutter through the
 * walk the preview and the painter take.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CodeCard } from "../../server/remotion/composition";
import { buildCodeCardInput } from "../../server/render/v2/code-card-input";
import { WINDOW_LEAD_ROWS } from "../../src/application/magic-move/window";
import { proofDocument } from "./remotion-v2-proof-document";
import { useMonospaceCanvas } from "../support/jsdom-gaps";

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

const file = (count: number, edit?: { line: number; text: string }) =>
	Array.from({ length: count }, (_, i) =>
		edit && i + 1 === edit.line ? edit.text : `const line${i + 1} = ${i + 1};`,
	).join("\n");

const LONG = file(3_000);
const EDITED = file(3_000, { line: 1408, text: "const line1408 = 'edited';" });

async function longCard() {
	const base = proofDocument();
	const codes = [LONG, EDITED, EDITED];
	return buildCodeCardInput({
		document: {
			...base,
			project: {
				...base.project,
				scenes: base.project.scenes.map((scene, index) => ({
					...scene,
					blocks: scene.blocks.map((block) =>
						block.kind === "code"
							? {
									...block,
									code: codes[index] ?? LONG,
									...(index === 0 ? { focus: "1400-1410" } : {}),
								}
							: block,
					),
				})),
			},
		},
		loop: false,
	});
}

useMonospaceCanvas();

describe("the server's card on a long file", () => {
	it("places each step's window from its focus band or its edit", async () => {
		const card = await longCard();
		expect(card?.plan.frames.map((frame) => frame.firstRow)).toEqual([
			1399 - WINDOW_LEAD_ROWS,
			1407 - WINDOW_LEAD_ROWS,
			1407 - WINDOW_LEAD_ROWS,
		]);
	});

	it("draws the window's rows, numbered from its top, at frame 0", async () => {
		const card = await longCard();
		if (!card) {
			throw new Error("no card");
		}
		const html = renderToStaticMarkup(<CodeCard input={card} />);
		const labels = [...html.matchAll(/<div style="height:[^"]*">(\d+)<\/div>/g)].map(
			(match) => match[1],
		);
		expect(labels[0]).toBe(String(1400 - WINDOW_LEAD_ROWS));
		expect(html).toContain("line1400");
		expect(html).not.toContain("line1 ");
	});
});
