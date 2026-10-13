import {
	type CreatorPrice,
	type PricingView,
	pricingView,
} from "@/application/billing/pricing-view";
import { TestModeLine } from "@/presentation/components/billing/test-mode-line";
import { useRouteHead } from "@/presentation/hooks/use-route-head";
import { useId, useMemo } from "react";
import { Link } from "react-router-dom";
import { DynamicNav, type NavLinkItem } from "../dynamic-nav";
import { Eyebrow, InkButton } from "../primitives";
import { SiteFooter } from "../site-footer";
import { ThemeToggle } from "../theme-toggle";
import { CONTAINER, SECTION_PY } from "../tokens";
import { useLandingTheme } from "../use-landing-theme";
import "./pricing-page.css";
import { useCatalogReading } from "./use-catalog-reading";

/** The pill on this page: the landing's sections are one hop back, this page is the current one. */
const NAV_LINKS: readonly NavLinkItem[] = [
	{ href: "/#how-it-works", label: "How it works" },
	{ href: "/#proof", label: "Proof" },
	{ href: "/pricing", label: "Pricing", current: true },
];

/**
 * The public pricing page at `/pricing` (#256, ux-waves D3): the paid side seen
 * before anyone signs in. Everything on it comes from `pricingView`, which reads
 * the catalog and the Plan value object; this file lays that out in the
 * landing's design system and decides nothing about what is true.
 */
export function PricingPage() {
	const [theme, toggleTheme] = useLandingTheme();
	useRouteHead("pricing");
	const reading = useCatalogReading();
	const view = useMemo(() => pricingView({ reading }), [reading]);

	return (
		<div
			className="landing-root pricing-root relative flex min-h-dvh flex-col bg-paper text-ink antialiased"
			data-theme={theme}
		>
			<DynamicNav links={NAV_LINKS} deferCtaTo=".pr-plans" />
			<ThemeToggle theme={theme} onToggle={toggleTheme} />
			<main className="flex-1">
				<section className={`${CONTAINER} pt-32 pb-8 sm:pt-40`} aria-labelledby="pricing-title">
					<Eyebrow>Pricing</Eyebrow>
					<h1 id="pricing-title" className="lp-h2 mt-4 max-w-[18ch] text-ink">
						Free on your machine. Creator on ours.
					</h1>
					<p className="lp-lead mt-5 max-w-[34ch]">
						Exporting on your own device costs nothing. Pay only when you want us to render.
					</p>
				</section>
				<Plans view={view} />
				<Comparison view={view} />
				<Questions view={view} />
			</main>
			<SiteFooter current="pricing" />
		</div>
	);
}

function Plans({ view }: { view: PricingView }) {
	return (
		<section className={`${CONTAINER} pt-8 pb-16`} aria-label="Plans">
			<div className="pr-plans">
				<article className="pr-card" aria-labelledby="plan-device">
					<h2 id="plan-device" className="pr-plan-name">
						On this device
					</h2>
					<div className="pr-price-slot">
						<p className="pr-price">Free</p>
						<p className="pr-price-alt">Runs in your browser</p>
					</div>
					<ul className="pr-points">
						{view.device.points.map((point) => (
							<li key={point}>{point}</li>
						))}
					</ul>
					<Link to="/app" className="pr-text-link">
						Open the studio
					</Link>
				</article>
				<article
					className="pr-card"
					aria-labelledby="plan-creator"
					data-testid="creator-card"
					data-price-state={view.creator.price.state}
				>
					<h2 id="plan-creator" className="pr-plan-name">
						Creator
					</h2>
					{view.testMode ? <TestModeLine environment="sandbox" /> : null}
					<CreatorPriceBlock price={view.creator.price} />
					<ul className="pr-points">
						{view.creator.adds.map((line) => (
							<li key={line}>{line}</li>
						))}
					</ul>
					{/* The first screen's one filled shape (DECISIONS D2): the pill holds its own
					    "Open studio" back while these cards are in view. The sheet that sells
					    Creator lives in the studio, under Where, until a deep link ships (#290). */}
					<div className="pr-card-action">
						<InkButton to="/app">{view.creator.action.label}</InkButton>
						<p className="lp-micro">{view.creator.action.hint}</p>
					</div>
				</article>
			</div>
		</section>
	);
}

function CreatorPriceBlock({ price }: { price: CreatorPrice }) {
	if (price.state === "pending") {
		return <div className="pr-price-slot" aria-busy="true" data-testid="creator-price" />;
	}
	if (price.state === "unpriced") {
		return (
			<div className="pr-price-slot" data-testid="creator-price">
				<p className="pr-unpriced">The price is not published yet.</p>
			</div>
		);
	}
	return (
		<div className="pr-price-slot" data-testid="creator-price">
			{price.lines.map((line, index) => (
				<p key={line.cadence} className={index === 0 ? "pr-price" : "pr-price-alt"}>
					{index === 0 ? line.label : `or ${line.label}`}
					{line.note ? <span className="pr-saving">{line.note}</span> : null}
				</p>
			))}
		</div>
	);
}

function Comparison({ view }: { view: PricingView }) {
	return (
		<section className={`${CONTAINER} pb-16`} aria-labelledby="compare-heading">
			<h2 id="compare-heading" className="lp-h3">
				This device, or hosted
			</h2>
			<div className="pr-table-frame">
				<table className="pr-table">
					<thead>
						<tr>
							<th scope="col">
								<span className="sr-only">What</span>
							</th>
							<th scope="col">On this device</th>
							<th scope="col">Creator</th>
						</tr>
					</thead>
					<tbody>
						{view.table.rows.map((row) => (
							<tr key={row.label}>
								<th scope="row">{row.label}</th>
								<td>{row.device}</td>
								<td>{row.creator}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<p className="pr-note">{view.table.freeAccount}</p>
		</section>
	);
}

function Questions({ view }: { view: PricingView }) {
	const headingId = useId();
	return (
		<section
			className={`${CONTAINER} ${SECTION_PY} pt-0 sm:pt-0 lg:pt-0`}
			aria-labelledby={headingId}
		>
			<h2 id={headingId} className="lp-h3">
				Questions
			</h2>
			<div className="pr-faq">
				{view.faq.map((item) => (
					<details key={item.question}>
						<summary>{item.question}</summary>
						<p>{item.answer}</p>
					</details>
				))}
			</div>
		</section>
	);
}
