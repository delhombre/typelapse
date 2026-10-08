/**
 * What the product does, on one sheet, under the measured proof (the Manual
 * direction's table, decision 2026-10-08-landing-pipeline D1). Every row is a
 * fact the code ships today, each with where it lives, so a row that stops
 * being true is a row someone can find:
 *
 * - Import: `classifySource` (pull request, commit, compare, release, file URL,
 *   unified diff, snippet).
 * - Look: the seven `Theme` presets; `ChromeVariant` (macOS, browser, terminal,
 *   none); `Backdrop` (mesh, solid, gradients, image).
 * - Motion: the magic-move engine, typewriter, `focus/line-ranges` + focus zoom,
 *   captions, tempo, `audio/tick-synth`.
 * - Check: `social/safe-zones` (TikTok, Reels, Shorts, X, LinkedIn).
 * - On device: the worker's formats, `RESOLUTION_TIERS`, the five aspects.
 * - Hosted: the Remotion path bakes captions and audio; projects kept per account.
 * - Licence: the repository opens under AGPL-3.0 (decision 2026-10-04 D1, `LICENSE`).
 */
const ROWS: [string, string][] = [
	[
		"Import",
		"A GitHub pull request, commit, compare, release or file link; a unified diff; a snippet",
	],
	["Look", "7 themes, 4 window chromes, mesh, solid, gradient and image backdrops"],
	["Motion", "Token morph, typewriter, line focus and zoom, captions, tempo, key ticks"],
	["Check", "TikTok, Reels, Shorts, X and LinkedIn previews, with their safe zones"],
	["On device", "MP4, WebM, GIF, PNG; 1080p, 1440p, 4K; 16:9, 1:1, 4:5, 3:4, 9:16"],
	["Hosted", "Captions and audio baked into the file; projects kept in your account"],
	["Licence", "AGPL-3.0; a commercial licence on request"],
];

export function SpecSheet() {
	return (
		<div className="lp-spec-sheet">
			<h3 className="lp-eyebrow">Specification</h3>
			<dl>
				{ROWS.map(([term, detail]) => (
					<div key={term}>
						<dt>{term}</dt>
						<dd>{detail}</dd>
					</div>
				))}
			</dl>
		</div>
	);
}
