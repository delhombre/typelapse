import type {
	HostedProjectApiPort,
	HostedProjectRecord,
} from "@/application/project/hosted-project-api.port";
import type { ProjectDocumentV2 } from "@/application/project/project-document";
import { createHostedProjectSaver } from "@/application/project/save-hosted-project";
import { describe, expect, it } from "vitest";

const DOCUMENT: ProjectDocumentV2 = {
	schemaVersion: 2,
	project: {
		id: "project-1",
		title: "Story",
		canvas: { width: 1920, height: 1080, background: "#111" },
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
				durationMs: 1_000,
				blocks: [
					{
						id: "text-1",
						kind: "text",
						text: "Hello",
						typography: {
							fontFamily: "Inter",
							fontSize: 64,
							fontWeight: 700,
							color: "#fff",
							align: "center",
						},
						opacity: 1,
						placement: { x: 0, y: 0, width: 1, height: 1 },
					},
				],
			},
		],
	},
};

const PROJECT: HostedProjectRecord = {
	id: "project-1",
	revision: 1,
	document: DOCUMENT,
	createdAt: new Date("2026-08-30T19:00:00.000Z"),
	updatedAt: new Date("2026-08-30T20:00:00.000Z"),
};

function apiWith(overrides: Partial<HostedProjectApiPort>): HostedProjectApiPort {
	return {
		list: async () => [],
		exists: async () => false,
		create: async () => PROJECT,
		load: async () => null,
		update: async () => ({ outcome: "updated", project: PROJECT }),
		delete: async () => false,
		...overrides,
	};
}

describe("save hosted project", () => {
	it("creates a document that has no hosted revision yet", async () => {
		const controller = new AbortController();
		let received: { document: ProjectDocumentV2; signal?: AbortSignal } | null = null;
		const saver = createHostedProjectSaver(
			apiWith({
				create: async (document, options) => {
					received = { document, signal: options?.signal };
					return PROJECT;
				},
			}),
		);

		await expect(
			saver.execute(
				{ document: DOCUMENT, target: { kind: "create" } },
				{ signal: controller.signal },
			),
		).resolves.toEqual({ outcome: "saved", operation: "created", project: PROJECT });
		expect(received).toEqual({ document: DOCUMENT, signal: controller.signal });
	});

	it("updates an existing revision and preserves conflict/not-found outcomes without retry", async () => {
		const outcomes = [
			{ outcome: "updated", project: { ...PROJECT, revision: 2 } },
			{ outcome: "conflict", currentRevision: 4 },
			{ outcome: "not-found" },
		] as const;
		let call = 0;
		const saver = createHostedProjectSaver(
			apiWith({
				update: async () => {
					const outcome = outcomes[call];
					call += 1;
					if (!outcome) throw new Error("Unexpected retry");
					return outcome;
				},
			}),
		);
		const input = {
			document: DOCUMENT,
			target: { kind: "update" as const, id: "project-1", expectedRevision: 1 },
		};

		await expect(saver.execute(input)).resolves.toMatchObject({
			outcome: "saved",
			operation: "updated",
			project: { revision: 2 },
		});
		await expect(saver.execute(input)).resolves.toEqual({
			outcome: "conflict",
			currentRevision: 4,
		});
		await expect(saver.execute(input)).resolves.toEqual({ outcome: "not-found" });
		expect(call).toBe(3);
	});
});
