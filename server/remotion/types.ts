/** Shared types between server and Remotion composition */

export interface StepData {
	code: string;
	duration: number; // ms
}

export interface ThemeData {
	name: string;
	background: string;
	foreground: string;
	fontFamily: string;
	fontSize: number;
	padding: number;
	borderRadius: number;
}

export interface RenderInput {
	title: string;
	language: string;
	theme: ThemeData;
	steps: StepData[];
	background: string;
	framePadding: number;
	/** Pre-highlighted HTML for each step */
	stepHtmlFrames: string[];
	/** Duration of crossfade transition between steps in video frames */
	transitionDurationFrames: number;
	/** Optional watermark text overlay */
	watermark?: string;
}
