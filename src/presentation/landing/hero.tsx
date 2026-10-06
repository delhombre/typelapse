import { classifySource } from "@/application/import/classify-source";
import { routeUrlPaste } from "@/application/import/route-url-paste";
import { trigger } from "@/presentation/haptics";
import { encodeImportIntent } from "@/presentation/utils/import-intent";
import {
	Fragment,
	type KeyboardEvent as ReactKeyboardEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { takeBulkInsert } from "./bulk-insert";
import { Instrument } from "./instrument";
import { Reveal, RevealGroup, RevealItem } from "./primitives";

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

/**
 * Short enough to be read whole on the narrowest phone. The field shares its row
 * with the button, which leaves about 17 monospace characters at 360px, and a
 * placeholder is cut at the edge rather than wrapped: the pull request's address
 * used to read "https://github.com/o". The log under the field shows real
 * addresses, so the placeholder says what to do instead of imitating one.
 */
const PLACEHOLDERS: Record<Mode, string> = {
	"pull request": "Paste a PR link",
	diff: "@@ -1,6 +1,10 @@",
	snippet: "db.users.all()",
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

const META = ["Local by default", "Preview matches export", "MP4, WebM, GIF and PNG"] as const;

/**
 * Which pastille the field's contents belong under, for the kinds we can be
 * certain of. `snippet` is the classifier's fallback rather than a finding, so
 * it never moves the pastille: it would drag it back on every keystroke of a
 * URL half typed. A commit, a release and a compare are GitHub changes like a
 * pull request, so they sit under its pastille.
 */
function modeForContent(value: string): Mode | null {
	const kind = classifySource(value);
	if (kind === "pr" || kind === "commit" || kind === "release" || kind === "compare") {
		return "pull request";
	}
	if (kind === "diff") {
		return "diff";
	}
	return null;
}

/**
 * A URL never needs a newline, so Enter can mean "go" while it holds one. The
 * links are the ones the studio's own URL import opens, asked of the same
 * policy, so a kind the studio learns the hero learns with it.
 */
function entersSubmit(value: string): boolean {
	return classifySource(value) === "empty" || routeUrlPaste(value) !== "refuse";
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

	/* Native rather than `onBeforeInput`: React's version is synthesised from
	   keypress and textInput and does not see an insertion that comes from an
	   input method or a script, which are the ones this exists for. */
	useEffect(() => {
		const element = field.current;
		if (!element) {
			return;
		}
		const onBeforeInput = (event: InputEvent) => {
			const next = takeBulkInsert(event, element);
			if (next !== null) {
				onChange(next);
			}
		};
		element.addEventListener("beforeinput", onBeforeInput);
		return () => element.removeEventListener("beforeinput", onBeforeInput);
	}, []);

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

	/* Below `sm` the column reaches the corner the fixed theme switch floats in,
	   and its 44px target ends 60px down, so the lead starts at 64 rather than
	   under the switch's hit area. */
	return (
		<section className="lp-hero flex min-h-[100svh] flex-col justify-center pt-16 pb-8 sm:pt-8">
			<RevealGroup immediate className="mx-auto w-full max-w-[680px] lp-gutter">
				<RevealItem>
					<h1 className="lp-hero-lead">
						<strong>Typelapse.</strong> Code videos as sharp as their preview, made in your browser
						from a pull request. Text, images, video and audio share the same scenes.
					</h1>
				</RevealItem>
				<RevealItem>
					<div className="lp-modes" role="radiogroup" aria-label="What you are pasting">
						{MODES.map((m) => (
							<label key={m} className="lp-mode" data-active={m === mode ? "" : undefined}>
								<input
									type="radio"
									name="landing-source-kind"
									value={m}
									checked={m === mode}
									className="sr-only"
									onChange={() => {
										/* Only a change of mode ticks; re-tapping the one already
							   selected did nothing, so it says nothing. */
										trigger("selection");
										setMode(m);
									}}
								/>
								<span>{m}</span>
							</label>
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
							{value.trim() === "" ? "Open studio" : "Import & animate"}
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
					{/* Each fact is the unit that wraps: at 375 the line used to break
					    inside the format list and leave "WebM, GIF and PNG" orphaned. */}
					<p className="lp-hero-meta">
						{META.map((fact, i) => (
							<Fragment key={fact}>
								{/* Held to the fact before it, so a wrapped line never opens on a dot. */}
								{i > 0 && <span aria-hidden="true">{"\u00a0\u00a0·\u00a0 "}</span>}
								<span className="whitespace-nowrap">{fact}</span>
							</Fragment>
						))}
					</p>
				</RevealItem>
			</RevealGroup>

			<Reveal immediate delay={0.26} className="mt-10">
				{/* The field's button is this screen's primary, and the island sits
				    inside the same screen, so its own "Open studio" stays a text
				    action. The nav's filled one only appears once the hero is gone. */}
				<Instrument quietCta />
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
