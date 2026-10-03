import { TEMPLATE_CATALOG } from "@/application/templates/catalog";
import { useSceneDeletion } from "@/presentation/hooks/use-scene-deletion";
import { studioHistory } from "@/presentation/stores/project-history.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("useSceneDeletion", () => {
	beforeEach(() => {
		const project = TEMPLATE_CATALOG[0]?.project;
		if (!project) {
			throw new Error("The template catalog must contain a project");
		}
		useSnippetStore.getState().importFromJson(JSON.stringify(project));
		vi.useFakeTimers();
	});

	afterEach(() => vi.useRealTimers());

	it("keeps a deleted scene recoverable however long the user waits", () => {
		const { result } = renderHook(() => useSceneDeletion());
		const removed = useSnippetStore.getState().snippet.steps[2];
		if (!removed) {
			throw new Error("The template must contain three scenes");
		}

		act(() => result.current.deleteScene(removed, 2));
		act(() => {
			vi.advanceTimersByTime(60_000);
		});

		expect(result.current.pendingDeletion?.step.id).toBe(removed.id);
		let restored = false;
		act(() => {
			restored = result.current.undoDeletion();
		});
		expect(restored).toBe(true);
		expect(useSnippetStore.getState().snippet.steps[2]?.id).toBe(removed.id);
	});

	it("undoes a deletion through the project history, so redo deletes it again", () => {
		const { result } = renderHook(() => useSceneDeletion());
		const removed = useSnippetStore.getState().snippet.steps[1];
		if (!removed) {
			throw new Error("The template must contain two scenes");
		}

		act(() => result.current.deleteScene(removed, 1));
		act(() => {
			result.current.undoDeletion();
		});
		expect(useSnippetStore.getState().snippet.steps[1]?.id).toBe(removed.id);

		act(() => {
			studioHistory.redo();
		});
		expect(useSnippetStore.getState().snippet.steps.map((step) => step.id)).not.toContain(
			removed.id,
		);
	});

	it("lets the deletion go once another edit has been made after it", () => {
		const { result } = renderHook(() => useSceneDeletion());
		const removed = useSnippetStore.getState().snippet.steps[1];
		if (!removed) {
			throw new Error("The template must contain two scenes");
		}

		act(() => result.current.deleteScene(removed, 1));
		act(() => {
			useSnippetStore.getState().setTitle("Edited after the deletion");
		});
		let restored = true;
		act(() => {
			restored = result.current.undoDeletion();
		});

		expect(restored).toBe(false);
		expect(useSnippetStore.getState().snippet.title).toBe("Edited after the deletion");
	});
});
