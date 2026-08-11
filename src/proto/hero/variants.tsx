import { Instrument } from "@/presentation/landing/instrument";
import { Reveal, RevealGroup, RevealItem } from "@/presentation/landing/primitives";
import { GITHUB_URL } from "@/presentation/landing/tokens";
import { type ReactNode, useRef, useState } from "react";
import { Link } from "react-router-dom";

/* Three fusions of Console (diffshub: no headline, the tool's own field, real
   examples) and Index (pierre.computer: a mono text document, a categorical
   index, the block glyph).

   The joint between them is the glyph. pierre.computer prints `█` after its
   name as an ornament; in a tool that takes a paste, the same block is a real
   terminal caret. So the ornament becomes the cursor, and the index stops being
   a decorative list of facts and becomes the interface: what you can paste is
   not described beside the field, it *is* the field's own modes.

   Throwaway. Delete src/proto and the route in main.tsx once one wins. */

const EXAMPLES = [
	["github.com/oven-sh/bun/pull/14210", "3 files · +41 −12"],
	["github.com/vercel/next.js/pull/71102", "1 file · +18 −4"],
	["github.com/honojs/hono/pull/3488", "2 files · +26 −9"],
] as const;

const MODES = ["pull request", "diff", "snippet"] as const;

/** The block caret. Blinks only when the field is empty, and never under
    reduced motion — a cursor that blinks forever is the one animation a
    developer sees ten thousand times. */
function Caret({ idle }: { idle: boolean }) {
	return <span className="proto-caret" data-idle={idle ? "" : undefined} aria-hidden="true" />;
}

/* ═══════════ 1. Prompt ═══════════
   The whole hero is one shell session, and the prompt line is the product's
   input. No headline, no boxed field, no button: you are looking at a terminal
   that happens to accept a pull request, and the examples below are its history.
   The index rides underneath as one dim spec line, the way a man page ends. */

export function Prompt() {
	const [value, setValue] = useState("");

	return (
		<section className="proto-hero proto-prompt">
			<div className="proto-prompt-col">
				<RevealGroup immediate>
					<RevealItem>
						<p className="proto-prompt-name">
							TYPELAPSE <span aria-hidden="true">█</span>
						</p>
					</RevealItem>
					<RevealItem>
						<p className="proto-prompt-about">
							Renders a code change as a video. Paste a pull request; it morphs the diff token by
							token and exports for the feed.
						</p>
					</RevealItem>
					<RevealItem>
						{/* The prompt line is the field: a `$`, the caret, and nothing else.
						    A boxed input here would turn a session into a form. */}
						<label className="proto-prompt-line">
							<span className="proto-prompt-sigil" aria-hidden="true">
								$
							</span>
							<span className="proto-prompt-input">
								<input
									type="text"
									value={value}
									onChange={(e) => setValue(e.target.value)}
									placeholder="typelapse --from-pr "
									aria-label="Paste a pull request URL"
									spellCheck={false}
								/>
								<Caret idle={value.length === 0} />
							</span>
						</label>
					</RevealItem>
					<RevealItem>
						<ul className="proto-prompt-history">
							{EXAMPLES.map(([url, meta]) => (
								<li key={url}>
									<Link to="/app">{url}</Link>
									<span>{meta}</span>
								</li>
							))}
						</ul>
					</RevealItem>
					<RevealItem>
						<p className="proto-prompt-spec">
							IN snippet · diff · pull request &nbsp;&nbsp; OUT mp4 · webm · gif · png &nbsp;&nbsp;
							MIT ·{" "}
							<a href={GITHUB_URL} target="_blank" rel="noreferrer">
								source
							</a>
						</p>
					</RevealItem>
				</RevealGroup>
			</div>

			<Reveal immediate delay={0.24} className="proto-prompt-stage mt-11">
				<Instrument maxScale={1.3} />
			</Reveal>
		</section>
	);
}

/* ═══════════ 2. Desk ═══════════
   Keeps Console's boxed field, but the Index's "Imports" category stops being a
   list of facts beside it and becomes the field's own modes — three mono tabs
   the field answers to. The index is no longer something you read about the
   tool; it is how you drive it. The remaining categories collapse to one meta
   line under the examples. */

const PLACEHOLDERS: Record<(typeof MODES)[number], string> = {
	"pull request": "https://github.com/owner/repo/pull/1247",
	diff: "@@ -1,6 +1,10 @@",
	snippet: "const users = await db.users.all()",
};

/* The lead now opens on the name, in the weight that won the last pass: the
   head takes 600 and the ink, the rest stays 400 and ash. What varies between
   these three is only how much of the sentence the name is carrying — one
   word, one claim, or a standing introduction — so what is being compared is
   the writing, not the type.

   No dashes in any of them. The old line hung its second half off an em dash,
   which is the punctuation this project does not use. */
type Lead = "subject" | "claim" | "standing";

const LEADS: Record<Lead, ReactNode> = {
	/* A · the name is the subject. It does the work of the verb and nothing
	   more; the claim itself reads at the same weight as the rest. */
	subject: (
		<>
			<strong>Typelapse</strong> turns a code change into a video. Paste a pull request, a diff or a
			snippet. It morphs token by token and renders for the feed.
		</>
	),
	/* B · the name and its claim. The bold covers the whole first sentence, so
	   the name arrives already saying what it does. */
	claim: (
		<>
			<strong>Typelapse turns a code change into a video.</strong> Paste a pull request, a diff or a
			snippet. It morphs token by token and renders for the feed.
		</>
	),
	/* C · the name standing on its own, the way a spec sheet opens. The sentence
	   after it keeps the imperative the line has always had. */
	standing: (
		<>
			<strong>Typelapse.</strong> Turn a code change into a video. Paste a pull request, a diff or a
			snippet. It morphs token by token and renders for the feed.
		</>
	),
};

export function Desk({ lead = "subject" }: { lead?: Lead } = {}) {
	const [mode, setMode] = useState<(typeof MODES)[number]>("pull request");
	const [value, setValue] = useState("");
	/* The field sizes to its own content so the caret can stand at the end of it,
	   and an empty field's content is its placeholder — which would park the
	   caret after the example rather than where you are about to type. So the
	   example steps aside on focus and the caret takes its place. Nothing is
	   lost by it: the pastille above the field says what is expected. */
	const [focused, setFocused] = useState(false);
	/* And since it no longer spans the row, pressing the empty part of the field
	   has to put you in it — which is what an input filling the row used to do
	   for free. Only presses on the field itself: Render is in there too. */
	const field = useRef<HTMLInputElement>(null);

	return (
		<section className="proto-hero proto-desk" data-lead={lead}>
			<div className="proto-desk-col">
				<RevealGroup immediate>
					<RevealItem>
						<p className="proto-desk-lead">{LEADS[lead]}</p>
					</RevealItem>
					<RevealItem>
						<div className="proto-desk-modes" role="tablist" aria-label="What you are pasting">
							{MODES.map((m) => (
								<button
									key={m}
									type="button"
									role="tab"
									aria-selected={m === mode}
									data-active={m === mode ? "" : undefined}
									onClick={() => setMode(m)}
								>
									{m}
								</button>
							))}
						</div>
						<div
							className="proto-desk-field"
							onMouseDown={(e) => {
								if (e.target === e.currentTarget) {
									e.preventDefault();
									field.current?.focus();
								}
							}}
						>
							<input
								ref={field}
								type="text"
								value={value}
								onChange={(e) => setValue(e.target.value)}
								onFocus={() => setFocused(true)}
								onBlur={() => setFocused(false)}
								placeholder={focused ? "" : PLACEHOLDERS[mode]}
								aria-label={`Paste a ${mode}`}
								spellCheck={false}
							/>
							<Caret idle={value.length === 0} />
							<Link to="/app" className="proto-desk-go">
								Render
							</Link>
						</div>
					</RevealItem>
					<RevealItem>
						<ul className="proto-desk-examples">
							{EXAMPLES.map(([url, meta]) => (
								<li key={url}>
									<Link to="/app">{url}</Link>
									<span>{meta}</span>
								</li>
							))}
						</ul>
					</RevealItem>
					<RevealItem>
						<p className="proto-desk-meta">
							Exports mp4 · webm · gif · png &nbsp;·&nbsp; MIT, runs on your machine &nbsp;·&nbsp;{" "}
							<a href={GITHUB_URL} target="_blank" rel="noreferrer">
								source
							</a>
						</p>
					</RevealItem>
				</RevealGroup>
			</div>

			<Reveal immediate delay={0.26} className="mt-10">
				<Instrument />
			</Reveal>
		</section>
	);
}

/* ═══════════ 3. Sheet ═══════════
   The most literal fusion: the hero is Index's spec document, and the first row
   of that document is live. INPUT is not a fact about the tool, it is the field;
   everything under it is the rest of the sheet. A visitor reads a spec and finds
   that the top line accepts a paste. */

const SHEET: [string, string][] = [
	["OUTPUT", "mp4 · webm · gif · png — 16:9, 1:1, 9:16, 4:5, 3:4"],
	["ENGINE", "one token-morph engine draws the preview and the export"],
	["THEMES", "7 syntax themes · mesh, solid and image backdrops"],
	["LICENSE", "MIT · runs on your machine · no account"],
];

export function DeskLeadClaim() {
	return <Desk lead="claim" />;
}

export function DeskLeadStanding() {
	return <Desk lead="standing" />;
}

export function Sheet() {
	const [value, setValue] = useState("");

	return (
		<section className="proto-hero proto-sheet">
			<div className="proto-sheet-col">
				<RevealGroup immediate>
					<RevealItem>
						<p className="proto-sheet-name">
							TYPELAPSE <span aria-hidden="true">█</span> <span>CODE VIDEO TOOL</span>
						</p>
					</RevealItem>
					<RevealItem>
						<dl className="proto-sheet-rows">
							{/* Row one is the product, not a description of it. */}
							<div className="proto-sheet-row" data-live="">
								<dt>INPUT</dt>
								<dd>
									<span className="proto-sheet-field">
										<input
											type="text"
											value={value}
											onChange={(e) => setValue(e.target.value)}
											placeholder="paste a pull request, a diff, or a snippet"
											aria-label="Paste a pull request, a diff, or a snippet"
											spellCheck={false}
										/>
										<Caret idle={value.length === 0} />
									</span>
								</dd>
							</div>
							{SHEET.map(([k, v]) => (
								<div key={k} className="proto-sheet-row">
									<dt>{k}</dt>
									<dd>{v}</dd>
								</div>
							))}
						</dl>
					</RevealItem>
					<RevealItem>
						<ul className="proto-sheet-examples">
							{EXAMPLES.map(([url, meta]) => (
								<li key={url}>
									<Link to="/app">{url}</Link>
									<span>{meta}</span>
								</li>
							))}
						</ul>
					</RevealItem>
				</RevealGroup>
			</div>

			<Reveal immediate delay={0.26} className="proto-sheet-stage mt-11">
				<Instrument maxScale={1.25} />
			</Reveal>
		</section>
	);
}
