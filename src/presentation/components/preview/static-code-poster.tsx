import type { Theme } from "@/domain/entities/theme";
import { shikiAdapter } from "@/infrastructure/highlighting/highlighter";
import {
	highlightCacheKey,
	highlightOnce,
	readHighlight,
} from "@/presentation/utils/highlight-cache";
import { memo, useEffect, useReducer } from "react";

interface StaticCodePosterProps {
	code: string;
	language: string;
	themeName: string;
	theme: Theme;
	fontSize: number;
	lineHeightRatio: number;
	padding: number;
	lineNumbers?: boolean;
	/** Keep syntax work out of a parent surface's entrance animation. */
	highlightDelayMs?: number;
}

/**
 * Cheap first paint for code previews.
 *
 * A static Shiki tree is enough while a Showcase card rests. The substantially
 * heavier token-morph plan is mounted only after the user asks to explore that
 * card. Raw code is present synchronously, then syntax colour replaces it from
 * the shared highlight cache without changing the frame's geometry.
 */
export const StaticCodePoster = memo(function StaticCodePoster({
	code,
	language,
	themeName,
	theme,
	fontSize,
	lineHeightRatio,
	padding,
	lineNumbers = false,
	highlightDelayMs = 0,
}: StaticCodePosterProps) {
	const cacheKey = highlightCacheKey(themeName, language, code);
	const [, onHighlighted] = useReducer((revision: number) => revision + 1, 0);
	const html = readHighlight(cacheKey);
	// Shiki makes standalone code blocks keyboard-scrollable. Inside a decorative
	// card image the outer card already owns focus, so that tabindex would create
	// an invisible second stop beneath aria-hidden content.
	const decorativeHtml = html?.replaceAll(' tabindex="0"', "");

	useEffect(() => {
		if (html !== undefined) {
			return;
		}
		let cancelled = false;
		const timeout = window.setTimeout(() => {
			highlightOnce(cacheKey, () => shikiAdapter.highlight(code, language, themeName))
				.then(() => {
					if (!cancelled) {
						onHighlighted();
					}
				})
				.catch(() => undefined);
		}, highlightDelayMs);
		return () => {
			cancelled = true;
			window.clearTimeout(timeout);
		};
	}, [cacheKey, code, highlightDelayMs, html, language, themeName]);

	const style = {
		padding,
		fontFamily: theme.fontFamily,
		fontSize,
		lineHeight: `${fontSize * lineHeightRatio}px`,
		color: theme.foreground,
	};

	return (
		<div
			aria-hidden="true"
			className="showcase-static-code"
			data-line-numbers={lineNumbers ? "" : undefined}
			style={style}
		>
			{decorativeHtml === undefined ? (
				<pre>
					<code>
						{code.split("\n").map((line, index) => (
							<span className="line" key={`poster-line-${index + 1}`}>
								{line || " "}
							</span>
						))}
					</code>
				</pre>
			) : (
				<div
					// biome-ignore lint/security/noDangerouslySetInnerHtml: trusted output from our Shiki instance
					dangerouslySetInnerHTML={{ __html: decorativeHtml }}
				/>
			)}
		</div>
	);
});
