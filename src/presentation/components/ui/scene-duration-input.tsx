import { type InputHTMLAttributes, type KeyboardEvent, useState } from "react";

export const MIN_SCENE_SECONDS = 0.4;
export const MAX_SCENE_SECONDS = 10;

type NativeInputProps = Omit<
	InputHTMLAttributes<HTMLInputElement>,
	| "type"
	| "inputMode"
	| "enterKeyHint"
	| "min"
	| "max"
	| "step"
	| "value"
	| "defaultValue"
	| "onChange"
	| "onBlur"
	| "onKeyDown"
>;

/** A typed length in seconds; a decimal comma counts, as a French keyboard types it. */
function parseSeconds(raw: string): number {
	return Number.parseFloat(raw.replace(",", "."));
}

function clampSeconds(seconds: number): number {
	return Math.min(Math.max(seconds, MIN_SCENE_SECONDS), MAX_SCENE_SECONDS);
}

/**
 * Scene length in seconds. The field keeps its own draft while focused: a
 * controlled number input snaps back to the stored value on every rejected
 * keystroke, so typing "0.5" or "15" over a selection used to die on the first
 * character ("0" rejected, or "1" applied and then "15" silently dropped).
 * Valid drafts apply live; leaving the field clamps an out-of-range number and
 * restores an empty one.
 *
 * A text field rather than a number input: Chrome hands a number input's value
 * to the accessibility tree as a 32-bit float, so a 1.2 s scene was announced
 * as 1.2000000476837158. The arrow keys keep the stepping a number input had.
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
			type="text"
			inputMode="decimal"
			enterKeyHint="done"
			autoComplete="off"
			spellCheck={false}
			value={draft ?? String(durationMs / 1000)}
			onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
				if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
					return;
				}
				event.preventDefault();
				const current = draft === null ? durationMs / 1000 : parseSeconds(draft);
				const base = Number.isFinite(current) ? current : durationMs / 1000;
				const step = (event.shiftKey ? 1 : 0.1) * (event.key === "ArrowUp" ? 1 : -1);
				const nextMs = Math.round(clampSeconds(base + step) * 1000);
				setDraft(null);
				if (nextMs !== durationMs) {
					onCommit(nextMs);
				}
			}}
			onChange={(event) => {
				const raw = event.target.value;
				setDraft(raw);
				const next = parseSeconds(raw);
				if (Number.isFinite(next) && next >= MIN_SCENE_SECONDS && next <= MAX_SCENE_SECONDS) {
					onCommit(Math.round(next * 1000));
				}
			}}
			onBlur={() => {
				const next = draft === null ? Number.NaN : parseSeconds(draft);
				if (Number.isFinite(next)) {
					const clampedMs = Math.round(clampSeconds(next) * 1000);
					if (clampedMs !== durationMs) {
						onCommit(clampedMs);
					}
				}
				setDraft(null);
			}}
		/>
	);
}
