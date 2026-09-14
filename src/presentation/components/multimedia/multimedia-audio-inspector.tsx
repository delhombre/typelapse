import type { SelectedAudioAsset } from "@/application/project/audio-cue-authoring";
import type { AudioCue, AudioCuePatch } from "@/domain/entities/audio-cue";
import { StudioTooltip, StudioTooltipProvider } from "@/presentation/components/ui/studio-tooltip";
import { useId } from "react";
import { Soundwave, Trash, X } from "reicon-react";
import "./multimedia-audio-inspector.css";

const WAVEFORM_BARS = [
	{ id: "a", height: 5 },
	{ id: "b", height: 9 },
	{ id: "c", height: 13 },
	{ id: "d", height: 7 },
	{ id: "e", height: 17 },
	{ id: "f", height: 11 },
	{ id: "g", height: 6 },
	{ id: "h", height: 14 },
	{ id: "i", height: 9 },
	{ id: "j", height: 5 },
	{ id: "k", height: 12 },
	{ id: "l", height: 7 },
] as const;

export interface MultimediaAudioInspectorProps {
	readonly className?: string;
	readonly cue: AudioCue;
	readonly asset: SelectedAudioAsset;
	/** Current global timeline duration, used as a deliberate placement bound. */
	readonly timelineDurationMs: number;
	readonly canDelete?: boolean;
	readonly onPatch: (patch: AudioCuePatch) => void;
	readonly onDelete: () => void;
	readonly onClose: () => void;
}

interface MillisecondFieldProps {
	readonly label: string;
	readonly valueMs: number;
	readonly minMs: number;
	readonly maxMs: number;
	readonly onChange: (valueMs: number) => void;
}

function seconds(ms: number): number {
	return ms / 1_000;
}

function preciseSeconds(ms: number): string {
	return seconds(ms).toLocaleString("en-US", {
		minimumFractionDigits: 1,
		maximumFractionDigits: 1,
	});
}

function MillisecondField({ label, valueMs, minMs, maxMs, onChange }: MillisecondFieldProps) {
	const inputId = useId();
	const safeMaxMs = Math.max(minMs, maxMs, valueMs);
	return (
		<label className="mai-time-field" htmlFor={inputId}>
			<span>{label}</span>
			<span className="mai-number-shell">
				<input
					id={inputId}
					aria-label={label}
					type="number"
					inputMode="decimal"
					min={seconds(minMs)}
					max={seconds(safeMaxMs)}
					step={0.001}
					value={seconds(valueMs)}
					onChange={(event) => {
						const nextMs = Math.round(event.currentTarget.valueAsNumber * 1_000);
						if (!Number.isSafeInteger(nextMs) || nextMs < minMs || nextMs > safeMaxMs) return;
						onChange(nextMs);
					}}
				/>
				<span aria-hidden="true">s</span>
			</span>
		</label>
	);
}

/** Controlled inspector for one authored audio occurrence. It owns no project state. */
export function MultimediaAudioInspector({
	className,
	cue,
	asset,
	timelineDurationMs,
	canDelete = true,
	onPatch,
	onDelete,
	onClose,
}: MultimediaAudioInspectorProps) {
	const volumeId = useId();
	const sourceDurationMs = asset.metadata.durationMs;
	const maxFadeInMs = Math.max(0, cue.durationMs - cue.fadeOutMs);
	const maxFadeOutMs = Math.max(0, cue.durationMs - cue.fadeInMs);
	const timelineBoundMs = Math.max(0, cue.startMs, timelineDurationMs);

	return (
		<section
			className={["mai-inspector", className].filter(Boolean).join(" ")}
			aria-label="Audio properties"
		>
			<header className="mai-header">
				<div className="mai-title-lockup">
					<span className="mai-symbol" aria-hidden="true">
						<Soundwave size={17} />
					</span>
					<div>
						<p className="mai-eyebrow">Audio cue</p>
						<h2 title={asset.metadata.fileName}>{asset.metadata.fileName}</h2>
					</div>
				</div>
				<StudioTooltipProvider>
					<div className="mai-actions">
						<StudioTooltip content="Delete audio cue" side="left">
							<button
								type="button"
								className="mai-icon-button mai-danger"
								aria-label="Delete audio cue"
								disabled={!canDelete}
								onClick={onDelete}
							>
								<Trash size={16} aria-hidden="true" />
							</button>
						</StudioTooltip>
						<StudioTooltip content="Close audio properties" side="left">
							<button
								type="button"
								className="mai-icon-button"
								aria-label="Close audio properties"
								onClick={onClose}
							>
								<X size={16} aria-hidden="true" />
							</button>
						</StudioTooltip>
					</div>
				</StudioTooltipProvider>
			</header>

			<div className="mai-summary" aria-label="Audio cue summary">
				<span className="mai-wave" aria-hidden="true">
					{WAVEFORM_BARS.map((bar) => (
						<span key={bar.id} style={{ height: bar.height }} />
					))}
				</span>
				<strong>{preciseSeconds(cue.durationMs)} s clip</strong>
				<span>{preciseSeconds(sourceDurationMs)} s source</span>
			</div>

			<div className="mai-body">
				<fieldset className="mai-section">
					<legend>Timing</legend>
					<div className="mai-field-grid">
						<MillisecondField
							label="Timeline start"
							valueMs={cue.startMs}
							minMs={0}
							maxMs={timelineBoundMs}
							onChange={(startMs) => onPatch({ startMs })}
						/>
						<MillisecondField
							label="Source in"
							valueMs={cue.trim.startMs}
							minMs={0}
							maxMs={cue.trim.endMs - 1}
							onChange={(trimStartMs) => onPatch({ trimStartMs })}
						/>
						<MillisecondField
							label="Source out"
							valueMs={cue.trim.endMs}
							minMs={cue.trim.startMs + 1}
							maxMs={sourceDurationMs}
							onChange={(trimEndMs) => onPatch({ trimEndMs })}
						/>
					</div>
				</fieldset>

				<fieldset className="mai-section">
					<legend>Mix</legend>
					<label className="mai-volume" htmlFor={volumeId}>
						<span>
							<span>Volume</span>
							<output htmlFor={volumeId}>{Math.round(cue.gain * 100)}%</output>
						</span>
						<input
							id={volumeId}
							aria-label="Volume"
							type="range"
							min={0}
							max={100}
							step={1}
							value={Math.round(cue.gain * 100)}
							onChange={(event) => onPatch({ gain: event.currentTarget.valueAsNumber / 100 })}
						/>
					</label>
					<div className="mai-field-grid mai-fade-grid">
						<MillisecondField
							label="Fade in"
							valueMs={cue.fadeInMs}
							minMs={0}
							maxMs={maxFadeInMs}
							onChange={(fadeInMs) => onPatch({ fadeInMs })}
						/>
						<MillisecondField
							label="Fade out"
							valueMs={cue.fadeOutMs}
							minMs={0}
							maxMs={maxFadeOutMs}
							onChange={(fadeOutMs) => onPatch({ fadeOutMs })}
						/>
					</div>
				</fieldset>
			</div>
		</section>
	);
}
