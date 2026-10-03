import {
	EMPTY_LOCAL_PROJECT_LIBRARY,
	activeLocalProject,
	distinctProjectLabels,
	nextUntitledTitle,
	parseLocalProjectLibrary,
	removeLocalProject,
	upsertLocalProject,
} from "@/application/project/local-project-library";
import type { ProjectPayload } from "@/application/project/project-payload";
import { describe, expect, it } from "vitest";

function payload(title: string): ProjectPayload {
	return {
		title,
		code: `const project = "${title}";`,
		language: "typescript",
		themeName: "midnight",
		background: "mesh:solar",
		steps: [],
	};
}

describe("local project library", () => {
	it("degrades corrupt or stale storage to an empty versioned library", () => {
		expect(parseLocalProjectLibrary(null)).toEqual(EMPTY_LOCAL_PROJECT_LIBRARY);
		expect(parseLocalProjectLibrary("not json")).toEqual(EMPTY_LOCAL_PROJECT_LIBRARY);
		expect(parseLocalProjectLibrary('{"version":2}')).toEqual(EMPTY_LOCAL_PROJECT_LIBRARY);
	});

	it("upserts projects, makes the written one active and sorts recent first", () => {
		const first = upsertLocalProject(EMPTY_LOCAL_PROJECT_LIBRARY, {
			id: "one",
			updatedAt: 10,
			project: payload("One"),
		});
		const second = upsertLocalProject(first, {
			id: "two",
			updatedAt: 20,
			project: payload("Two"),
		});

		expect(second.activeId).toBe("two");
		expect(second.projects.map((project) => project.id)).toEqual(["two", "one"]);
		expect(activeLocalProject(second)?.project.title).toBe("Two");
	});

	it("replaces one project without duplicating it", () => {
		const original = upsertLocalProject(EMPTY_LOCAL_PROJECT_LIBRARY, {
			id: "one",
			updatedAt: 10,
			project: payload("Before"),
		});
		const updated = upsertLocalProject(original, {
			id: "one",
			updatedAt: 20,
			project: payload("After"),
		});

		expect(updated.projects).toHaveLength(1);
		expect(updated.projects[0]?.project.title).toBe("After");
	});

	it("moves active state to the next recent project after deletion", () => {
		const one = upsertLocalProject(EMPTY_LOCAL_PROJECT_LIBRARY, {
			id: "one",
			updatedAt: 10,
			project: payload("One"),
		});
		const two = upsertLocalProject(one, {
			id: "two",
			updatedAt: 20,
			project: payload("Two"),
		});

		const removed = removeLocalProject(two, "two");
		expect(removed.activeId).toBe("one");
		expect(activeLocalProject(removed)?.project.title).toBe("One");
	});
});

describe("default project names", () => {
	it("gives each new project the first free Untitled name", () => {
		expect(nextUntitledTitle([])).toBe("Untitled");
		expect(nextUntitledTitle(["Alpha"])).toBe("Untitled");
		expect(nextUntitledTitle(["Untitled"])).toBe("Untitled 2");
		expect(nextUntitledTitle(["Untitled", "Untitled 2"])).toBe("Untitled 3");
		expect(nextUntitledTitle(["Untitled 2", " untitled "])).toBe("Untitled 3");
		expect(nextUntitledTitle(["Untitled 2"])).toBe("Untitled");
	});

	it("never lists two identical lines, even for a library that already holds duplicates", () => {
		expect(distinctProjectLabels(["Untitled", "Alpha", "Untitled", "Untitled"])).toEqual([
			"Untitled",
			"Alpha",
			"Untitled (2)",
			"Untitled (3)",
		]);
	});
});
