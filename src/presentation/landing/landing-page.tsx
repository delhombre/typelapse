import { Link } from "react-router-dom";
import { CapabilityLedger } from "./capability-ledger";
import { DiffSection } from "./diff-section";
import { ExportSection } from "./export-section";
import { Hero } from "./hero";
import { MagicMoveSection } from "./magic-move-section";
import { Nav } from "./nav";
import { InkButton, LandingIntroProvider, LogoLockup, Reveal } from "./primitives";
import { SocialSection } from "./social-section";
import { ThemeToggle } from "./theme-toggle";
import { CONTAINER, HAIRLINE, SECTION_PY } from "./tokens";
import { useLandingTheme } from "./use-landing-theme";

/**
 * Marketing landing at `/`. A refined, product-forward page:
 * a translucent nav, the live Instrument as the hero, four spacious feature
 * blocks (one of them a dark, full-bleed social showcase), a quiet capability
 * ledger, and a confident close. Presentation only.
 *
 * The theme lives here rather than in a store: it is one boolean that nothing
 * outside the landing reads, and every section already takes its colour from
 * `--color-ink` / `--color-ash` / `--color-paper`.
 */
export function LandingPage() {
	const [theme, toggleTheme] = useLandingTheme();

	return (
		<LandingIntroProvider>
			<div
				className="landing-root relative flex min-h-dvh flex-col bg-paper text-ink antialiased"
				data-theme={theme}
			>
				<Nav />
				<ThemeToggle theme={theme} onToggle={toggleTheme} />
				<main className="flex-1">
					<Hero />
					{/* The order follows the visitor's own workflow — bring a change in,
				    watch it become motion, check where it lands, ship it — and each
				    section is a numbered step of the same story rather than an
				    independent feature card. */}
					<DiffSection />
					<MagicMoveSection />
					<SocialSection />
					<ExportSection />
					<CapabilityLedger />
					<Cta />
				</main>
				<Footer />
			</div>
		</LandingIntroProvider>
	);
}

/* ──────────── Final action ──────────── */

function Cta() {
	return (
		<section className={`${CONTAINER} ${SECTION_PY} text-center`}>
			<Reveal>
				<h2 className="lp-h2 mx-auto max-w-[18ch] text-ink">
					Open the studio and make your first clip.
				</h2>
				<div className="mt-8 flex justify-center">
					<InkButton to="/app" size="lg">
						Open the studio
					</InkButton>
				</div>
				<p className="lp-micro mt-5">Start without an account. Render locally by default.</p>
			</Reveal>
		</section>
	);
}

/* ──────────── Footer ──────────── */

function Footer() {
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
				</div>
			</div>
		</footer>
	);
}
