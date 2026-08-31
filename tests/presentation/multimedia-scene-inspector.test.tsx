import {
	DEFAULT_SCENE_TRANSITION_DURATION_MS,
	MAX_SCENE_DURATION_MS,
	MAX_SCENE_TRANSITION_DURATION_MS,
	MIN_SCENE_DURATION_MS,
	MIN_SCENE_TRANSITION_DURATION_MS,
} from "@/application/project/scene-authoring";
import { TextBlock } from "@/domain/entities/block";
import { Scene } from "@/domain/entities/scene";
import { MultimediaSceneInspector } from "@/presentation/components/multimedia/multimedia-scene-inspector";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

function authoredScene(
	transitionOut?: Readonly<{
		kind: "cut" | "crossfade" | "magic-move";
		durationMs: number;
	}>,
) {
	return Scene.create({
		id: "scene-2",
		durationMs: 2_400,
		blocks: [
			TextBlock.create({
				id: "title",
				text: "A deliberate beat",
				typography: {
					fontFamily: "Geist",
					fontSize: 72,
					fontWeight: 650,
					color: "#fff",
					align: "center",
				},
			}),
		],
		...(transitionOut ? { transitionOut } : {}),
	});
}

afterEach(cleanup);

describe("MultimediaSceneInspector", () => {
	it("exposes a compact, labelled scene-rhythm form and emits duration changes in milliseconds", () => {
		const onDurationChange = vi.fn();

		render(
			<MultimediaSceneInspector
				scene={authoredScene({ kind: "crossfade", durationMs: 450 })}
				sceneIndex={1}
				sceneCount={3}
				onDurationChange={onDurationChange}
				onTransitionChange={vi.fn()}
			/>,
		);

		expect(screen.getByRole("region", { name: "Scene 2 timing" })).toBeTruthy();
		expect(screen.getByText("Scene 2 of 3")).toBeTruthy();
		const duration = screen.getByRole("spinbutton", { name: "Scene duration" });
		expect(duration).toHaveProperty("value", "2.4");
		expect(duration).toHaveProperty("min", String(MIN_SCENE_DURATION_MS / 1_000));
		expect(duration).toHaveProperty("max", String(MAX_SCENE_DURATION_MS / 1_000));

		fireEvent.change(duration, { target: { value: "3.2" } });

		expect(onDurationChange).toHaveBeenCalledWith(3_200);
	});

	it("emits transition kind and duration changes from native accessible controls", () => {
		const onTransitionChange = vi.fn();

		render(
			<MultimediaSceneInspector
				scene={authoredScene({ kind: "crossfade", durationMs: 650 })}
				sceneIndex={1}
				sceneCount={3}
				onDurationChange={vi.fn()}
				onTransitionChange={onTransitionChange}
			/>,
		);

		fireEvent.click(screen.getByRole("radio", { name: "Morph" }));
		expect(onTransitionChange).toHaveBeenLastCalledWith({
			kind: "magic-move",
			durationMs: 650,
		});

		fireEvent.change(screen.getByRole("spinbutton", { name: "Transition duration" }), {
			target: { value: "0.8" },
		});
		expect(onTransitionChange).toHaveBeenLastCalledWith({
			kind: "crossfade",
			durationMs: 800,
		});

		fireEvent.click(screen.getByRole("radio", { name: "Cut" }));
		expect(onTransitionChange).toHaveBeenLastCalledWith({ kind: "cut", durationMs: 0 });
	});

	it("uses the calm default duration when an untimed scene gains an animated transition", () => {
		const onTransitionChange = vi.fn();

		render(
			<MultimediaSceneInspector
				scene={authoredScene()}
				sceneIndex={0}
				sceneCount={2}
				onDurationChange={vi.fn()}
				onTransitionChange={onTransitionChange}
			/>,
		);

		fireEvent.click(screen.getByRole("radio", { name: "Crossfade" }));

		expect(onTransitionChange).toHaveBeenCalledWith({
			kind: "crossfade",
			durationMs: DEFAULT_SCENE_TRANSITION_DURATION_MS,
		});
	});

	it("publishes timing bounds and ignores invalid numeric drafts", () => {
		const onDurationChange = vi.fn();
		const onTransitionChange = vi.fn();

		render(
			<MultimediaSceneInspector
				scene={authoredScene({ kind: "magic-move", durationMs: 450 })}
				sceneIndex={0}
				sceneCount={2}
				onDurationChange={onDurationChange}
				onTransitionChange={onTransitionChange}
			/>,
		);

		const transitionDuration = screen.getByRole("spinbutton", {
			name: "Transition duration",
		});
		expect(transitionDuration).toHaveProperty(
			"min",
			String(MIN_SCENE_TRANSITION_DURATION_MS / 1_000),
		);
		expect(transitionDuration).toHaveProperty(
			"max",
			String(MAX_SCENE_TRANSITION_DURATION_MS / 1_000),
		);

		fireEvent.change(screen.getByRole("spinbutton", { name: "Scene duration" }), {
			target: { value: "0.1" },
		});
		fireEvent.change(transitionDuration, { target: { value: "9" } });

		expect(onDurationChange).not.toHaveBeenCalled();
		expect(onTransitionChange).not.toHaveBeenCalled();
	});

	it("disables outgoing transition controls on the final scene and explains why", () => {
		render(
			<MultimediaSceneInspector
				scene={authoredScene()}
				sceneIndex={2}
				sceneCount={3}
				onDurationChange={vi.fn()}
				onTransitionChange={vi.fn()}
			/>,
		);

		expect(screen.getByText("Add another scene to create an outgoing transition.")).toBeTruthy();
		expect(screen.getByRole("radio", { name: "Crossfade" })).toHaveProperty("disabled", true);
		expect(screen.getByRole("spinbutton", { name: "Transition duration" })).toHaveProperty(
			"disabled",
			true,
		);
	});

	it("offers bounded previous/next scene actions without requiring them", () => {
		const onMovePrevious = vi.fn();
		const onMoveNext = vi.fn();

		render(
			<MultimediaSceneInspector
				scene={authoredScene()}
				sceneIndex={1}
				sceneCount={3}
				onDurationChange={vi.fn()}
				onTransitionChange={vi.fn()}
				onMovePrevious={onMovePrevious}
				onMoveNext={onMoveNext}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Move scene earlier" }));
		fireEvent.click(screen.getByRole("button", { name: "Move scene later" }));

		expect(onMovePrevious).toHaveBeenCalledTimes(1);
		expect(onMoveNext).toHaveBeenCalledTimes(1);
	});
});
