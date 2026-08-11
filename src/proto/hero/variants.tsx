import { Instrument } from "@/presentation/landing/instrument";
import { Reveal, RevealGroup, RevealItem } from "@/presentation/landing/primitives";
import { GITHUB_URL } from "@/presentation/landing/tokens";
import { Link } from "react-router-dom";

/* Four heroes, drawn from Pierre's own properties rather than from a memory of
   them. Sampling the four sites showed they do not share one grammar — they run
   three, and each suits a different claim:

   · an external reference  — the entire page in mono at ONE size (12px/24px, headings at
                     the same size as body, weight and position carrying all the
                     hierarchy), a 500px column, no radius and no shadow at all.
   · an external reference.com  — no headline whatsoever. A 16px grey sentence, then the
                     tool's own input, then example links. The page opens on the
                     product, not on a claim about it.
   · an external reference     — a 60px/60px Geist headline at -0.025em, one 20px sentence in
     & trees         a true grey, and an enormous artefact carrying no shadow.

   The previous five all held our mono headline fixed and varied what sat under
   it; none landed, which suggests the head was the wrong thing to hold constant.
   None of these four keep it.

   Throwaway. Delete src/proto and the route in main.tsx once one wins. */

const MICRO = "MIT licensed · runs on your machine · no account";

/* ═══════════ 1. Terminal ═══════════
   an external reference's grammar, honestly applied: one typeface, one size, one leading
   for the whole hero. Nothing is bigger than anything else — the title is the
   same 13px as the body and only weight separates it — and there is not a single
   rounded corner or shadow in the composition. The instrument loses its radius
   too, so it reads as a plate in a document rather than a card on a page. */

const TERMINAL_ROWS = [
	["WHAT", "a video of a code change, rendered from a diff"],
	["INPUT", "a snippet, a unified diff, or a GitHub pull request URL"],
	["OUTPUT", "MP4 · WebM · GIF · PNG, in every aspect the feeds ask for"],
	["ENGINE", "one token-morph engine draws the preview and the export"],
	["LICENSE", "MIT, runs on your machine, no account"],
] as const;

export function Terminal() {
	return (
		<section className="proto-hero proto-terminal">
			<div className="proto-term-col">
				<RevealGroup immediate>
					<RevealItem>
						<p className="proto-term-meta">TYPELAPSE — CODE VIDEO TOOL — 2026</p>
					</RevealItem>
					<RevealItem>
						<h1 className="proto-term-title">Your pull request, as a video.</h1>
					</RevealItem>
					<RevealItem>
						<dl className="proto-term-rows">
							{TERMINAL_ROWS.map(([k, v]) => (
								<div key={k} className="proto-term-row">
									<dt>{k}</dt>
									<dd>{v}</dd>
								</div>
							))}
						</dl>
					</RevealItem>
					<RevealItem>
						<p className="proto-term-links">
							<Link to="/app">[ OPEN THE STUDIO ]</Link>
							<a href={GITHUB_URL} target="_blank" rel="noreferrer">
								[ SOURCE ]
							</a>
						</p>
					</RevealItem>
				</RevealGroup>
			</div>

			<Reveal immediate delay={0.22} className="proto-term-stage mt-12">
				<Instrument maxScale={1.35} />
			</Reveal>
		</section>
	);
}

/* ═══════════ 2. Console ═══════════
   an external reference's move: the page does not describe the tool, it hands it to you. One
   grey sentence, then the field the product actually starts with, then real pull
   requests to try. No headline claim at all, because a claim is what you write
   when the visitor cannot use the thing on the spot. */

const EXAMPLES = [
	"github.com/oven-sh/bun/pull/14210",
	"github.com/vercel/next.js/pull/71102",
	"github.com/honojs/hono/pull/3488",
];

export function Console() {
	return (
		<section className="proto-hero proto-console">
			<div className="proto-console-col">
				<RevealGroup immediate>
					<RevealItem>
						<p className="proto-console-lead">
							Turn any public GitHub pull request into a video — the diff, morphed token by token
							and rendered for the feed.
						</p>
					</RevealItem>
					<RevealItem>
						<div className="proto-console-field">
							<input
								type="text"
								placeholder="Paste a pull request URL"
								aria-label="Paste a pull request URL"
								readOnly
							/>
							<Link to="/app" className="proto-console-go">
								Render
							</Link>
						</div>
					</RevealItem>
					<RevealItem>
						<ul className="proto-console-examples">
							{EXAMPLES.map((url) => (
								<li key={url}>
									<Link to="/app">{url}</Link>
								</li>
							))}
						</ul>
					</RevealItem>
				</RevealGroup>
			</div>

			<Reveal immediate delay={0.24} className="mt-10">
				<Instrument />
			</Reveal>
		</section>
	);
}

/* ═══════════ 3. Library ═══════════
   an external reference and an external reference at their measured values: a 60px headline at a
   line-height of exactly 1, one 20px sentence in a true grey, and then the
   object — with no button row at all, because neither of their pages has one.
   The restraint is the whole effect. */

export function Library() {
	return (
		<section className="proto-hero proto-library">
			<div className="proto-lib-col">
				<RevealGroup immediate>
					<RevealItem>
						<h1 className="proto-lib-title">Your pull request, as a video</h1>
					</RevealItem>
					<RevealItem>
						<p className="proto-lib-lead">
							Typelapse is an open-source tool that turns a snippet, a diff or a whole GitHub pull
							request into a video, morphed token by token by the same engine that renders the
							export.
						</p>
					</RevealItem>
					<RevealItem>
						<p className="proto-lib-meta">Currently v0.9.2 · MIT</p>
					</RevealItem>
				</RevealGroup>
			</div>

			<Reveal immediate delay={0.24} className="mt-14">
				<Instrument maxScale={1.2} />
			</Reveal>
		</section>
	);
}

/* ═══════════ 4. Index ═══════════
   an external reference's own page: the company site is a plain text document with a
   block glyph after the name and a categorical index. Applied here, the hero is
   an index of the product rather than a pitch for it — every line a fact, in
   reading order, and the object underneath as the only thing that is not text. */

const INDEX: [string, string[]][] = [
	["Products", ["Studio — browser, free, no account", "Hosted render — coming"]],
	["Imports", ["Snippet", "Unified diff", "GitHub pull request URL"]],
	["Exports", ["MP4", "WebM", "GIF", "PNG"]],
	["Source", ["MIT on GitHub"]],
];

export function LedgerIndex() {
	return (
		<section className="proto-hero proto-index">
			<div className="proto-index-col">
				<RevealGroup immediate>
					<RevealItem>
						<h1 className="proto-index-title">
							TYPELAPSE <span aria-hidden="true">█</span>
						</h1>
					</RevealItem>
					<RevealItem>
						<p className="proto-index-sub">CODE VIDEO TOOL</p>
						<p className="proto-index-sub">2026</p>
					</RevealItem>
					<RevealItem>
						<p className="proto-index-about">
							Typelapse renders a code change as a video: paste a snippet, a diff or a pull request
							and it morphs token by token, then exports for the feed.
						</p>
					</RevealItem>
					<RevealItem>
						<div className="proto-index-lists">
							{INDEX.map(([label, items]) => (
								<section key={label}>
									<h2>{label}</h2>
									<ul>
										{items.map((it) => (
											<li key={it}>{it}</li>
										))}
									</ul>
								</section>
							))}
						</div>
					</RevealItem>
					<RevealItem>
						<p className="proto-index-links">
							<Link to="/app">Open the studio</Link>
							{" · "}
							<a href={GITHUB_URL} target="_blank" rel="noreferrer">
								GitHub
							</a>
						</p>
					</RevealItem>
				</RevealGroup>
			</div>

			<Reveal immediate delay={0.26} className="mt-12">
				<Instrument />
			</Reveal>
			<Reveal immediate delay={0.32} className="proto-index-col mt-6">
				<p className="proto-index-micro">{MICRO}</p>
			</Reveal>
		</section>
	);
}
