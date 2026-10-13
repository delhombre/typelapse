import { Link } from "react-router-dom";
import { LogoLockup } from "./primitives";
import { CONTAINER, HAIRLINE } from "./tokens";

/** The footer of the landing and of the public pages that wear its design. */
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
						to="/pricing"
						className="hit-ext text-ash transition-colors ease-[var(--ease-out)] hover:text-ink"
					>
						Pricing
					</Link>
					{/* The figures are drawn on hairline's kernel (MIT); its notice ships at
					    /licenses/hairline-MIT.txt and in the kernel's own header. */}
					<a
						href="https://hairline.lucasmarkes.com"
						target="_blank"
						rel="noreferrer"
						className="hit-ext text-ash transition-colors ease-[var(--ease-out)] hover:text-ink"
					>
						Figures: hairline
					</a>
				</div>
			</div>
		</footer>
	);
}
