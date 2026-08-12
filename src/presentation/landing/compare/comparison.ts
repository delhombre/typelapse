/**
 * The `/compare` spec sheet.
 *
 * Two rules hold this page up, and both are enforced by the types rather than by
 * good intentions:
 *
 * 1. **Every stated fact carries its source.** A `Cell` is either a `fact` with a
 *    `source`, or `undocumented` with the page we `checked`. There is no third
 *    shape, so a cell cannot be filled in from memory — the compiler asks for
 *    the link.
 * 2. **What we could not verify says so.** A vendor who does not publish a number
 *    gets `undocumented`, which prints "Not documented", never a dash and never a
 *    guess. A dash reads as "no"; only "no" may read as "no".
 *
 * Our own column cites this repository — the file that defines the constant, or
 * the commit that measured the number. Their columns cite their own public
 * pages. Nothing here is sourced to a review, a tweet, or our own testing of
 * their product: we report what each vendor documents about itself, and where
 * they document nothing we say that instead of filling the gap in our favour.
 *
 * Rows we lose, or tie, stay in. Snappify documents a Morph transition and a
 * TypeWriter transition; Snipcast documents more languages than our picker
 * names. Cutting those rows would make every other row worth less.
 *
 * Checked on the date in `COMPARISON_CHECKED_ON`. Corrections are a GitHub issue
 * away, and that invitation is printed on the page.
 */

export interface Source {
	/** What the reader sees: a filename, a commit subject, a page name. */
	readonly label: string;
	readonly href: string;
}

/** A checked fact, or an admission that the vendor does not document it. */
export type Cell =
	| {
			readonly kind: "fact";
			/** The short answer, in the reader's eye-line. */
			readonly value: string;
			/** The qualifier, when the short answer alone would overclaim. */
			readonly note?: string;
			readonly source: Source;
	  }
	| {
			readonly kind: "undocumented";
			/** Where we looked and did not find it. "Not documented" is a claim too,
			    so it is sourced like any other — the reader can check our reading. */
			readonly checked: Source;
			/** What their page says instead, when it says something adjacent. */
			readonly note?: string;
	  };

export interface Row {
	readonly id: string;
	readonly label: string;
	readonly typelapse: Cell;
	readonly snappify: Cell;
	readonly snipcast: Cell;
}

export interface RowGroup {
	readonly id: string;
	readonly title: string;
	readonly rows: readonly Row[];
}

export interface Product {
	readonly id: "typelapse" | "snappify" | "snipcast";
	readonly name: string;
	/** One neutral line under the column head. No adjectives. */
	readonly summary: string;
}

/* ──────────── Source helpers ──────────── */

const REPO = "https://github.com/delhombre/typelapse";

/** A file in this repository, on `main`. */
function ours(path: string): Source {
	return { label: path.split("/").pop() ?? path, href: `${REPO}/blob/main/${path}` };
}

/** A commit in this repository: the durable record of a measurement. */
function measured(sha: string, label: string): Source {
	return { label, href: `${REPO}/commit/${sha}` };
}

function theirs(label: string, href: string): Source {
	return { label, href };
}

function fact(value: string, source: Source, note?: string): Cell {
	return { kind: "fact", value, source, ...(note === undefined ? {} : { note }) };
}

/** "We looked at `checked` and it does not say." */
function undocumented(checked: Source, note?: string): Cell {
	return { kind: "undocumented", checked, ...(note === undefined ? {} : { note }) };
}

/* ──────────── Their pages ────────────
   Snipcast is at snipcast.dev. `snipcast.io` is an unrelated AI podcast tool,
   and several AI directories conflate the two — every Snipcast cell below was
   read off snipcast.dev itself, in a browser, because the site renders client
   side and serves an empty document to a plain fetch. */

const SNAPPIFY_PRICING = theirs("snappify pricing", "https://snappify.com/pricing");
const SNAPPIFY_VIDEO_DOCS = theirs(
	"snappify video-export docs",
	"https://snappify.com/docs/slides/video-export",
);
const SNAPPIFY_VIDEO_FEATURE = theirs(
	"snappify video export",
	"https://snappify.com/features/video-export",
);
const SNAPPIFY_BACKGROUND_DOCS = theirs(
	"snappify background docs",
	"https://snappify.com/docs/editor/background",
);
const SNAPPIFY_TRANSITION_DOCS = theirs(
	"snappify transition docs",
	"https://snappify.com/docs/slides/animations/code-editor",
);
const SNAPPIFY_DOCS = theirs("snappify docs", "https://snappify.com/docs/slides/getting-started");
const SNAPPIFY_TERMS = theirs("snappify terms", "https://snappify.com/legal/terms-of-service");
const SNAPPIFY_EDITOR = theirs("snappify editor", "https://snappify.com/editor");

const SNIPCAST_HOME = theirs("snipcast.dev", "https://snipcast.dev/");
const SNIPCAST_PRICING = theirs("snipcast pricing", "https://snipcast.dev/#pricing");
const SNIPCAST_TERMS = theirs("snipcast terms", "https://snipcast.dev/legal/terms-of-service");
const SNIPCAST_ANIMATE = theirs(
	"snipcast animate-code",
	"https://snipcast.dev/product/animate-code",
);
const SNIPCAST_SIGNIN = theirs("snipcast sign-in", "https://snipcast.dev/snips");

/* ──────────── Products ──────────── */

export const PRODUCTS: readonly Product[] = [
	{
		id: "typelapse",
		name: "Typelapse",
		summary: "Open source. Runs in your browser.",
	},
	{
		id: "snappify",
		name: "Snappify",
		summary: "Hosted editor. Video export in a desktop app.",
	},
	{
		id: "snipcast",
		name: "Snipcast",
		summary: "Hosted editor. One paid plan.",
	},
] as const;

/** The day every cell below was last checked against its source. */
export const COMPARISON_CHECKED_ON = "2026-08-12";

/* ──────────── The sheet ──────────── */

export const COMPARISON_GROUPS: readonly RowGroup[] = [
	{
		id: "terms",
		title: "Price and terms",
		rows: [
			{
				id: "price",
				label: "Price",
				typelapse: fact(
					"Free",
					ours("src/domain/value-objects/plan.ts"),
					"The open-source build runs with every limit off. There is no tier above it.",
				),
				snappify: fact(
					"$0 on the free plan",
					SNAPPIFY_PRICING,
					"Paid plans are $5, $9 and $32 a month, billed yearly.",
				),
				snipcast: fact(
					"$9 a month",
					SNIPCAST_PRICING,
					"$4 a month billed yearly. One plan, no free tier listed, after a two-week trial.",
				),
			},
			{
				id: "source",
				label: "Source code",
				typelapse: fact(
					"MIT, public",
					ours("LICENSE"),
					"The app you use is the repository you can read.",
				),
				snappify: fact(
					"Not published",
					SNAPPIFY_TERMS,
					"Proprietary software under seriouscode GmbH's terms.",
				),
				snipcast: fact(
					"Not published",
					SNIPCAST_TERMS,
					"“You may not copy, modify, or distribute any part of the Service without our written permission.”",
				),
			},
			{
				id: "account",
				label: "Account to use it",
				typelapse: fact(
					"Not required",
					ours("src/main.tsx"),
					"There is no sign-in in the app. The studio opens straight onto a template.",
				),
				snappify: undocumented(
					SNAPPIFY_EDITOR,
					"Their editor renders client side; we could not settle this from a public page.",
				),
				snipcast: fact(
					"A Google account",
					SNIPCAST_SIGNIN,
					"The sign-in screen offers one button: Continue with Google.",
				),
			},
			{
				id: "watermark",
				label: "Watermark on exports",
				typelapse: fact(
					"None",
					ours("src/domain/value-objects/plan.ts"),
					"You can add your own text if you want one.",
				),
				snappify: fact(
					"On the free plan",
					SNAPPIFY_VIDEO_DOCS,
					"“You can remove the watermark by upgrading to a paid plan.”",
				),
				snipcast: fact(
					"Yours, if you want one",
					SNIPCAST_HOME,
					"Documented as your own logo or handle. No forced watermark is documented.",
				),
			},
		],
	},
	{
		id: "video",
		title: "Making the video",
		rows: [
			{
				id: "where",
				label: "Where the video is made",
				typelapse: fact(
					"In your browser tab",
					ours("src/infrastructure/export/webcodecs-renderer.adapter.ts"),
					"WebCodecs in a worker. Your code is never uploaded.",
				),
				snappify: fact(
					"In a separate desktop app",
					SNAPPIFY_VIDEO_FEATURE,
					"“Video Exports are only available on the new snappify Desktop App.” The same page calls the feature experimental.",
				),
				snipcast: undocumented(
					SNIPCAST_HOME,
					"Exports are offered; where they are produced is not stated.",
				),
			},
			{
				id: "formats",
				label: "Export formats",
				typelapse: fact(
					"MP4, WebM, GIF",
					ours("src/domain/entities/render-config.ts"),
					"Plus PNG stills. In-browser export does not bake audio or captions yet.",
				),
				snappify: fact("MP4, GIF", SNAPPIFY_PRICING, "No WebM documented."),
				snipcast: undocumented(
					SNIPCAST_PRICING,
					"Listed as “Image and Video Exports”. No file format is named.",
				),
			},
			{
				id: "fps",
				label: "Frame rate",
				typelapse: fact(
					"60 fps",
					ours("src/domain/entities/render-config.ts"),
					"Not gated behind a plan. GIF caps at 50, and the app says so.",
				),
				snappify: fact(
					"30 fps free, 60 fps paid",
					SNAPPIFY_VIDEO_DOCS,
					"“60 fps is currently restricted for users on the Professional / Team plan.”",
				),
				snipcast: undocumented(SNIPCAST_HOME),
			},
			{
				id: "resolution",
				label: "Resolution",
				typelapse: fact(
					"1080p, 1440p, 4K",
					ours("src/domain/entities/render-config.ts"),
					"The tier names the short edge, so 4K is 3840×2160.",
				),
				snappify: fact(
					"A relative scale, 1 to 4",
					SNAPPIFY_PRICING,
					"No pixel resolution documented. Free is scale 1; Professional and Team are scale 4.",
				),
				snipcast: fact("“HD to 4K”", SNIPCAST_HOME, "No pixel dimensions documented."),
			},
			{
				id: "aspect",
				label: "Aspect ratios",
				typelapse: fact(
					"5 — 16:9, 1:1, 9:16, 4:5, 3:4",
					ours("src/domain/entities/render-config.ts"),
				),
				snappify: undocumented(
					SNAPPIFY_BACKGROUND_DOCS,
					"Presets named after social platforms, with no ratios given.",
				),
				snipcast: fact("3 — 16:9, 9:16, 1:1", SNIPCAST_HOME),
			},
			{
				id: "wysiwyg",
				label: "Preview matches the exported file",
				typelapse: fact(
					"Measured, and enforced",
					measured("95b2ec0", "fonts exist in the worker, or the export stops"),
					"Character advance drift 0.000000 across all five fonts. If a font ever disagrees with the preview, the export refuses to run rather than ship crooked.",
				),
				snappify: undocumented(SNAPPIFY_VIDEO_DOCS),
				snipcast: undocumented(SNIPCAST_HOME),
			},
		],
	},
	{
		id: "motion",
		title: "Motion",
		rows: [
			{
				id: "morph",
				label: "Token-level morph",
				typelapse: fact(
					"Yes",
					ours("src/application/magic-move/engine.ts"),
					"One engine lays out the tokens for the preview and for the exported file.",
				),
				snappify: fact(
					"Yes",
					SNAPPIFY_TRANSITION_DOCS,
					"Their Morph transition “will morph the old code into the new code, moving keywords and identifiers to their new position.”",
				),
				snipcast: fact(
					"Yes",
					SNIPCAST_HOME,
					"“Snipcast understands your code and creates smooth transitions between different code states.”",
				),
			},
			{
				id: "typewriter",
				label: "Typewriter",
				typelapse: fact("Yes", ours("src/application/magic-move/typewriter.ts")),
				snappify: fact(
					"Yes",
					SNAPPIFY_TRANSITION_DOCS,
					"“The TypeWriter effect will type out the code, character by character.”",
				),
				snipcast: undocumented(SNIPCAST_ANIMATE),
			},
			{
				id: "focus",
				label: "Focus dim and zoom",
				typelapse: fact(
					"Yes, animated",
					ours("src/application/magic-move/focus-zoom.ts"),
					"Unfocused code dims to 0.25 and the frame pushes in to 1.25×, over the transition.",
				),
				snappify: undocumented(SNAPPIFY_TRANSITION_DOCS),
				snipcast: undocumented(SNIPCAST_HOME),
			},
			{
				id: "backgrounds",
				label: "Animated backgrounds",
				typelapse: fact(
					"6 mesh gradients",
					ours("src/application/backgrounds/mesh-gradient.ts"),
					"Each loops seamlessly on a 16-second period, in the preview and in the file. Solids and images too.",
				),
				snappify: undocumented(
					SNAPPIFY_BACKGROUND_DOCS,
					"Their background doc covers a colour and an image.",
				),
				snipcast: undocumented(
					SNIPCAST_HOME,
					"Images, uploads and built-in gradients. No animation documented.",
				),
			},
			{
				id: "loop",
				label: "Seamless loop",
				typelapse: fact(
					"Yes, in the exported file",
					ours("src/application/export/video-script.ts"),
					"The video morphs its last frame back to its first, so a loop never hard-cuts. The studio preview does not play the loop-back.",
				),
				snappify: fact(
					"A loop flag on GIFs",
					SNAPPIFY_VIDEO_DOCS,
					"No last-to-first morph documented.",
				),
				snipcast: undocumented(SNIPCAST_HOME),
			},
		],
	},
	{
		id: "input",
		title: "Bringing code in",
		rows: [
			{
				id: "import",
				label: "Import a change",
				typelapse: fact(
					"A diff, or a GitHub PR or commit URL",
					ours("src/application/diff/chapters.ts"),
					"A pull request's commits become chapters, in order, up to 30.",
				),
				snappify: undocumented(SNAPPIFY_DOCS),
				snipcast: fact(
					"A snippet or a diff",
					SNIPCAST_HOME,
					"“Drop in a snippet or diff and Snipcast generates a step-by-step explainer video.” No pull-request import is documented.",
				),
			},
			{
				id: "themes",
				label: "Syntax themes",
				typelapse: fact("7", ours("src/domain/entities/theme.ts")),
				snappify: undocumented(SNAPPIFY_DOCS, "A theme dropdown, with no count given."),
				snipcast: undocumented(SNIPCAST_PRICING, "“All Code Themes”, with no count given."),
			},
			{
				id: "languages",
				label: "Languages",
				typelapse: fact(
					"22 in the picker",
					ours("src/presentation/components/editor/code-editor.tsx"),
					"The highlighter bundles more, but this repository counts only the 22 the picker names.",
				),
				snappify: undocumented(
					SNAPPIFY_DOCS,
					"Docs say the language is chosen by hand, with no count given.",
				),
				snipcast: fact("“50+”", SNIPCAST_HOME, "No list published."),
			},
		],
	},
	{
		id: "limits",
		title: "Limits",
		rows: [
			{
				id: "projects",
				label: "Saved projects",
				typelapse: fact(
					"No limit",
					ours("src/domain/value-objects/plan.ts"),
					"Projects live in your browser and in files you export.",
				),
				snappify: fact(
					"3 on the free plan",
					SNAPPIFY_PRICING,
					"Their snap storage limit. 500 on Starter, unlimited above it.",
				),
				snipcast: fact("Unlimited", SNIPCAST_PRICING, "On the one paid plan."),
			},
			{
				id: "views",
				label: "Views on a shared link",
				typelapse: fact(
					"Not counted",
					ours("src/application/project/project-payload.ts"),
					"A share link carries the project itself. There is no account and no server to meter it.",
				),
				snappify: fact(
					"100 a month on the free plan",
					SNAPPIFY_PRICING,
					"1,000 a month on Starter. The same limits apply to embeds.",
				),
				snipcast: undocumented(SNIPCAST_PRICING),
			},
		],
	},
] as const;
