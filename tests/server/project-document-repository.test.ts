import { describe, expect, it } from "vitest";
import { storedProjectFromRow } from "../../server/db/project-document.repository";

const V2 = {
	schemaVersion: 2 as const,
	project: {
		id: "project-1",
		title: "Mixed launch",
		canvas: { width: 1920, height: 1080, background: "mesh:solar" },
		settings: {
			progressStyle: "none",
			transitionMs: 650,
			typewriter: false,
			focusZoom: false,
		},
		assets: [],
		scenes: [
			{
				id: "scene-1",
				durationMs: 1000,
				blocks: [
					{
						id: "text-1",
						kind: "text",
						text: "Launch",
						placement: { x: 0, y: 0, width: 1, height: 1 },
						opacity: 1,
						typography: {
							fontFamily: "Inter",
							fontSize: 64,
							fontWeight: 700,
							color: "#ffffff",
							align: "center",
						},
					},
				],
				transitionOut: { kind: "cut", durationMs: 0 },
			},
		],
		audioCues: [],
	},
};

describe("project document repository mapping", () => {
	it("revalidates persisted JSON before exposing an owner-scoped record", () => {
		const createdAt = new Date("2026-08-30T20:00:00.000Z");
		const record = storedProjectFromRow({
			id: "project-1",
			ownerId: "user-1",
			title: "Mixed launch",
			document: V2,
			revision: 3,
			automation: false,
			createdAt,
			updatedAt: createdAt,
		});

		expect(record).toMatchObject({
			id: "project-1",
			ownerId: "user-1",
			revision: 3,
			document: { schemaVersion: 2 },
		});
	});

	it("fails closed if storage contains a malformed document", () => {
		const createdAt = new Date("2026-08-30T20:00:00.000Z");
		expect(() =>
			storedProjectFromRow({
				id: "project-1",
				ownerId: "user-1",
				title: "Malformed",
				document: { schemaVersion: 2, project: {} },
				revision: 1,
				automation: false,
				createdAt,
				updatedAt: createdAt,
			}),
		).toThrow();
	});
});
