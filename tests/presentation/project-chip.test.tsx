import type { ProjectPayload } from "@/application/project/project-payload";
import { ProjectChip } from "@/presentation/components/layout/project-chip";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	activateLocalProject,
	createLocalProject,
	ensureActiveLocalProject,
	readLocalProjects,
} from "@/presentation/utils/local-project-storage";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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

function open(payloadToOpen: ProjectPayload) {
	useSnippetStore.getState().importFromJson(JSON.stringify(payloadToOpen));
	return render(
		<MemoryRouter>
			<ProjectChip />
		</MemoryRouter>,
	);
}

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("ProjectChip local-first menu", () => {
	it("shows the current local project and the on-device promise", () => {
		ensureActiveLocalProject(payload("Alpha"), { id: "alpha", now: 10 });
		open(payload("Alpha"));

		fireEvent.click(screen.getByRole("button", { name: "Open project menu" }));
		expect(screen.getByText("Local projects")).toBeTruthy();
		expect(screen.getByText("Saved on this device")).toBeTruthy();
		expect(screen.getByRole("menuitem", { name: /Open Alpha/ })).toBeTruthy();
	});

	it("says how many scenes each saved project holds", () => {
		ensureActiveLocalProject(payload("Alpha"), { id: "alpha", now: 10 });
		createLocalProject(payload("Beta"), { id: "beta", now: 20 });
		activateLocalProject("alpha");
		open(payload("Alpha"));

		fireEvent.click(screen.getByRole("button", { name: "Open project menu" }));
		expect(screen.getByRole("menuitem", { name: /Open Beta/ }).textContent).toContain("No scenes");
		expect(screen.getByRole("menuitem", { name: /Open Alpha/ }).textContent).toContain("Open now");
	});

	it("switches projects through the same validated import path", async () => {
		ensureActiveLocalProject(payload("Alpha"), { id: "alpha", now: 10 });
		createLocalProject(payload("Beta"), { id: "beta", now: 20 });
		activateLocalProject("alpha");
		open(payload("Alpha"));

		fireEvent.click(screen.getByRole("button", { name: "Open project menu" }));
		fireEvent.click(screen.getByRole("menuitem", { name: /Open Beta/ }));

		await waitFor(() => expect(useSnippetStore.getState().snippet.title).toBe("Beta"));
		expect(useSnippetStore.getState().snippet.code).toContain('"Beta"');
		expect(readLocalProjects().activeId).toBe("beta");
	});

	it("creates a clean second project without losing the first one", async () => {
		ensureActiveLocalProject(payload("Alpha"), { id: "alpha", now: 10 });
		open(payload("Alpha"));

		fireEvent.click(screen.getByRole("button", { name: "Open project menu" }));
		fireEvent.click(screen.getByRole("menuitem", { name: "New project" }));

		await waitFor(() => expect(useSnippetStore.getState().snippet.title).toBe("Untitled"));
		expect(readLocalProjects().projects).toHaveLength(2);
		expect(readLocalProjects().projects.some((project) => project.project.title === "Alpha")).toBe(
			true,
		);
	});

	it("names three new projects apart and lists three distinct lines", async () => {
		ensureActiveLocalProject(payload("Untitled"), { id: "first", now: 10 });
		open(payload("Untitled"));

		for (const expected of ["Untitled 2", "Untitled 3", "Untitled 4"]) {
			fireEvent.click(screen.getByRole("button", { name: "Open project menu" }));
			fireEvent.click(screen.getByRole("menuitem", { name: "New project" }));
			await waitFor(() => expect(useSnippetStore.getState().snippet.title).toBe(expected));
		}

		fireEvent.click(screen.getByRole("button", { name: "Open project menu" }));
		const names = screen
			.getAllByRole("menuitem")
			.map((item) => item.getAttribute("aria-label"))
			.filter((name): name is string => name?.startsWith("Open ") === true);
		expect(names).toHaveLength(4);
		expect(new Set(names).size).toBe(4);
	});
});

describe("the project name as a field", () => {
	it("is a name, not prose, and Enter is done: it closes the phone's keyboard", () => {
		open(payload("Alpha"));
		const name = screen.getByRole("textbox", { name: "Project name" }) as HTMLInputElement;
		expect(name.getAttribute("spellcheck")).toBe("false");
		expect(name.getAttribute("autocomplete")).toBe("off");
		expect(name.getAttribute("enterkeyhint")).toBe("done");

		name.focus();
		fireEvent.keyDown(name, { key: "Enter" });
		expect(document.activeElement).not.toBe(name);
	});
});

describe("ProjectChip name", () => {
	it("keeps the whole title for a hover, since a long one ends in an ellipsis (#167)", () => {
		const title = "fix(trie-router): count every slash a pattern consumes";
		ensureActiveLocalProject(payload(title), { id: "long", now: 10 });
		open(payload(title));

		expect(screen.getByRole("textbox", { name: "Project name" }).getAttribute("title")).toBe(title);
	});
});
