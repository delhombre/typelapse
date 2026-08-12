import { Link } from "react-router-dom";
import { LogoLockup } from "./primitives";
import { CONTAINER, GITHUB_URL, HAIRLINE } from "./tokens";

/**
 * The footer every landing-side page closes on. It was private to `landing-page`
 * until `/compare` needed the same close: a second copy would have been two
 * places to keep one row of links honest.
 *
 * The links are the page's quietest surface on purpose — single-word, sentence
 * case, ash until hovered. `/compare` lives here and nowhere louder: a page that
 * names competitors earns its way in by being found, not by being sold.
 */
export function SiteFooter() {
	return (
		<footer className={`border-t ${HAIRLINE}`}>
			<div
				className={`${CONTAINER} flex flex-col gap-4 py-10 sm:flex-row sm:items-center sm:justify-between`}
			>
				<div className="flex items-center gap-3">
					<LogoLockup markSize={17} textClassName="text-base" />
					<span className="text-[13px] text-ash">Your code, in motion.</span>
				</div>
				<div className="flex items-center gap-6 text-[13px]">
					<Link
						to="/app"
						className="hit-ext text-ash transition-colors ease-[var(--ease-out)] hover:text-ink"
					>
						Studio
					</Link>
					<Link
						to="/compare"
						className="hit-ext text-ash transition-colors ease-[var(--ease-out)] hover:text-ink"
					>
						Compare
					</Link>
					<a
						href={GITHUB_URL}
						target="_blank"
						rel="noreferrer"
						className="hit-ext text-ash transition-colors ease-[var(--ease-out)] hover:text-ink"
					>
						GitHub
					</a>
				</div>
			</div>
		</footer>
	);
}
