import { focusLineSet } from "@/application/focus/line-ranges";
import { frameLineCount } from "@/application/magic-move/engine";
import { zoomForFocus } from "@/application/magic-move/focus-zoom";
import { StudioBootGuard } from "@/presentation/components/layout/studio-boot-guard";
import { StudioPersistence } from "@/presentation/components/layout/studio-persistence";
import { RouteErrorBoundary } from "@/presentation/components/ui/route-error-boundary";
import { useExportStore } from "@/presentation/stores/export.store";
import { useNoticeStore } from "@/presentation/stores/notice.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { LOCAL_PROJECTS_STORAGE_KEY } from "@/presentation/utils/local-project-storage";
import {
	RECOVERY_NOTICE,
	RECOVERY_STORAGE_KEY,
	readKeptProjects,
} from "@/presentation/utils/studio-recovery";
import { DRAFT_STORAGE_KEY } from "@/presentation/utils/studio-storage-keys";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The boot guard: a stored project that throws the studio is set aside, not
 * replayed on every reload (#185). The studio below is the real persistence
 * restore plus a probe that throws on the project the test calls poisoned,
 * which is what the preview did with a focus range it could not spread.
 */

const FIVE_LINES = "a();\nb();\nc();\nd();\ne();";

/** A draft in the format main wrote, with a focus range no screen could survive. */
function mainDraft(overrides: Record<string, unknown> = {}): string {
	return JSON.stringify({
		title: "poisoned.ts",
		code: FIVE_LINES,
		language: "typescript",
		themeName: "nord",
		background: "mesh:ocean",
		steps: [{ id: "one", code: FIVE_LINES, duration: 1_000, focus: "1-1000000" }],
		...overrides,
	});
}

/** What the preview does with each step's spotlight, on the store's own state. */
function PreviewProbe({ failsOn }: { failsOn?: string }) {
	const snippet = useSnippetStore((s) => s.snippet);
	if (failsOn && snippet.title === failsOn) {
		throw new Error(`The studio cannot draw ${failsOn}`);
	}
	for (const step of snippet.steps) {
		zoomForFocus(
			focusLineSet(step.highlightRanges, frameLineCount(step.code)),
			frameLineCount(step.code),
		);
	}
	return <p data-testid="title">{snippet.title}</p>;
}

function Studio({ failsOn, bootWindowMs }: { failsOn?: string; bootWindowMs?: number }) {
	return (
		<RouteErrorBoundary>
			<StudioBootGuard bootWindowMs={bootWindowMs}>
				<StudioPersistence />
				<PreviewProbe failsOn={failsOn} />
			</StudioBootGuard>
		</RouteErrorBoundary>
	);
}

beforeEach(() => {
	window.localStorage.clear();
	window.location.hash = "";
	useSnippetStore.setState(useSnippetStore.getInitialState(), true);
	useExportStore.setState(useExportStore.getInitialState(), true);
	useNoticeStore.setState({ notices: [] });
	vi.spyOn(console, "error").mockImplementation(() => undefined);
	vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("the boot guard", () => {
	it("opens a project saved with a focus range of 1-1000000: the range is clamped, nothing is set aside", () => {
		window.localStorage.setItem(DRAFT_STORAGE_KEY, mainDraft());

		render(<Studio />);

		expect(screen.getByTestId("title").textContent).toBe("poisoned.ts");
		const [range] = useSnippetStore.getState().snippet.steps[0]?.highlightRanges ?? [];
		expect([range?.startLine, range?.endLine]).toEqual([1, 5]);
		expect(screen.queryByRole("alert")).toBeNull();
		expect(window.localStorage.getItem(RECOVERY_STORAGE_KEY)).toBeNull();
		expect(useNoticeStore.getState().notices).toHaveLength(0);
	});

	it("sets a project that throws the studio aside, starts the default one and says so once", () => {
		const poisoned = mainDraft();
		window.localStorage.setItem(DRAFT_STORAGE_KEY, poisoned);

		render(<Studio failsOn="poisoned.ts" />);

		// The default project is open, and the studio is not the error screen.
		expect(screen.queryByRole("alert")).toBeNull();
		expect(screen.getByTestId("title").textContent).toBe(
			useSnippetStore.getInitialState().snippet.title,
		);
		// The poisoned payload is under the recovery key, byte for byte.
		const kept = readKeptProjects();
		expect(kept).toHaveLength(1);
		expect(kept[0]?.draft).toBe(poisoned);
		// The library the restore had already mirrored it into goes with it.
		expect(kept[0]?.projects).toContain("poisoned.ts");
		expect(window.localStorage.getItem(LOCAL_PROJECTS_STORAGE_KEY) ?? "").not.toContain(
			"poisoned.ts",
		);
		// It is no longer where the next boot would find it.
		expect(window.localStorage.getItem(DRAFT_STORAGE_KEY) ?? "").not.toContain("poisoned.ts");
		// One line, in the notice surface.
		const notices = useNoticeStore.getState().notices;
		expect(notices.map((notice) => notice.message)).toEqual([RECOVERY_NOTICE]);
		expect(RECOVERY_NOTICE).toBe("The last project could not be opened; it was kept.");
	});

	it("does not take a failure after the boot window for the stored project's", () => {
		window.localStorage.setItem(DRAFT_STORAGE_KEY, mainDraft());

		render(<Studio failsOn="poisoned.ts" bootWindowMs={-1} />);

		expect(screen.getByRole("alert").textContent).toContain("Reload to pick up where you left off");
		expect(window.localStorage.getItem(RECOVERY_STORAGE_KEY)).toBeNull();
		expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toContain("poisoned.ts");
	});

	it("stops after one recovery, and an error screen that does not promise a reload helps", () => {
		window.localStorage.setItem(DRAFT_STORAGE_KEY, mainDraft());
		const defaultTitle = useSnippetStore.getInitialState().snippet.title;

		// The default project fails too: there is nothing left to fall back on.
		render(<Studio failsOn={defaultTitle} />);

		const alert = screen.getByRole("alert");
		expect(alert.textContent).toContain("The last project could not be opened; it was kept");
		expect(alert.textContent).not.toContain("Reload to pick up where you left off");
		expect(readKeptProjects()).toHaveLength(1);
	});
});
