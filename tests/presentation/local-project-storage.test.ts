import type { ProjectPayload } from "@/application/project/project-payload";
import {
	LOCAL_PROJECTS_STORAGE_KEY,
	activateLocalProject,
	createLocalProject,
	ensureActiveLocalProject,
	readLocalProjects,
	saveActiveLocalProject,
} from "@/presentation/utils/local-project-storage";
import { beforeEach, describe, expect, it, vi } from "vitest";

function payload(title: string): ProjectPayload {
	return {
		title,
		code: `const title = "${title}";`,
		language: "typescript",
		themeName: "midnight",
		background: "mesh:solar",
		steps: [],
	};
}

describe("local project storage", () => {
	beforeEach(() => window.localStorage.clear());

	it("seeds one active project and does not duplicate it on a second boot", () => {
		const first = ensureActiveLocalProject(payload("First"), { id: "one", now: 10 });
		const second = ensureActiveLocalProject(payload("Ignored"), { id: "two", now: 20 });

		expect(first.id).toBe("one");
		expect(second.id).toBe("one");
		expect(readLocalProjects().projects).toHaveLength(1);
	});

	it("autosaves into the active record without creating a new project", () => {
		ensureActiveLocalProject(payload("Before"), { id: "one", now: 10 });
		saveActiveLocalProject(payload("After"), 20);

		const library = readLocalProjects();
		expect(library.projects).toHaveLength(1);
		expect(library.projects[0]?.project.title).toBe("After");
		expect(library.projects[0]?.updatedAt).toBe(20);
	});

	it("creates and activates a second local-first project", () => {
		ensureActiveLocalProject(payload("One"), { id: "one", now: 10 });
		createLocalProject(payload("Two"), { id: "two", now: 20 });

		expect(readLocalProjects().activeId).toBe("two");
		expect(activateLocalProject("one")?.project.title).toBe("One");
		expect(readLocalProjects().activeId).toBe("one");
	});

	it("writes one versioned document under its own key", () => {
		ensureActiveLocalProject(payload("One"), { id: "one", now: 10 });
		const raw = window.localStorage.getItem(LOCAL_PROJECTS_STORAGE_KEY);
		expect(raw).not.toBeNull();
		expect(JSON.parse(raw as string)).toMatchObject({ version: 1, activeId: "one" });
	});

	it("notifies same-tab menus after a write", () => {
		const listener = vi.fn();
		window.addEventListener("typelapse:projects-changed", listener);
		ensureActiveLocalProject(payload("One"), { id: "one", now: 10 });
		expect(listener).toHaveBeenCalledTimes(1);
		window.removeEventListener("typelapse:projects-changed", listener);
	});
});
