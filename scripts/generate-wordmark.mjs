/**
 * Generates the single-SVG <LogoWordmark> markup for Typelapse.
 *
 * The wordmark is ONE svg, with no runtime font dependency:
 *   - the play-head mark (a fixed 24-unit design, see logomark.tsx) verbatim, and
 *   - "Typelapse" set in Newsreader, where every LETTER is a <path> extracted
 *     from the font. This is the mnemos technique: the glyph outlines are emitted
 *     in font units and flipped/scaled into the SVG with `scale(S, -S)` (the -S
 *     is the font-units-Y-up -> SVG-Y-down flip). Everything is currentColor, so
 *     the shipped component is pure geometry — portable, themeable, no webfont.
 *
 * The font is fetched from Google Fonts at build time (never committed) and
 * cached under node_modules/.cache. Run:
 *
 *     node scripts/generate-wordmark.mjs
 *
 * It prints the metrics used (auditable) and the ready-to-paste SVG inner markup.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as fontkit from "fontkit";

/* ──────────── Composition constants ──────────── */

const TEXT = "Typelapse";
/** Target cap height in the final coordinate system (the mark's 24-unit box). */
const FINAL_CAP_HEIGHT = 13;
/**
 * Effective whitespace between the play glyph TIP (x=18.8 — the stroke's right
 * vertex 17.8 plus its 1-unit half-width, see MARK below) and the text's start, in
 * final units — textX = tip + gap. Measured from the tip, not the mark's 24-unit
 * box edge, so the box's dead right margin doesn't push the lettering away and the
 * lockup reads as one object (art-director calibrated).
 */
const TIP_TO_TEXT_GAP = 5;
/** The mark's vertical centre — the play glyph and the record dot both centre here. */
const PLAY_HEAD_CENTER = 12;
/** Padding baked into the tight viewBox (final units). */
const PAD = 1;

/**
 * The mark is a fixed 24-unit design (logomark.tsx): a monoline play glyph (a
 * stroked rounded triangle, right vertex at x=17.8) plus a filled record dot. With
 * a 2-unit stroke the visible content occupies roughly x:[3.1,18.8], y:[6.2,17.8]
 * (contentRight = tip 17.8 + half-stroke 1). The SVG keeps the mark's native 0..24
 * box on the LEFT (boxLeft = 0) so the wordmark's mark matches the standalone
 * Logomark's left spacing; the other edges are cropped tight to content below.
 */
const MARK = { boxLeft: 0, contentRight: 18.8, contentTop: 6.2, contentBottom: 17.8 };

/* ──────────── Font acquisition (Google Fonts, curl UA -> truetype) ──────────── */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_DIR = join(ROOT, "node_modules", ".cache", "typelapse-wordmark");
const TTF_PATH = join(CACHE_DIR, "newsreader.ttf");
const CSS_URL = "https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,500";

/**
 * Google Fonts serves woff2 to modern browsers but `format('truetype')` (a static
 * .ttf) to plain clients like curl. We grep the .ttf out of the CSS and download
 * it, replicating curl's default User-Agent so we get the truetype cut.
 */
function ensureFont() {
	if (existsSync(TTF_PATH)) {
		return;
	}
	mkdirSync(CACHE_DIR, { recursive: true });
	const css = execFileSync("curl", ["-s", CSS_URL]).toString();
	const match = css.match(/https:\/\/[^\s)]+\.ttf/);
	if (!match) {
		throw new Error(`No truetype URL found in Google Fonts CSS:\n${css}`);
	}
	const ttf = execFileSync("curl", ["-s", match[0]]);
	writeFileSync(TTF_PATH, ttf);
}

/* ──────────── Number formatting ──────────── */

/** Round to `decimals` places and drop trailing zeros for tidy markup. */
function num(value, decimals) {
	return Number.parseFloat(value.toFixed(decimals)).toString();
}

/* ──────────── Generation ──────────── */

function main() {
	ensureFont();

	const base = fontkit.openSync(TTF_PATH);

	// Prefer the opsz=72 display cut. Google's curl-UA path serves a static
	// instance (no fvar), so getVariation throws — we fall back to the default.
	let font = base;
	let variationNote = "getVariation({ opsz: 72, wght: 500 }) applied";
	try {
		font = base.getVariation({ opsz: 72, wght: 500 });
	} catch (error) {
		variationNote = `getVariation unavailable (${error.message}) — using default instance`;
	}

	const { unitsPerEm, capHeight } = font;
	const s = FINAL_CAP_HEIGHT / capHeight;
	const baselineY = PLAY_HEAD_CENTER + FINAL_CAP_HEIGHT / 2;
	const textX = MARK.contentRight + TIP_TO_TEXT_GAP;

	const run = font.layout(TEXT);
	const glyphs = [];
	let penX = 0;
	const bounds = {
		minX: MARK.boxLeft,
		maxX: MARK.contentRight,
		minY: MARK.contentTop,
		maxY: MARK.contentBottom,
	};

	for (let i = 0; i < run.glyphs.length; i++) {
		const glyph = run.glyphs[i];
		const pos = run.positions[i];
		const drawX = penX + (pos.xOffset ?? 0);
		const glyphX = drawX * s;
		glyphs.push({ name: glyph.name ?? String(glyph.id), d: glyph.path.toSVG(), glyphX });

		// Absolute bounds of this glyph in final coords (y flipped, baseline at baselineY).
		const box = glyph.bbox;
		bounds.minX = Math.min(bounds.minX, textX + glyphX + box.minX * s);
		bounds.maxX = Math.max(bounds.maxX, textX + glyphX + box.maxX * s);
		bounds.minY = Math.min(bounds.minY, baselineY - box.maxY * s);
		bounds.maxY = Math.max(bounds.maxY, baselineY - box.minY * s);

		penX += pos.xAdvance;
	}

	// Tight viewBox: mark box on the left, content + PAD elsewhere.
	const vbMinX = MARK.boxLeft;
	const vbMinY = num(bounds.minY - PAD, 2);
	const vbW = num(bounds.maxX + PAD - vbMinX, 2);
	const vbH = num(bounds.maxY + PAD - (bounds.minY - PAD), 2);
	const viewBox = `${vbMinX} ${vbMinY} ${vbW} ${vbH}`;

	const scale = `${num(s, 9)} -${num(s, 9)}`;
	const letterPaths = glyphs
		.map(
			(g) =>
				`  <path\n    d="${g.d}"\n    transform="translate(${num(g.glyphX, 4)} 0) scale(${scale})"\n  />`,
		)
		.join("\n");

	const markup = `{/* Play glyph — a monoline stroked rounded triangle, verbatim from logomark.tsx */}
<path
  d="M9.5 7.2L17.8 12L9.5 16.8Z"
  stroke="currentColor"
  strokeWidth="2"
  strokeLinecap="round"
  strokeLinejoin="round"
  fill="none"
/>
{/* Record point — the filled accent dot */}
<circle cx="4.8" cy="12" r="1.7" fill="currentColor" />
{/* Lettering — "Typelapse" in Newsreader, each glyph a font-extracted path */}
<g fill="currentColor" transform="translate(${num(textX, 4)} ${num(baselineY, 4)})">
${letterPaths}
</g>`;

	/* ──────────── Report ──────────── */

	console.log("─".repeat(64));
	console.log("Typelapse wordmark — generation metrics");
	console.log("─".repeat(64));
	console.log(`font           : ${font.postscriptName}`);
	console.log(`variation      : ${variationNote}`);
	console.log(`unitsPerEm     : ${unitsPerEm}`);
	console.log(`capHeight      : ${capHeight}  (-> ${FINAL_CAP_HEIGHT} final units)`);
	console.log(`scale S        : ${s}`);
	console.log(`baselineY      : ${baselineY}`);
	console.log(`textX (tip+gap): ${textX}  (tip ${MARK.contentRight} + gap ${TIP_TO_TEXT_GAP})`);
	console.log(`total advance  : ${penX} font units  (-> ${num(penX * s, 3)} final units)`);
	console.log(`glyph count    : ${glyphs.length}  [${glyphs.map((g) => g.name).join(" ")}]`);
	console.log(
		`content bounds : x[${num(bounds.minX, 3)}, ${num(bounds.maxX, 3)}]  y[${num(bounds.minY, 3)}, ${num(bounds.maxY, 3)}]`,
	);
	console.log(`viewBox        : ${viewBox}`);
	console.log("─".repeat(64));
	console.log("Ready-to-paste SVG inner markup:");
	console.log("─".repeat(64));
	console.log(`viewBox="${viewBox}"`);
	console.log(markup);
	console.log("─".repeat(64));
}

main();
