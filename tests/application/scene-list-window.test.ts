import {
	COLLAPSED_SCENE_ROWS,
	sceneListWindow,
} from "@/application/studio-timeline/scene-list-window";
import { describe, expect, it } from "vitest";

describe("sceneListWindow", () => {
	it("shows every row while the list is short", () => {
		expect(sceneListWindow({ count: COLLAPSED_SCENE_ROWS, selected: 0 })).toEqual({
			start: 0,
			end: COLLAPSED_SCENE_ROWS,
			hidden: 0,
		});
		expect(sceneListWindow({ count: 0, selected: 0 })).toEqual({ start: 0, end: 0, hidden: 0 });
	});

	it("shows the head of a long list while the first scene is selected", () => {
		expect(sceneListWindow({ count: 20, selected: 0 })).toEqual({
			start: 0,
			end: COLLAPSED_SCENE_ROWS,
			hidden: 20 - COLLAPSED_SCENE_ROWS,
		});
	});

	it("keeps the selected scene in view, one row of context before it", () => {
		const window = sceneListWindow({ count: 20, selected: 10 });
		expect(window.start).toBe(9);
		expect(window.end - window.start).toBe(COLLAPSED_SCENE_ROWS);
		expect(10).toBeGreaterThanOrEqual(window.start);
		expect(10).toBeLessThan(window.end);
	});

	it("ends at the last row when the last scene is selected", () => {
		const window = sceneListWindow({ count: 20, selected: 19 });
		expect(window.end).toBe(20);
		expect(window.end - window.start).toBe(COLLAPSED_SCENE_ROWS);
	});

	it("survives a selection past the end", () => {
		const window = sceneListWindow({ count: 6, selected: 40 });
		expect(window.end).toBe(6);
		expect(window.start).toBe(6 - COLLAPSED_SCENE_ROWS);
	});
});
