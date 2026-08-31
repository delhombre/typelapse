import type { UpdateLayerPlacementPatch } from "@/application/project/multimedia-authoring";
import type { BlockPlacement } from "@/domain/entities/block";
import type { ChangeEvent } from "react";
import { ArrowDown, ArrowDownSquare, ArrowUp, ArrowUpSquare } from "reicon-react";

function percent(value: number): number {
	return Math.round(value * 1_000) / 10;
}

function normalized(event: ChangeEvent<HTMLInputElement>): number | null {
	const value = Number(event.currentTarget.value);
	return Number.isFinite(value) ? value / 100 : null;
}

export interface LayerPlacementControlsProps {
	readonly placement: Readonly<BlockPlacement>;
	readonly onPatch: (patch: UpdateLayerPlacementPatch) => void;
}

/** Resolution-independent geometry controls shared by every visual layer. */
export function LayerPlacementControls({ placement, onPatch }: LayerPlacementControlsProps) {
	const controls = [
		{ key: "x", label: "X position (%)", shortLabel: "X", value: placement.x, min: 0 },
		{ key: "y", label: "Y position (%)", shortLabel: "Y", value: placement.y, min: 0 },
		{ key: "width", label: "Width (%)", shortLabel: "W", value: placement.width, min: 5 },
		{ key: "height", label: "Height (%)", shortLabel: "H", value: placement.height, min: 5 },
	] as const;
	return (
		<fieldset className="mm-control-section mm-field-wide">
			<legend>Layout</legend>
			<div className="mm-placement-grid">
				{controls.map((control) => (
					<label key={control.key} className="mm-compact-number">
						<span aria-hidden="true">{control.shortLabel}</span>
						<input
							type="number"
							aria-label={control.label}
							min={control.min}
							max={100}
							step={0.1}
							value={percent(control.value)}
							onChange={(event) => {
								const value = normalized(event);
								if (value !== null) onPatch({ [control.key]: value });
							}}
						/>
						<span aria-hidden="true">%</span>
					</label>
				))}
			</div>
		</fieldset>
	);
}

export interface LayerOrderControlsProps {
	readonly index: number;
	readonly count: number;
	readonly onOrder: (action: "forward" | "backward" | "front" | "back") => void;
}

/** Back-to-front stack operations; unavailable moves are disabled, not hidden. */
export function LayerOrderControls({ index, count, onOrder }: LayerOrderControlsProps) {
	const atBack = index <= 0;
	const atFront = index >= count - 1;
	return (
		<fieldset className="mm-control-section mm-field-wide">
			<legend>Layer order</legend>
			<div className="mm-order-grid">
				<button
					type="button"
					aria-label="Send to back"
					disabled={atBack}
					onClick={() => onOrder("back")}
				>
					<ArrowDownSquare size={15} aria-hidden="true" />
					<span>Back</span>
				</button>
				<button
					type="button"
					aria-label="Send backward"
					disabled={atBack}
					onClick={() => onOrder("backward")}
				>
					<ArrowDown size={15} aria-hidden="true" />
					<span>Backward</span>
				</button>
				<button
					type="button"
					aria-label="Bring forward"
					disabled={atFront}
					onClick={() => onOrder("forward")}
				>
					<ArrowUp size={15} aria-hidden="true" />
					<span>Forward</span>
				</button>
				<button
					type="button"
					aria-label="Bring to front"
					disabled={atFront}
					onClick={() => onOrder("front")}
				>
					<ArrowUpSquare size={15} aria-hidden="true" />
					<span>Front</span>
				</button>
			</div>
		</fieldset>
	);
}
