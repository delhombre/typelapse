import { Theme } from "@/domain/entities/theme";
import type { ReactNode } from "react";
import { EngineFrames } from "./engine-frames";

/* The flat artefact: a near-black card holding the engine, with no gradient, no
   grain and no drop shadow. The mesh version of this object already exists in
   the landing; this is the other half of the argument, sampled off the two sites
   Bruno called beautiful, where a single unlit near-black rectangle on a plain
   page does all the work. */

export const CARD_THEME = Theme.midnight();

/** macOS-ish window chrome, drawn rather than imported, at the size the real
    product uses. Kept optional: a frame with no chrome reads as a video still,
    a frame with chrome reads as an editor. */
function Chrome({ title }: { title: string }) {
	return (
		<div className="proto-card-chrome">
			<span className="proto-card-dots" aria-hidden="true">
				<i />
				<i />
				<i />
			</span>
			<span className="proto-card-title">{title}</span>
		</div>
	);
}

export function CodeCard({
	frames,
	holds,
	title,
	theme = CARD_THEME,
	fontSize = 15,
	lineNumbers = true,
	loop = true,
	className,
	ariaLabel,
	children,
}: {
	frames: string[];
	holds: number[];
	/** Omit for a bare frame with no window chrome. */
	title?: string;
	/** A light theme for the cards that sit on paper rather than on the dark. */
	theme?: Theme;
	fontSize?: number;
	lineNumbers?: boolean;
	loop?: boolean;
	className?: string;
	ariaLabel: string;
	children?: ReactNode;
}) {
	return (
		<div className={className ? `proto-artefact ${className}` : "proto-artefact"}>
			{title && <Chrome title={title} />}
			<div className="proto-card-body">
				<EngineFrames
					frames={frames}
					holds={holds}
					theme={theme}
					fontSize={fontSize}
					lineNumbers={lineNumbers}
					loop={loop}
					ariaLabel={ariaLabel}
				/>
			</div>
			{children}
		</div>
	);
}
