import { Hero } from "./hero";
import { Nav } from "./nav";
import { PipelineSection, StepStrip } from "./pipeline";
import { PricingSection } from "./pricing-section";
import { InkButton, LandingIntroProvider, Reveal } from "./primitives";
import { SharpnessSection } from "./sharpness-section";
import { SiteFooter } from "./site-footer";
import { ThemeToggle } from "./theme-toggle";
import { CONTAINER, SECTION_PY } from "./tokens";
import { useLandingTheme } from "./use-landing-theme";
import { useStudioPrefetch } from "./use-studio-prefetch";

/**
 * Marketing landing at `/`: the pipeline (decision 2026-10-08-landing-pipeline).
 * The page reads as one line from a pull request to a file: the hero with the
 * live engine beside the paste field, a strip of the five steps, the five
 * stages on a rail, each a hairline figure beside the product itself, then the
 * measured proof with the specification on the dark band, pricing in two
 * columns and a close. Presentation only.
 *
 * The theme lives here rather than in a store: it is one boolean that nothing
 * outside the landing reads, and every section already takes its colour from
 * `--color-ink` / `--color-ash` / `--color-paper`.
 */
export function LandingPage() {
	const [theme, toggleTheme] = useLandingTheme();
	useStudioPrefetch();

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
					<StepStrip />
					<PipelineSection />
					{/* The proof under the stage that makes the file: the same frame out of
					    two of its formats, measured, then the whole product on one sheet. */}
					<SharpnessSection />
					<PricingSection />
					<Cta />
				</main>
				<SiteFooter />
			</div>
		</LandingIntroProvider>
	);
}

/* ──────────── Final action ──────────── */

function Cta() {
	return (
		<section className={`${CONTAINER} ${SECTION_PY} pt-0 text-center sm:pt-0 lg:pt-0`}>
			<Reveal>
				<h2 className="lp-h2 mx-auto max-w-[18ch] text-ink">
					Paste a change and make your first clip.
				</h2>
				<div className="mt-8 flex justify-center">
					<InkButton to="/app" size="lg">
						Open studio
					</InkButton>
				</div>
				<p className="lp-micro mt-5">Start without an account. Render locally by default.</p>
			</Reveal>
		</section>
	);
}
