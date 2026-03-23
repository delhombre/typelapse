import type { Theme } from "@/domain/entities/theme";
import { useEffect, useMemo, useRef } from "react";

interface CodeFrameProps {
	html: string;
	theme: Theme;
	showWindowChrome?: boolean;
	title?: string;
	paddingOverride?: number;
	showCursor?: boolean;
	showLineNumbers?: boolean;
}

/** Count lines from raw HTML (count <br> and newlines in code) */
function countLines(html: string): number {
	// Count newlines in the code content (rough estimate from HTML)
	const stripped = html.replace(/<[^>]*>/g, "");
	return Math.max(stripped.split("\n").length, 1);
}

export function CodeFrame({
	html,
	theme,
	showWindowChrome = true,
	title,
	paddingOverride,
	showCursor = false,
	showLineNumbers = true,
}: CodeFrameProps) {
	const padding = paddingOverride ?? theme.padding;
	const codeRef = useRef<HTMLDivElement>(null);

	const displayHtml = showCursor ? `${html}<span class="typing-cursor"></span>` : html;
	const lineCount = useMemo(() => countLines(html), [html]);

	// Smooth auto-scroll to bottom during typing
	// biome-ignore lint/correctness/useExhaustiveDependencies: displayHtml triggers re-scroll when content changes
	useEffect(() => {
		if (!showCursor) {
			return;
		}
		const el = codeRef.current;
		if (!el) {
			return;
		}
		if (el.scrollHeight > el.clientHeight) {
			el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
		}
	}, [showCursor, displayHtml]);

	const lineNumberColor = `${theme.foreground}20`;

	return (
		<div
			className="code-frame-glow overflow-hidden"
			style={{ background: theme.background, borderRadius: theme.borderRadius }}
		>
			{/* macOS window chrome */}
			{showWindowChrome && (
				<div
					className="flex items-center gap-2 px-4 py-3"
					style={{ borderBottom: `1px solid ${theme.foreground}08` }}
				>
					<div className="size-[11px] rounded-full bg-[#ff5f57]" />
					<div className="size-[11px] rounded-full bg-[#febc2e]" />
					<div className="size-[11px] rounded-full bg-[#28c840]" />
					{title && (
						<span
							className="ml-2 font-mono text-[11px] tracking-tight"
							style={{ color: `${theme.foreground}35` }}
						>
							{title}
						</span>
					)}
				</div>
			)}

			{/* Code content with line numbers */}
			<div
				ref={codeRef}
				className="flex overflow-auto"
				style={{
					maxHeight: "50vh",
					scrollBehavior: "smooth",
				}}
			>
				{/* Line numbers gutter */}
				{showLineNumbers && (
					<div
						className="shrink-0 select-none text-right"
						style={{
							fontFamily: theme.fontFamily,
							fontSize: theme.fontSize,
							lineHeight: "1.625",
							color: lineNumberColor,
							padding: `${showWindowChrome ? 0 : padding}px ${8}px ${padding}px ${padding}px`,
							paddingTop: showWindowChrome ? 0 : padding,
						}}
						aria-hidden="true"
					>
						{Array.from({ length: lineCount }, (_, i) => (
							<div key={`ln-${i + 1}`}>{i + 1}</div>
						))}
					</div>
				)}

				{/* Code */}
				<div
					className="min-w-0 flex-1 leading-relaxed [&_pre]:m-0! [&_pre]:bg-transparent! [&_pre]:whitespace-pre-wrap! [&_pre]:wrap-break-word! [&_code]:bg-transparent!"
					style={{
						color: theme.foreground,
						fontFamily: theme.fontFamily,
						fontSize: theme.fontSize,
						padding: `${showWindowChrome ? 0 : padding}px ${padding}px ${padding}px ${showLineNumbers ? 0 : padding}px`,
					}}
					// biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki output is trusted
					dangerouslySetInnerHTML={{ __html: displayHtml }}
				/>
			</div>
		</div>
	);
}
