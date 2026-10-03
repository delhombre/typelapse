import { type InputHTMLAttributes, useState } from "react";

export const MIN_SCENE_SECONDS = 0.4;
export const MAX_SCENE_SECONDS = 10;

type NativeInputProps = Omit<
	InputHTMLAttributes<HTMLInputElement>,
	"type" | "min" | "max" | "step" | "value" | "defaultValue" | "onChange" | "onBlur"
>;

/**
 * Scene length in seconds. The field keeps its own draft while focused: a
 * controlled number input snaps back to the stored value on every rejected
 * keystroke, so typing "0.5" or "15" over a selection used to die on the first
 * character ("0" rejected, or "1" applied and then "15" silently dropped).
 * Valid drafts apply live; leaving the field clamps an out-of-range number and
 * restores an empty one.
 */
export function SceneDurationInput({
	durationMs,
	onCommit,
	...props
}: NativeInputProps & {
	durationMs: number;
	onCommit: (durationMs: number) => void;
}) {
	const [draft, setDraft] = useState<string | null>(null);
	return (
		<input
			{...props}
			type="number"
			min={MIN_SCENE_SECONDS}
			max={MAX_SCENE_SECONDS}
			step={0.1}
			value={draft ?? durationMs / 1000}
			onChange={(event) => {
				const raw = event.target.value;
				setDraft(raw);
				const next = Number.parseFloat(raw);
				if (Number.isFinite(next) && next >= MIN_SCENE_SECONDS && next <= MAX_SCENE_SECONDS) {
					onCommit(Math.round(next * 1000));
				}
			}}
			onBlur={() => {
				const next = draft === null ? Number.NaN : Number.parseFloat(draft);
				if (Number.isFinite(next)) {
					const clamped = Math.min(Math.max(next, MIN_SCENE_SECONDS), MAX_SCENE_SECONDS);
					const clampedMs = Math.round(clamped * 1000);
					if (clampedMs !== durationMs) {
						onCommit(clampedMs);
					}
				}
				setDraft(null);
			}}
		/>
	);
}
