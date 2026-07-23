import { Instrument } from "./instrument";
import { Reveal, RevealGroup, RevealItem } from "./primitives";
import { CONTAINER } from "./tokens";

/**
 * Hero: one confident display line, one calm subhead, then the live Instrument as
 * the product shot, and a quiet sans stamp. The headline / subhead / instrument /
 * microline stagger in on mount (they are already in view). The Instrument keeps
 * its own width (`max-w-5xl`) so it reads as the focal object of the page.
 */
export function Hero() {
	return (
		<section className="pt-16 pb-14 sm:pt-24 sm:pb-20">
			<RevealGroup immediate className={`${CONTAINER} text-center`}>
				<RevealItem>
					<span className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3.5 py-1.5 font-medium text-[13px] text-ink">
						<span aria-hidden className="size-1.5 rounded-full bg-accent" />
						Free and open source
					</span>
				</RevealItem>
				<RevealItem>
					<h1 className="lp-display mx-auto mt-5 max-w-[15ch] text-ink">Your code, in motion.</h1>
				</RevealItem>
				<RevealItem>
					<p className="lp-lead mx-auto mt-6 max-w-[48ch]">
						Paste a snippet, a diff, or a whole pull request. Typelapse turns it into a smooth,
						token by token video that's ready to drop straight into your feed.
					</p>
				</RevealItem>
			</RevealGroup>

			<Reveal immediate delay={0.18} className="mt-14 sm:mt-16">
				<Instrument />
			</Reveal>

			<Reveal immediate delay={0.3} className={`${CONTAINER} mt-8 text-center`}>
				<p className="lp-micro">No account, no upload. It all runs in your browser.</p>
			</Reveal>
		</section>
	);
}
