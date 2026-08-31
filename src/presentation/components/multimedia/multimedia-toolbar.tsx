import type { ComponentType } from "react";
import { AspectRatioSquare, ColorSwatch, Frame, Music, Repeat, WandSparkle } from "reicon-react";

interface ToolButtonProps {
	readonly label: string;
	readonly icon: ComponentType<{ size?: number | string; "aria-hidden"?: boolean }>;
	readonly onClick: () => void;
	readonly disabled?: boolean;
	readonly active?: boolean;
}

function ToolButton({
	label,
	icon: Icon,
	onClick,
	disabled = false,
	active = false,
}: ToolButtonProps) {
	return (
		<button
			type="button"
			className="mm-tool-button"
			aria-pressed={active}
			data-active={active ? "" : undefined}
			disabled={disabled}
			onClick={onClick}
		>
			<Icon size={17} aria-hidden={true} />
			<span>{label}</span>
		</button>
	);
}

export interface MultimediaToolbarProps {
	readonly onOpenScene: () => void;
	readonly onOpenLook: () => void;
	readonly onAddAudio: () => void;
	readonly onOpenMotion: () => void;
	readonly onOpenFormat: () => void;
	readonly onToggleLoop: () => void;
	readonly onExport: () => void;
	readonly activePanel?: "scene" | "look" | "motion" | "format" | null;
	readonly loop?: boolean;
	readonly aspectLabel: string;
	readonly exportDisabled?: boolean;
}

/** One calm instrument for picture decisions. Creation lives in Add source. */
export function MultimediaToolbar({
	onOpenScene,
	onOpenLook,
	onAddAudio,
	onOpenMotion,
	onOpenFormat,
	onToggleLoop,
	onExport,
	activePanel = null,
	loop = false,
	aspectLabel,
	exportDisabled = false,
}: MultimediaToolbarProps) {
	return (
		<nav className="mm-toolbar" aria-label="Studio controls">
			<div className="mm-toolbar-group">
				<ToolButton
					label="Frame"
					icon={Frame}
					onClick={onOpenScene}
					active={activePanel === "scene"}
				/>
				<ToolButton
					label="Look"
					icon={ColorSwatch}
					onClick={onOpenLook}
					active={activePanel === "look"}
				/>
				<ToolButton
					label="Motion"
					icon={WandSparkle}
					onClick={onOpenMotion}
					active={activePanel === "motion"}
				/>
				<ToolButton label="Loop" icon={Repeat} onClick={onToggleLoop} active={loop} />
				<ToolButton label="Sound" icon={Music} onClick={onAddAudio} />
				<ToolButton
					label={aspectLabel}
					icon={AspectRatioSquare}
					onClick={onOpenFormat}
					active={activePanel === "format"}
				/>
			</div>
			<button
				type="button"
				className="mm-export-button"
				disabled={exportDisabled}
				onClick={onExport}
			>
				<span>Export</span>
			</button>
		</nav>
	);
}
