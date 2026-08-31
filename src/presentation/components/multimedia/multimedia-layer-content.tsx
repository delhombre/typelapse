import type {
	CodeLayerVisual,
	TextLayerVisual,
} from "../../../application/render/scene-layer-visuals";
import { FrameChrome } from "../preview/frame-chrome";

interface MultimediaTextLayerContentProps {
	readonly text: string;
	readonly visual: TextLayerVisual;
}

export function MultimediaTextLayerContent({ text, visual }: MultimediaTextLayerContentProps) {
	return (
		<div
			data-text-layer=""
			style={{
				display: "flex",
				width: "100%",
				height: "100%",
				alignItems: "center",
				justifyContent: visual.justifyContent,
				fontFamily: visual.fontFamily,
				fontSize: visual.fontSize,
				fontWeight: visual.fontWeight,
				lineHeight: visual.lineHeight,
				letterSpacing: visual.letterSpacing,
				color: visual.color,
				textAlign: visual.textAlign,
				whiteSpace: "pre-wrap",
				overflow: "hidden",
			}}
		>
			{text}
		</div>
	);
}

interface MultimediaCodeLayerContentProps {
	readonly blockId: string;
	readonly code: string;
	readonly language: string;
	readonly showLineNumbers: boolean;
	readonly lineNumberStart: number;
	readonly projectTitle: string;
	readonly visual: CodeLayerVisual;
}

export function MultimediaCodeLayerContent({
	blockId,
	code,
	language,
	showLineNumbers,
	lineNumberStart,
	projectTitle,
	visual,
}: MultimediaCodeLayerContentProps) {
	const lines = code.split("\n");
	const codeFont = {
		fontFamily: visual.fontFamily,
		fontSize: visual.fontSize,
		lineHeight: visual.lineHeight,
	} as const;
	return (
		<div
			data-code-layer=""
			data-code-theme={visual.themeName}
			style={{
				display: "flex",
				flexDirection: "column",
				width: "100%",
				height: "100%",
				overflow: "hidden",
				borderRadius: visual.borderRadius,
				background: visual.background,
				color: visual.foreground,
				boxShadow: visual.boxShadow,
			}}
		>
			<FrameChrome chrome={visual.chrome} title={projectTitle} foreground={visual.foreground} />
			<div
				data-code-body=""
				style={{
					display: "flex",
					flex: 1,
					minHeight: 0,
					boxSizing: "border-box",
					overflow: "hidden",
					padding: visual.framePadding,
					whiteSpace: "pre",
					...codeFont,
				}}
			>
				{showLineNumbers ? (
					<div
						aria-hidden="true"
						data-code-line-numbers=""
						style={{
							flex: "0 0 auto",
							paddingRight: visual.lineNumberGap,
							textAlign: "right",
							color: visual.lineNumberColor,
							...codeFont,
						}}
					>
						{lines.map((_, index) => (
							<div key={`${blockId}-line-${index + 1}`}>{lineNumberStart + index}</div>
						))}
					</div>
				) : null}
				<pre
					data-language={language}
					style={{
						margin: 0,
						minWidth: 0,
						overflow: "hidden",
						whiteSpace: "pre",
						...codeFont,
					}}
				>
					{code}
				</pre>
			</div>
		</div>
	);
}
