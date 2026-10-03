import { TEMPLATE_CATALOG } from "@/application/templates/catalog";
import { useSceneDeletion } from "@/presentation/hooks/use-scene-deletion";
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
});
