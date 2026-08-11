import { useRef, useState } from "react";
import { Link } from "react-router-dom";
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

/** Held apart rather than as one printed string: a log's columns cannot line up
    while they are inside a sentence. */
const EXAMPLES = [
	{ url: "github.com/oven-sh/bun/pull/14210", files: "3 files", added: "+41", removed: "−12" },
	{ url: "github.com/vercel/next.js/pull/71102", files: "1 file", added: "+18", removed: "−4" },
	{ url: "github.com/honojs/hono/pull/3488", files: "2 files", added: "+26", removed: "−9" },
] as const;

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
	const field = useRef<HTMLInputElement>(null);

	return (
		<section className="lp-hero flex min-h-[100svh] flex-col justify-center py-8">
			<RevealGroup immediate className="mx-auto w-full max-w-[680px] px-6">
				<RevealItem>
					<p className="lp-hero-lead">
						<strong>Typelapse.</strong> Turn a code change into a video. Paste a pull request, a
						diff or a snippet. It morphs token by token and renders for the feed.
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
								onClick={() => setMode(m)}
							>
								{m}
							</button>
						))}
					</div>
					<div
						className="lp-field"
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
						<span
							className="lp-caret"
							data-idle={value.length === 0 ? "" : undefined}
							aria-hidden="true"
						/>
						<Link to="/app" className="lp-field-cta">
							Render
						</Link>
					</div>
				</RevealItem>
				<RevealItem>
					<ul className="lp-log">
						{EXAMPLES.map((e) => (
							<li key={e.url}>
								<Link to="/app">{e.url}</Link>
								<span>{e.files}</span>
								<span>{e.added}</span>
								<span>{e.removed}</span>
							</li>
						))}
					</ul>
				</RevealItem>
				<RevealItem>
					<p className="lp-hero-meta">
						Exports mp4 · webm · gif · png &nbsp;·&nbsp; MIT, runs on your machine &nbsp;·&nbsp;{" "}
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
