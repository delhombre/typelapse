import { LogoWordmark } from "@/presentation/components/ui/logo-wordmark";
import { Link } from "react-router-dom";
import { InkButton } from "./primitives";
import { CONTAINER, GITHUB_URL } from "./tokens";

/**
 * Sticky, translucent nav. The bar is a frosted material (blur + saturate over a
 * semi-transparent paper) with a bright top edge; content scrolls under it and a
 * short gradient below the bar softens the scroll edge instead of a hard border.
 */
export function Nav() {
	return (
		<header className="sticky top-0 z-50">
			<div className="relative">
				<div
					aria-hidden
					className="absolute inset-0 -z-10 bg-paper/70 backdrop-blur-xl backdrop-saturate-150"
					style={{ boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.7)" }}
				/>
				<div className={`${CONTAINER} flex h-16 items-center justify-between`}>
					<Link to="/" aria-label="Typelapse home" className="-m-2 flex items-center p-2">
						<LogoWordmark height={21} className="text-ink" />
					</Link>
					<nav className="flex items-center gap-1 sm:gap-2">
						<a
							href={GITHUB_URL}
							target="_blank"
							rel="noreferrer"
							className="flex h-11 items-center rounded-full px-3 text-ash text-sm transition-colors hover:text-ink"
						>
							GitHub
						</a>
						<InkButton to="/app">Open studio</InkButton>
					</nav>
				</div>
			</div>
			{/* Soft scroll-edge fade: content dissolves under the bar, no 1px line. */}
			<div
				aria-hidden
				className="pointer-events-none h-6 bg-gradient-to-b from-paper/80 to-transparent"
			/>
		</header>
	);
}
