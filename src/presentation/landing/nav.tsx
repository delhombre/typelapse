import { Logomark } from "@/presentation/components/ui/logomark";
import { Link } from "react-router-dom";
import { CONTAINER, GITHUB_URL, HAIRLINE } from "./tokens";

/**
 * Landing nav: a clean, static top bar. Logo on the left, GitHub and the studio CTA
 * on the right. Fixed and frosted so it floats over the page without taking any
 * layout height (the hero keeps its full viewport). No scroll animation.
 */
export function Nav() {
	return (
		<header
			className={`fixed inset-x-0 top-0 z-50 border-b ${HAIRLINE} bg-paper/80 backdrop-blur-md`}
		>
			<nav className={`${CONTAINER} flex h-14 items-center justify-between`}>
				<Link to="/" aria-label="Typelapse home" className="flex items-center gap-2">
					<Logomark size={18} />
					<span className="font-semibold text-[15px] text-ink tracking-tight">Typelapse</span>
				</Link>
				<div className="flex items-center gap-5">
					<a
						href={GITHUB_URL}
						target="_blank"
						rel="noreferrer"
						className="text-[13px] text-ash transition-colors hover:text-ink"
					>
						GitHub
					</a>
					<Link
						to="/app"
						className="inline-flex h-9 items-center rounded-full bg-[var(--color-cta)] px-4 font-medium text-[13px] text-white transition hover:brightness-95 active:scale-[0.97]"
					>
						Open studio
					</Link>
				</div>
			</nav>
		</header>
	);
}
