import {
	DEFAULT_SCENE_TRANSITION_DURATION_MS,
	MAX_SCENE_DURATION_MS,
	MAX_SCENE_TRANSITION_DURATION_MS,
	MIN_SCENE_DURATION_MS,
	MIN_SCENE_TRANSITION_DURATION_MS,
} from "@/application/project/scene-authoring";
import type { Scene, SceneTransition, SceneTransitionKind } from "@/domain/entities/scene";
import { useId } from "react";
import { X } from "reicon-react";
import "./multimedia-scene-inspector.css";

const TRANSITION_OPTIONS = [
	{ kind: "cut", label: "Cut", description: "Immediate" },
	{ kind: "crossfade", label: "Crossfade", description: "Soft blend" },
	{ kind: "magic-move", label: "Morph", description: "Shared motion" },
] as const satisfies readonly {
	readonly kind: SceneTransitionKind;
	readonly label: string;
	readonly description: string;
}[];

export interface MultimediaSceneInspectorProps {
	readonly scene: Scene;
	/** Zero-based final position in the project timeline. */
	readonly sceneIndex: number;
	readonly sceneCount: number;
	readonly onDurationChange: (durationMs: number) => void;
	readonly onTransitionChange: (transition: SceneTransition) => void;
	readonly onMovePrevious?: () => void;
	readonly onMoveNext?: () => void;
	readonly onClose?: () => void;
	readonly disabled?: boolean;
	readonly className?: string;
}

function secondsValue(durationMs: number): string {
	return String(durationMs / 1_000);
}

function millisecondsFromInput(value: string): number | null {
	if (value.trim() === "") {
		return null;
	}
	const milliseconds = Math.round(Number(value) * 1_000);
	return Number.isSafeInteger(milliseconds) ? milliseconds : null;
}

function inside(value: number, minimum: number, maximum: number): boolean {
	return value >= minimum && value <= maximum;
}

function transitionDuration(scene: Scene): number {
	if (scene.transitionOut && scene.transitionOut.kind !== "cut") {
		return scene.transitionOut.durationMs;
	}
	return DEFAULT_SCENE_TRANSITION_DURATION_MS;
}

export function MultimediaSceneInspector({
	scene,
	sceneIndex,
	sceneCount,
	onDurationChange,
	onTransitionChange,
	onMovePrevious,
	onMoveNext,
	onClose,
	disabled = false,
	className,
}: MultimediaSceneInspectorProps) {
	const durationId = useId();
	const transitionDurationId = useId();
	const transitionName = useId();
	const hasNextScene = sceneIndex < sceneCount - 1;
	const currentKind = scene.transitionOut?.kind ?? "cut";
	const currentTransitionDuration = transitionDuration(scene);
	const transitionControlsDisabled = disabled || !hasNextScene;
	const canMovePrevious = !disabled && sceneIndex > 0 && onMovePrevious !== undefined;
	const canMoveNext = !disabled && sceneIndex < sceneCount - 1 && onMoveNext !== undefined;

	const chooseTransition = (kind: SceneTransitionKind) => {
		if (transitionControlsDisabled) {
			return;
		}
		onTransitionChange({
			kind,
			durationMs: kind === "cut" ? 0 : currentTransitionDuration,
		});
	};

	return (
		<section
			className={["mm-scene-inspector", className].filter(Boolean).join(" ")}
			aria-label={`Scene ${sceneIndex + 1} timing`}
		>
			<header className="mm-scene-inspector-header">
				<div>
					<p className="mm-scene-inspector-eyebrow">Rhythm</p>
					<h2>Scene timing</h2>
				</div>
				<div className="mm-scene-inspector-header-actions">
					<span className="mm-scene-inspector-position">
						Scene {sceneIndex + 1} of {sceneCount}
					</span>
					{onClose ? (
						<button type="button" aria-label="Close scene timing" onClick={onClose}>
							<X size={15} aria-hidden="true" />
						</button>
					) : null}
				</div>
			</header>

			<div className="mm-scene-inspector-body">
				<label className="mm-scene-inspector-field" htmlFor={durationId}>
					<span className="mm-scene-inspector-label">Scene duration</span>
					<span className="mm-scene-inspector-number">
						<input
							id={durationId}
							aria-label="Scene duration"
							type="number"
							inputMode="decimal"
							min={MIN_SCENE_DURATION_MS / 1_000}
							max={MAX_SCENE_DURATION_MS / 1_000}
							step={0.1}
							value={secondsValue(scene.durationMs)}
							disabled={disabled}
							onChange={(event) => {
								const milliseconds = millisecondsFromInput(event.currentTarget.value);
								if (
									milliseconds !== null &&
									inside(milliseconds, MIN_SCENE_DURATION_MS, MAX_SCENE_DURATION_MS)
								) {
									onDurationChange(milliseconds);
								}
							}}
						/>
						<span aria-hidden="true">s</span>
					</span>
					<small>How long the scene stays fully readable.</small>
				</label>

				<fieldset className="mm-scene-inspector-field mm-scene-inspector-transition">
					<legend className="mm-scene-inspector-label">Outgoing transition</legend>
					<div className="mm-scene-inspector-segmented">
						{TRANSITION_OPTIONS.map((option) => (
							<label key={option.kind} data-selected={currentKind === option.kind}>
								<input
									type="radio"
									aria-label={option.label}
									name={transitionName}
									value={option.kind}
									checked={currentKind === option.kind}
									disabled={transitionControlsDisabled}
									onChange={() => chooseTransition(option.kind)}
								/>
								<span>{option.label}</span>
								<small>{option.description}</small>
							</label>
						))}
					</div>
				</fieldset>

				<label className="mm-scene-inspector-field" htmlFor={transitionDurationId}>
					<span className="mm-scene-inspector-label">Transition duration</span>
					<span className="mm-scene-inspector-number">
						<input
							id={transitionDurationId}
							aria-label="Transition duration"
							type="number"
							inputMode="decimal"
							min={MIN_SCENE_TRANSITION_DURATION_MS / 1_000}
							max={MAX_SCENE_TRANSITION_DURATION_MS / 1_000}
							step={0.05}
							value={secondsValue(currentTransitionDuration)}
							disabled={transitionControlsDisabled || currentKind === "cut"}
							onChange={(event) => {
								const milliseconds = millisecondsFromInput(event.currentTarget.value);
								if (
									currentKind !== "cut" &&
									milliseconds !== null &&
									inside(
										milliseconds,
										MIN_SCENE_TRANSITION_DURATION_MS,
										MAX_SCENE_TRANSITION_DURATION_MS,
									)
								) {
									onTransitionChange({ kind: currentKind, durationMs: milliseconds });
								}
							}}
						/>
						<span aria-hidden="true">s</span>
					</span>
					{!hasNextScene ? (
						<small>Add another scene to create an outgoing transition.</small>
					) : (
						<small>Shorter feels crisp; longer feels cinematic.</small>
					)}
				</label>
			</div>

			{onMovePrevious || onMoveNext ? (
				<footer className="mm-scene-inspector-footer" aria-label="Scene order">
					<button type="button" disabled={!canMovePrevious} onClick={onMovePrevious}>
						<span aria-hidden="true">←</span> Move scene earlier
					</button>
					<button type="button" disabled={!canMoveNext} onClick={onMoveNext}>
						Move scene later <span aria-hidden="true">→</span>
					</button>
				</footer>
			) : null}
		</section>
	);
}
