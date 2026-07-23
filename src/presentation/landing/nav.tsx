import { Link } from "react-router-dom";
import { InkButton, LogoLockup } from "./primitives";
import { CONTAINER, GITHUB_URL } from "./tokens";

/**
 * Sticky, translucent nav. A clean frosted material (blur + saturate over a
 * mostly-opaque paper) with a bright top edge and a crisp hairline bottom, so it
 * reads sharp over both the light sections and the one dark section, with no
 * smeared scroll-edge gradient.
 */
export function Nav() {
	return (
		<header className="sticky top-0 z-50">
			<div className="relative border-black/[0.07] border-b">
				<div
					aria-hidden
					className="-z-10 absolute inset-0 bg-paper/85 backdrop-blur-lg backdrop-saturate-150"
					style={{ boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.6)" }}
				/>
				<div className={`${CONTAINER} flex h-16 items-center justify-between`}>
					<Link to="/" aria-label="Typelapse home" className="-m-2 flex items-center p-2">
						<LogoLockup markSize={20} textClassName="text-lg" />
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
		</header>
	);
}
