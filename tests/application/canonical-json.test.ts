import { canonicalJson } from "@/application/project/canonical-json";
import { describe, expect, it } from "vitest";

/** Rebuilds every object with its keys reversed, the way a jsonb round trip may. */
function reorderKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(reorderKeys);
	if (value === null || typeof value !== "object") return value;
	const reversed: Record<string, unknown> = {};
	for (const key of Object.keys(value).reverse()) {
		reversed[key] = reorderKeys((value as Record<string, unknown>)[key]);
	}
	return reversed;
}

const DOCUMENT = {
	schemaVersion: 2,
	project: {
		id: "project-1",
		title: "Launch",
		canvas: { width: 1920, height: 1080, background: "mesh:solar" },
		assets: [],
		audioCues: [],
		scenes: [
			{
				id: "scene-1",
				durationMs: 1_000,
				blocks: [
					{
						id: "text-1",
						kind: "text",
						text: "Hello",
						placement: { x: 0, y: 0, width: 1, height: 1 },
					},
				],
			},
			{ id: "scene-2", durationMs: 2_000, blocks: [] },
		],
	},
};

describe("canonicalJson", () => {
	it("gives the same fingerprint to a document whose keys came back in another order", () => {
		const echoed = reorderKeys(DOCUMENT);

		expect(JSON.stringify(echoed)).not.toBe(JSON.stringify(DOCUMENT));
		expect(canonicalJson(echoed)).toBe(canonicalJson(DOCUMENT));
	});

	it("still tells a changed value apart", () => {
		const edited = structuredClone(DOCUMENT);
		edited.project.title = "Launch, edited";

		expect(canonicalJson(reorderKeys(edited))).not.toBe(canonicalJson(DOCUMENT));
	});

	it("keeps array order meaningful", () => {
		const swapped = structuredClone(DOCUMENT);
		swapped.project.scenes.reverse();

		expect(canonicalJson(swapped)).not.toBe(canonicalJson(DOCUMENT));
	});

	it("follows JSON.stringify for dates and undefined fields", () => {
		const at = new Date("2026-10-03T00:00:00.000Z");

		expect(canonicalJson({ b: undefined, a: at })).toBe(JSON.stringify({ a: at }));
	});
});
