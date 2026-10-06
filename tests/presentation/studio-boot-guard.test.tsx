import type { LocalProjectLibrary } from "@/application/project/local-project-library";
import type { ProjectPayload } from "@/application/project/project-payload";
import { StudioBootGuard } from "@/presentation/components/layout/studio-boot-guard";
import { StudioPersistence } from "@/presentation/components/layout/studio-persistence";
import { StudioUtilities } from "@/presentation/components/layout/studio-utilities";
import { RouteErrorBoundary } from "@/presentation/components/ui/route-error-boundary";
import { StudioTooltipProvider } from "@/presentation/components/ui/studio-tooltip";
import { useExportStore } from "@/presentation/stores/export.store";
import { useNoticeStore } from "@/presentation/stores/notice.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	LOCAL_PROJECTS_STORAGE_KEY,
	readLocalProjects,
} from "@/presentation/utils/local-project-storage";
import { encodeShareLink } from "@/presentation/utils/share-link";
import {
	RECOVERY_NOTICE,
	RECOVERY_STORAGE_KEY,
	readKeptProjects,
} from "@/presentation/utils/studio-recovery";
import { DRAFT_STORAGE_KEY } from "@/presentation/utils/studio-storage-keys";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The boot guard (#185): a stored project that throws the studio once it is
 * restored is set aside, not replayed on every reload, and a throw that is not
 * the stored project's moves nothing. The studio below is the real persistence
 * restore plus a probe standing in for the preview, which throws on whatever
 * the test says it cannot draw.
 */

const DEFAULT_TITLE = useSnippetStore.getInitialState().snippet.title;

function project(title: string): ProjectPayload {
	return {
		title,
		code: `const ${title.replace(/\W/g, "_")} = 1;\nexport {};`,
		language: "typescript",
		themeName: "nord",
		background: "mesh:ocean",
		steps: [],
	};
}

/** A device that holds `active` (open, and mirrored in the draft) and `others`. */
function seedDevice(
	active: { id: string; title: string },
	others: { id: string; title: string }[],
) {
	const library: LocalProjectLibrary = {
		version: 1,
		activeId: active.id,
		projects: [active, ...others].map((entry, index) => ({
			id: entry.id,
			updatedAt: 1_000 - index,
			project: project(entry.title),
		})),
	};
	window.localStorage.setItem(LOCAL_PROJECTS_STORAGE_KEY, JSON.stringify(library));
	window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(project(active.title)));
}

/** Work done in whatever project is open: the autosave writes it to both places. */
function workInActiveProject(title: string) {
	const library = readLocalProjects();
	const projects = library.projects.map((record) =>
		record.id === library.activeId ? { ...record, project: project(title) } : record,
	);
	window.localStorage.setItem(LOCAL_PROJECTS_STORAGE_KEY, JSON.stringify({ ...library, projects }));
	window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(project(title)));
}

function storageSnapshot(): Record<string, string | null> {
	return {
		draft: window.localStorage.getItem(DRAFT_STORAGE_KEY),
		projects: window.localStorage.getItem(LOCAL_PROJECTS_STORAGE_KEY),
		recovery: window.localStorage.getItem(RECOVERY_STORAGE_KEY),
	};
}

const probe = {
	/** Titles the preview cannot draw. */
	failsOn: new Set<string>(),
	/** Every render throws, the default project's included: a shell bug. */
	always: false,
	/** The default project throws too, once the studio has opened. */
	defaultFailsAfterOpen: false,
	opened: false,
};

/** What the preview does with the snippet: draw it, or throw. */
function PreviewProbe() {
	const title = useSnippetStore((s) => s.snippet.title);
	if (probe.always || probe.failsOn.has(title)) {
		throw new Error(`The studio cannot draw ${title}`);
	}
	if (probe.opened && probe.defaultFailsAfterOpen && title === DEFAULT_TITLE) {
		throw new Error("The studio cannot draw the default project either");
	}
	return <p data-testid="title">{title}</p>;
}

function OpenedMarker() {
	// Runs after the persistence restore (an earlier sibling's effect).
	useEffect(() => {
		probe.opened = true;
	}, []);
	return null;
}

function Studio({ withShareLoader = false }: { withShareLoader?: boolean }) {
	return (
		<RouteErrorBoundary>
			<StudioTooltipProvider>
				<StudioBootGuard>
					<StudioPersistence />
					{withShareLoader ? <StudioUtilities /> : null}
					<OpenedMarker />
					<PreviewProbe />
				</StudioBootGuard>
			</StudioTooltipProvider>
		</RouteErrorBoundary>
	);
}

/** jsdom's Blob has no text(); FileReader reads it. */
function readBlob(blob: Blob | undefined): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error);
		reader.readAsText(blob ?? new Blob([]));
	});
}

/** One visit: memory starts fresh, storage is what the last visit left. */
function boot(props: { withShareLoader?: boolean } = {}) {
	cleanup();
	useSnippetStore.setState(useSnippetStore.getInitialState(), true);
	useExportStore.setState(useExportStore.getInitialState(), true);
	probe.opened = false;
	return render(<Studio {...props} />);
}

beforeEach(() => {
	window.localStorage.clear();
	window.history.replaceState(null, "", "/app");
	useNoticeStore.setState({ notices: [] });
	probe.failsOn = new Set();
	probe.always = false;
	probe.defaultFailsAfterOpen = false;
	vi.spyOn(console, "error").mockImplementation(() => undefined);
	vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("a throw that is not the stored project's moves nothing", () => {
	it("on the studio's first render, before anything was restored", () => {
		seedDevice({ id: "p", title: "healthy.ts" }, [{ id: "q", title: "other.ts" }]);
		const before = storageSnapshot();
		probe.always = true;

		boot();

		expect(screen.getByRole("alert").textContent).toContain("Reload to pick up where you left off");
		expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
		expect(storageSnapshot()).toEqual(before);
		expect(useNoticeStore.getState().notices).toHaveLength(0);
	});

	it("from a #share= link whose project throws", () => {
		seedDevice({ id: "p", title: "healthy.ts" }, [{ id: "q", title: "other.ts" }]);
		const draftBefore = window.localStorage.getItem(DRAFT_STORAGE_KEY);
		probe.failsOn.add("shared.ts");
		window.history.replaceState(null, "", new URL(encodeShareLink(project("shared.ts"))).hash);

		boot({ withShareLoader: true });

		expect(screen.getByRole("alert").textContent).toContain("Reload to pick up where you left off");
		expect(window.localStorage.getItem(RECOVERY_STORAGE_KEY)).toBeNull();
		expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(draftBefore);
		const titles = readLocalProjects().projects.map((record) => record.project.title);
		expect(titles).toEqual(expect.arrayContaining(["healthy.ts", "other.ts"]));
	});

	it("from an edit, which the studio does not write on its way out", () => {
		seedDevice({ id: "p", title: "healthy.ts" }, []);
		boot();
		expect(screen.getByTestId("title").textContent).toBe("healthy.ts");
		const before = storageSnapshot();
		probe.failsOn.add("edited.ts");

		act(() => useSnippetStore.getState().setTitle("edited.ts"));

		expect(screen.getByRole("alert").textContent).toContain("Reload to pick up where you left off");
		expect(storageSnapshot()).toEqual(before);
	});

	it("six boots of a shell bug that throws on every render", () => {
		seedDevice({ id: "p", title: "work.ts" }, [{ id: "q", title: "other.ts" }]);
		const before = storageSnapshot();
		probe.always = true;

		for (let visit = 0; visit < 6; visit++) {
			boot();
			expect(screen.getByRole("alert")).toBeTruthy();
		}

		expect(storageSnapshot()).toEqual(before);
	});
});

describe("a throw once the stored project is restored", () => {
	it("sets aside exactly the active project, keeps the others, opens a fresh one and says so", () => {
		seedDevice({ id: "p", title: "poisoned.ts" }, [
			{ id: "q", title: "other.ts" },
			{ id: "r", title: "third.ts" },
		]);
		probe.failsOn.add("poisoned.ts");

		boot();

		// The default project is open: not the error screen.
		expect(screen.queryByRole("alert")).toBeNull();
		expect(screen.getByTestId("title").textContent).toBe(DEFAULT_TITLE);
		// Kept under its own id, as the library held it and as the draft held it.
		const kept = readKeptProjects();
		expect(kept.map((entry) => entry.id)).toEqual(["p"]);
		expect(kept[0]?.project?.title).toBe("poisoned.ts");
		expect(kept[0]?.draft).toBe(JSON.stringify(project("poisoned.ts")));
		// The library lost that one entry and nothing else; a fresh project is open.
		const library = readLocalProjects();
		const titles = library.projects.map((record) => record.project.title);
		expect(titles).toEqual(expect.arrayContaining(["other.ts", "third.ts"]));
		expect(titles).not.toContain("poisoned.ts");
		expect(library.activeId).not.toBeNull();
		expect(["p", "q", "r"]).not.toContain(library.activeId);
		// Nothing left where the next boot would replay it.
		expect(window.localStorage.getItem(DRAFT_STORAGE_KEY) ?? "").not.toContain("poisoned.ts");
		// One line, one action.
		const notices = useNoticeStore.getState().notices;
		expect(notices.map((notice) => notice.message)).toEqual([RECOVERY_NOTICE]);
		expect(RECOVERY_NOTICE).toBe("The last project could not be opened; it was kept.");
		expect(notices[0]?.action?.label).toBe("Download it");
	});

	it("the next boot opens the studio without a word", () => {
		seedDevice({ id: "p", title: "poisoned.ts" }, []);
		probe.failsOn.add("poisoned.ts");
		boot();
		useNoticeStore.setState({ notices: [] });

		boot();

		expect(screen.getByTestId("title").textContent).toBe(DEFAULT_TITLE);
		expect(useNoticeStore.getState().notices).toHaveLength(0);
		expect(readKeptProjects().map((entry) => entry.id)).toEqual(["p"]);
	});

	it("six boots of a bug that throws on any restored work lose nothing: one slot per project, none evicted", () => {
		seedDevice({ id: "p", title: "work-0.ts" }, [{ id: "q", title: "other.ts" }]);
		const failing = (title: string) => title.startsWith("work-");
		for (let visit = 0; visit < 6; visit++) {
			probe.failsOn = new Set(Array.from({ length: 6 }, (_, i) => `work-${i}.ts`));
			if (visit > 0) {
				// The person works in the fresh project the last visit opened.
				workInActiveProject(`work-${visit}.ts`);
			}
			boot();
			expect(screen.queryByRole("alert")).toBeNull();
		}

		const kept = readKeptProjects();
		expect(kept).toHaveLength(6);
		expect(new Set(kept.map((entry) => entry.id)).size).toBe(6);
		expect(kept.map((entry) => entry.project?.title).sort()).toEqual(
			Array.from({ length: 6 }, (_, i) => `work-${i}.ts`),
		);
		expect(kept.every((entry) => failing(entry.project?.title ?? ""))).toBe(true);
		expect(readLocalProjects().projects.map((record) => record.project.title)).toContain(
			"other.ts",
		);
	});

	it("moves nothing when the default project throws too, and offers Reload", () => {
		seedDevice({ id: "p", title: "poisoned.ts" }, [{ id: "q", title: "other.ts" }]);
		probe.failsOn.add("poisoned.ts");
		probe.defaultFailsAfterOpen = true;

		boot();

		expect(screen.getByRole("alert").textContent).toContain("Reload to pick up where you left off");
		expect(window.localStorage.getItem(RECOVERY_STORAGE_KEY)).toBeNull();
		expect(readLocalProjects().activeId).toBe("p");
		expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toContain("poisoned.ts");
		expect(useNoticeStore.getState().notices).toHaveLength(0);
	});

	it("leaves the project in place when it cannot be copied aside, and offers it as a download, not a reload", () => {
		seedDevice({ id: "p", title: "poisoned.ts" }, [{ id: "q", title: "other.ts" }]);
		probe.failsOn.add("poisoned.ts");
		const setItem = Storage.prototype.setItem;
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
			this: Storage,
			key: string,
			value: string,
		) {
			if (key === RECOVERY_STORAGE_KEY) {
				throw new DOMException("full", "QuotaExceededError");
			}
			setItem.call(this, key, value);
		});

		boot();

		const alert = screen.getByRole("alert");
		expect(alert.textContent).toContain("The last project could not be opened");
		expect(alert.textContent).not.toContain("Reload to pick up");
		expect(screen.queryByRole("button", { name: "Reload" })).toBeNull();
		expect(screen.getByRole("button", { name: "Download it" })).toBeTruthy();
		expect(readLocalProjects().activeId).toBe("p");
		expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toContain("poisoned.ts");
		expect(useNoticeStore.getState().notices).toHaveLength(0);
	});
});

describe("Download it", () => {
	it("saves the kept project as the studio's JSON, which opens again", async () => {
		const saved: Blob[] = [];
		const names: string[] = [];
		Object.assign(URL, {
			createObjectURL: vi.fn((blob: Blob) => {
				saved.push(blob);
				return "blob:kept";
			}),
			revokeObjectURL: vi.fn(),
		});
		vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
			this: HTMLAnchorElement,
		) {
			names.push(this.download);
		});
		seedDevice({ id: "p", title: "poisoned.ts" }, []);
		probe.failsOn.add("poisoned.ts");
		boot();

		const [notice] = useNoticeStore.getState().notices;
		act(() => notice?.action?.onSelect());

		expect(names).toEqual(["poisoned.ts.json"]);
		const json = await readBlob(saved[0]);
		expect(JSON.parse(json ?? "")).toMatchObject(project("poisoned.ts"));
		probe.failsOn.clear();
		useSnippetStore.getState().importFromJson(json ?? "");
		expect(useSnippetStore.getState().snippet.title).toBe("poisoned.ts");
	});

	it("stays on screen until it is dismissed: it is the way back to the project", () => {
		vi.useFakeTimers();
		try {
			seedDevice({ id: "p", title: "poisoned.ts" }, []);
			probe.failsOn.add("poisoned.ts");
			boot();
			act(() => {
				vi.advanceTimersByTime(10 * 60_000);
			});
			expect(useNoticeStore.getState().notices.map((notice) => notice.message)).toEqual([
				RECOVERY_NOTICE,
			]);
		} finally {
			vi.useRealTimers();
		}
	});
});

it("the error screen's Download button is the screen's one action", () => {
	seedDevice({ id: "p", title: "poisoned.ts" }, []);
	probe.failsOn.add("poisoned.ts");
	vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
		throw new DOMException("full", "QuotaExceededError");
	});
	const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
	Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() });

	boot();
	fireEvent.click(screen.getByRole("button", { name: "Download it" }));

	expect(click).toHaveBeenCalledTimes(1);
});
