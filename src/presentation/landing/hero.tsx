import { classifySource } from "@/application/import/classify-source";
import { trigger } from "@/presentation/haptics";
import { encodeImportIntent } from "@/presentation/utils/import-intent";
import { type KeyboardEvent as ReactKeyboardEvent, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Instrument } from "./instrument";
import { Reveal, RevealGroup, RevealItem } from "./primitives";
import { GITHUB_URL } from "./tokens";

/**
 * Hero.
 *
 * No headline: the product's own field is the first thing on the page, and what
 * you can paste into it is not described beside it — it *is* the field's modes.
 * The Instrument sits below as the product shot, running the real engine,
 * because a product that sells motion should not advertise itself with a still.
 *
 * The field is the product, so it does the product's work: what you paste is
 * carried into the studio and imported there, through the same reader the
 * studio's own import menu uses. It was once a link that threw your paste away,
 * which made every promise above it a claim the page did not keep.
 *
 * The drawing is in app.css under `.lp-hero`; the three rules it follows are
 * written there.
 */

const MODES = ["pull request", "diff", "snippet"] as const;

type Mode = (typeof MODES)[number];

const PLACEHOLDERS: Record<Mode, string> = {
	"pull request": "https://github.com/owner/repo/pull/1247",
	diff: "@@ -1,6 +1,10 @@",
	snippet: "const users = await db.users.all()",
};

/**
 * Held apart rather than as one printed string: a log's columns cannot line up
 * while they are inside a sentence.
 *
 * Every row names a merged pull request that exists and reports the counts
 * GitHub reports for it. The three that stood here before did neither — one of
 * them had never been opened — and since a row now fetches the change it names,
 * a wrong number is a row that visibly contradicts what it loads.
 */
const EXAMPLES = [
	{ url: "github.com/oven-sh/bun/pull/37643", files: "3 files", added: "+7", removed: "−6" },
	{ url: "github.com/vercel/next.js/pull/97139", files: "1 file", added: "+19", removed: "−7" },
	{ url: "github.com/honojs/hono/pull/5189", files: "3 files", added: "+44", removed: "−1" },
] as const;

/**
 * Which pastille the field's contents belong under, for the kinds we can be
 * certain of. `snippet` is the classifier's fallback rather than a finding, so
 * it never moves the pastille: it would drag it back on every keystroke of a
 * URL half typed.
 */
function modeForContent(value: string): Mode | null {
	const kind = classifySource(value);
	if (kind === "pr" || kind === "commit") {
		return "pull request";
	}
	if (kind === "diff") {
		return "diff";
	}
	return null;
}

/** A URL never needs a newline, so Enter can mean "go" while it holds one. */
function entersSubmit(value: string): boolean {
	const kind = classifySource(value);
	return kind === "empty" || kind === "pr" || kind === "commit" || kind === "code-url";
}

export function Hero() {
	const [mode, setMode] = useState<Mode>("pull request");
	const [value, setValue] = useState("");
	/* The field sizes to its content so the caret can stand at the end of it, and
	   an empty field's content is its placeholder — which would park the caret
	   after the example rather than where you are about to type. The example
	   steps aside on focus; the pastille above still says what is expected. */
	const [focused, setFocused] = useState(false);
	/* And an input that no longer spans the row no longer catches a press on the
	   empty part of it, which is what filling the row used to do for free. */
	const field = useRef<HTMLTextAreaElement>(null);
	const navigate = useNavigate();

	/* A diff is many lines by definition, so the field has to be able to hold
	   them: a single-line input drops the newlines out of a pasted diff on the
	   way in, which left "diff" as a mode that could not accept a diff. It grows
	   only once there is something to grow for. */
	const multiline = value.includes("\n");

	function submit() {
		/* An empty field discards nothing, so it keeps the plain door into the
		   studio it has always been. Anything else travels. */
		navigate(value.trim() === "" ? "/app" : `/app${encodeImportIntent({ source: value })}`);
	}

	function onChange(next: string) {
		setValue(next);
		/* The pastilles stop being a question the moment the field can answer it:
		   paste a pull request under "snippet" and the row corrects itself rather
		   than sitting there mislabelling what you are holding. Clicking a
		   pastille still wins, until the contents change again. */
		const detected = modeForContent(next);
		if (detected) {
			setMode(detected);
		}
	}

	function onKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
		if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
			e.preventDefault();
			submit();
			return;
		}
		if (e.key === "Enter" && !e.shiftKey && entersSubmit(value)) {
			// Swallowed either way: Enter on an empty field should not carry you off
			// the page, and it should not grow the field a blank line either.
			e.preventDefault();
			if (value.trim() !== "") {
				submit();
			}
		}
	}

	return (
		<section className="lp-hero flex min-h-[100svh] flex-col justify-center py-8">
			<RevealGroup immediate className="mx-auto w-full max-w-[680px] px-6">
				<RevealItem>
					<p className="lp-hero-lead">
						<strong>Typelapse.</strong> Make anything move. Text, code, images, video and sound —
						alone or together, shaped scene by scene and rendered for any screen.
					</p>
				</RevealItem>
				<RevealItem>
					<div className="lp-modes" role="tablist" aria-label="What you are pasting">
						{MODES.map((m) => (
							<button
								key={m}
								type="button"
								role="tab"
								className="lp-mode"
								aria-selected={m === mode}
								data-active={m === mode ? "" : undefined}
								onClick={() => {
									/* Only a change of mode ticks; re-tapping the one already
									   selected did nothing, so it says nothing. */
									if (m !== mode) {
										trigger("selection");
									}
									setMode(m);
								}}
							>
								{m}
							</button>
						))}
					</div>
					<div
						className="lp-field"
						data-multiline={multiline ? "" : undefined}
						/* The drawn caret can only stand where the text ends, and once there
						   is text that is not where you are: click into the middle of a
						   pasted URL and the block stays at the end, pointing at the wrong
						   character. It is a sibling of the field, so it cannot follow a
						   selection. So it holds the empty state only — where it is exact,
						   and where the real caret has nothing to show — and hands over the
						   moment there is content. The drawing is in app.css. */
						data-empty={value === "" ? "" : undefined}
						onMouseDown={(e) => {
							if (e.target === e.currentTarget) {
								e.preventDefault();
								field.current?.focus();
							}
						}}
					>
						<textarea
							ref={field}
							rows={1}
							value={value}
							onChange={(e) => onChange(e.target.value)}
							onKeyDown={onKeyDown}
							onFocus={() => setFocused(true)}
							onBlur={() => setFocused(false)}
							placeholder={focused ? "" : PLACEHOLDERS[mode]}
							aria-label={`Paste a ${mode}`}
							spellCheck={false}
							autoComplete="off"
							autoCorrect="off"
							autoCapitalize="off"
						/>
						{/* Kept in the row while the field is one line, and hidden rather
						    than unmounted when it stands down, so the Render button does not
						    step sideways on the first keystroke. */}
						{!multiline && <span className="lp-caret" aria-hidden="true" />}
						<button type="button" className="lp-field-cta" onClick={submit}>
							Render
						</button>
					</div>
				</RevealItem>
				<RevealItem>
					<ul className="lp-log">
						{EXAMPLES.map((e) => (
							<ExampleRow key={e.url} example={e} />
						))}
					</ul>
				</RevealItem>
				<RevealItem>
					<p className="lp-hero-meta">
						Start blank or import a code change &nbsp;·&nbsp; Local-first &nbsp;·&nbsp;{" "}
						<a href={GITHUB_URL} target="_blank" rel="noreferrer">
							source
						</a>
					</p>
				</RevealItem>
			</RevealGroup>

			<Reveal immediate delay={0.26} className="mt-10">
				<Instrument />
			</Reveal>
		</section>
	);
}

/**
 * One row of the log. It carries its own pull request into the studio, which is
 * the whole reason it names a real one: three links that all opened the same
 * default snippet were three examples of nothing.
 */
function ExampleRow({ example }: { example: (typeof EXAMPLES)[number] }) {
	const to = useMemo(
		() => `/app${encodeImportIntent({ source: `https://${example.url}` })}`,
		[example.url],
	);
	return (
		<li>
			<Link to={to}>{example.url}</Link>
			<span>{example.files}</span>
			<span>{example.added}</span>
			<span>{example.removed}</span>
		</li>
	);
}
