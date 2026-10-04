import type { ProjectDocumentV2 } from "@/application/project/project-document";
import {
	PROJECT_HISTORY_COALESCE_MS,
	PROJECT_HISTORY_LIMIT,
	canRedoProjectEdit,
	canUndoProjectEdit,
	createProjectHistory,
	decodeProjectHistory,
	encodeProjectHistory,
	presentProjectDocument,
	recordProjectEdit,
	redoProjectEdit,
	undoProjectEdit,
} from "@/application/project/project-history";
import { createStarterMultimediaProject } from "@/application/project/starter-multimedia-project";
import { describe, expect, it } from "vitest";

const base = createStarterMultimediaProject({
	projectId: "project-1",
	sceneId: "scene-1",
	textBlockId: "text-1",
});

function titled(document: ProjectDocumentV2, title: string): ProjectDocumentV2 {
	return { ...document, project: { ...document.project, title } };
}

function timed(document: ProjectDocumentV2, durationMs: number): ProjectDocumentV2 {
	return {
		...document,
		project: {
			...document.project,
			scenes: document.project.scenes.map((scene, index) =>
				index === 0 ? { ...scene, durationMs } : scene,
			),
		},
	};
}

describe("project history", () => {
	it("undoes and redoes distinct edits in order", () => {
		let history = createProjectHistory(base);
		const renamed = titled(base, "Renamed");
		const longer = timed(renamed, 5_000);
		history = recordProjectEdit(history, renamed, 0);
		history = recordProjectEdit(history, longer, 10_000);

		expect(presentProjectDocument(history)).toEqual(longer);
		history = undoProjectEdit(history);
		expect(presentProjectDocument(history)).toEqual(renamed);
		history = undoProjectEdit(history);
		expect(presentProjectDocument(history)).toEqual(base);
		expect(canUndoProjectEdit(history)).toBe(false);

		history = redoProjectEdit(history);
		history = redoProjectEdit(history);
		expect(presentProjectDocument(history)).toEqual(longer);
		expect(canRedoProjectEdit(history)).toBe(false);
	});

	it("records nothing for a document equal to the present one", () => {
		const history = createProjectHistory(base);
		const same = structuredClone(base);

		expect(recordProjectEdit(history, same, 0)).toBe(history);
		expect(undoProjectEdit(history)).toBe(history);
		expect(redoProjectEdit(history)).toBe(history);
	});

	it("folds a burst of edits to the same field into one entry", () => {
		let history = createProjectHistory(base);
		history = recordProjectEdit(history, titled(base, "R"), 0);
		history = recordProjectEdit(history, titled(base, "Re"), 300);
		history = recordProjectEdit(history, titled(base, "Ren"), 600);

		history = undoProjectEdit(history);

		expect(presentProjectDocument(history)).toEqual(base);
	});

	it("keeps edits apart when the pause is long or the field changes", () => {
		let history = createProjectHistory(base);
		history = recordProjectEdit(history, titled(base, "R"), 0);
		history = recordProjectEdit(history, titled(base, "Re"), PROJECT_HISTORY_COALESCE_MS + 1);
		history = recordProjectEdit(
			history,
			timed(titled(base, "Re"), 4_000),
			PROJECT_HISTORY_COALESCE_MS + 2,
		);

		history = undoProjectEdit(history);
		expect(presentProjectDocument(history).project.title).toBe("Re");
		expect(presentProjectDocument(history).project.scenes[0]?.durationMs).toBe(3_200);
		history = undoProjectEdit(history);
		expect(presentProjectDocument(history).project.title).toBe("R");
	});

	it("never folds two quick structural edits, such as two scene deletions", () => {
		const scene = base.project.scenes[0] as ProjectDocumentV2["project"]["scenes"][number];
		const three: ProjectDocumentV2 = {
			...base,
			project: {
				...base.project,
				scenes: [scene, { ...scene, id: "scene-2" }, { ...scene, id: "scene-3" }],
			},
		};
		const withScenes = (count: number): ProjectDocumentV2 => ({
			...three,
			project: { ...three.project, scenes: three.project.scenes.slice(0, count) },
		});
		let history = createProjectHistory(three);
		history = recordProjectEdit(history, withScenes(2), 0);
		history = recordProjectEdit(history, withScenes(1), 100);

		history = undoProjectEdit(history);

		expect(presentProjectDocument(history).project.scenes).toHaveLength(2);
	});

	it("never folds an edit into one that was undone and redone", () => {
		let history = createProjectHistory(base);
		history = recordProjectEdit(history, titled(base, "R"), 0);
		history = undoProjectEdit(history);
		history = redoProjectEdit(history);
		history = recordProjectEdit(history, titled(base, "Re"), 100);

		history = undoProjectEdit(history);

		expect(presentProjectDocument(history).project.title).toBe("R");
	});

	it("drops the redo branch when a new edit follows an undo", () => {
		let history = createProjectHistory(base);
		history = recordProjectEdit(history, titled(base, "A"), 0);
		history = undoProjectEdit(history);
		history = recordProjectEdit(history, timed(base, 4_000), 5_000);

		expect(canRedoProjectEdit(history)).toBe(false);
		history = undoProjectEdit(history);
		expect(presentProjectDocument(history)).toEqual(base);
	});

	it("forgets the oldest entries past its limit", () => {
		let history = createProjectHistory(base);
		for (let index = 1; index <= PROJECT_HISTORY_LIMIT + 5; index += 1) {
			history = recordProjectEdit(history, timed(base, 1_000 + index), index * 10_000);
		}
		let undos = 0;
		while (canUndoProjectEdit(history)) {
			history = undoProjectEdit(history);
			undos += 1;
		}

		expect(undos).toBe(PROJECT_HISTORY_LIMIT - 1);
	});

	it("shares every untouched part of the document between entries", () => {
		const twoScenes: ProjectDocumentV2 = {
			...base,
			project: {
				...base.project,
				scenes: [
					...base.project.scenes,
					{
						...(base.project.scenes[0] as ProjectDocumentV2["project"]["scenes"][number]),
						id: "scene-2",
					},
				],
			},
		};
		let history = createProjectHistory(twoScenes);
		history = recordProjectEdit(history, structuredClone(timed(twoScenes, 9_000)), 0);
		const before = undoProjectEdit(history);

		expect(presentProjectDocument(history).project.scenes[1]).toBe(
			presentProjectDocument(before).project.scenes[1],
		);
	});

	it("survives an encode and decode with its position", () => {
		let history = createProjectHistory(base);
		history = recordProjectEdit(history, titled(base, "A"), 0);
		history = recordProjectEdit(history, timed(titled(base, "A"), 4_000), 10_000);
		history = undoProjectEdit(history);

		const decoded = decodeProjectHistory(JSON.parse(JSON.stringify(encodeProjectHistory(history))));
		if (!decoded) {
			throw new Error("The encoded history must decode");
		}

		expect(decoded.projectId).toBe("project-1");
		expect(presentProjectDocument(decoded)).toEqual(titled(base, "A"));
		expect(presentProjectDocument(redoProjectEdit(decoded))).toEqual(
			timed(titled(base, "A"), 4_000),
		);
		expect(presentProjectDocument(undoProjectEdit(decoded))).toEqual(base);
	});

	it("stores an edit as what changed, not as the whole document again", () => {
		const longCode = "x".repeat(50_000);
		const heavy = titled(base, longCode);
		let history = createProjectHistory(heavy);
		history = recordProjectEdit(history, timed(heavy, 4_000), 0);

		expect(JSON.stringify(encodeProjectHistory(history)).length).toBeLessThan(60_000);
	});

	it("refuses an encoded history it cannot trust", () => {
		expect(decodeProjectHistory(null)).toBeNull();
		expect(
			decodeProjectHistory({ version: 1, projectId: "p", base: {}, edits: [], index: 0 }),
		).toBeNull();
		const encoded = encodeProjectHistory(
			recordProjectEdit(createProjectHistory(base), titled(base, "A"), 0),
		);
		expect(decodeProjectHistory({ ...encoded, index: 7 })).toBeNull();
	});
});
