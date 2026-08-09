import { Link } from "react-router-dom";
import { Instrument } from "./instrument";
import { Reveal, RevealGroup, RevealItem } from "./primitives";
import { CONTAINER, GITHUB_URL } from "./tokens";

/**
 * Hero, "Terminal" direction (docs/decisions/2026-08-09-hero-direction.md).
 *
 * The headline is set in the mono, left aligned: a developer arriving from a
 * link reads what this is from the typeface before they reach the copy. The
 * Instrument sits below as the product shot, running the real engine, because
 * a product that sells motion should not advertise itself with a still.
 */
export function Hero() {
	return (
		<section className="flex min-h-[100svh] flex-col justify-center py-8">
			<RevealGroup immediate className={CONTAINER}>
				<RevealItem>
					<p className="lp-prompt mb-5">
						<span aria-hidden="true">$ </span>typelapse --from-pr 1247
					</p>
				</RevealItem>
				<RevealItem>
					{/* 30ch, not 20: the headline is 29 characters and the whole point of
					    shortening it was to let it hold one line on desktop. */}
					<h1 className="lp-display-mono max-w-[30ch] text-ink">Your pull request, as a video</h1>
				</RevealItem>
				<RevealItem>
					<p className="lp-lead mt-4 max-w-[58ch]">
						Paste a snippet, a unified diff, or a whole GitHub pull request. Typelapse morphs it
						token by token and exports a video that matches the preview frame for frame.
					</p>
				</RevealItem>
				<RevealItem>
					<div className="mt-6 flex flex-wrap gap-3">
						<Link
							to="/app"
							className="inline-flex items-center rounded-[10px] bg-ink px-5 py-3 font-semibold text-[0.875rem] text-paper transition-opacity hover:opacity-88"
						>
							Open the studio
						</Link>
						<a
							href={GITHUB_URL}
							target="_blank"
							rel="noreferrer"
							className="inline-flex items-center rounded-[10px] px-5 py-3 font-semibold text-[0.875rem] text-ink shadow-[inset_0_0_0_1px_currentColor]/10 transition-colors hover:bg-ink/5"
						>
							View source
						</a>
					</div>
				</RevealItem>
			</RevealGroup>

			<Reveal immediate delay={0.24} className="mt-7">
				<Instrument />
			</Reveal>

			<Reveal immediate delay={0.32} className={`${CONTAINER} mt-4`}>
				<p className="lp-micro">MIT licensed. Runs on your machine. No account needed.</p>
			</Reveal>
		</section>
	);
}
