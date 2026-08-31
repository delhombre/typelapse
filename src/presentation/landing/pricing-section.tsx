import type { BillingCatalog, BillingPrice } from "@/domain/ports/billing.port";
import { Plan } from "@/domain/value-objects/plan";
import { StripeBillingAdapter } from "@/infrastructure/billing/stripe-billing.adapter";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check } from "reicon-react";
import { Eyebrow, Reveal, RevealGroup, RevealItem } from "./primitives";
import { CONTAINER, SECTION_PY } from "./tokens";
import "./pricing-section.css";

interface PackageFeature {
	readonly label: string;
	readonly detail?: string;
}

interface PackageCardProps {
	readonly name: string;
	readonly mode: string;
	readonly status: string;
	readonly summary: string;
	readonly features: readonly PackageFeature[];
	readonly tone?: "default" | "creator" | "later";
	readonly action?: { readonly label: string; readonly to: string };
	readonly footer?: string;
	readonly price?: { readonly amount: string; readonly cadence: string };
}

export interface PricingSectionProps {
	/** Test/SSR seam. Hosted browsers otherwise discover the live Stripe catalog. */
	readonly catalog?: BillingCatalog;
}

function hostedVideoProfile(plan: Plan): string {
	if (!plan.capabilities.allowsCloudExport) {
		return "Cloud video is not included";
	}
	const resolution =
		plan.capabilities.maxLongEdge >= 3_840 ? "4K" : `${plan.capabilities.maxShortEdge}p`;
	return `${resolution} · 30 or ${plan.capabilities.maxFps} fps`;
}

function PackageCard({
	name,
	mode,
	status,
	summary,
	features,
	tone = "default",
	action,
	footer,
	price,
}: PackageCardProps) {
	return (
		<article className="lp-package-card" data-tone={tone}>
			<header>
				<div className="lp-package-meta">
					<span>{mode}</span>
					<span className="lp-package-status">{status}</span>
				</div>
				<h3>{name}</h3>
				{price ? (
					<div className="lp-package-price">
						<strong>{price.amount}</strong>
						<span>{price.cadence}</span>
					</div>
				) : null}
				<p>{summary}</p>
			</header>

			<ul>
				{features.map((feature) => (
					<li key={feature.label}>
						<Check size={13} aria-hidden="true" />
						<span>
							{feature.label}
							{feature.detail ? <small>{feature.detail}</small> : null}
						</span>
					</li>
				))}
			</ul>

			<div className="lp-package-foot">
				{action ? (
					<Link to={action.to} className="lp-package-action">
						{action.label}
						<span aria-hidden="true">↗</span>
					</Link>
				) : null}
				{footer ? <p>{footer}</p> : null}
			</div>
		</article>
	);
}

function priceAmount(price: BillingPrice): string {
	return new Intl.NumberFormat("en", {
		style: "currency",
		currency: price.currency,
		minimumFractionDigits: price.unitAmount % 100 === 0 ? 0 : 2,
		maximumFractionDigits: 2,
	}).format(price.unitAmount / 100);
}

/** Honest packaging: the local editor is the product; hosted plans buy service. */
export function PricingSection({ catalog: providedCatalog }: PricingSectionProps = {}) {
	const local = Plan.local();
	const free = Plan.free();
	const creator = Plan.pro();
	const [liveCatalog, setLiveCatalog] = useState<BillingCatalog | null>(providedCatalog ?? null);
	useEffect(() => {
		if (providedCatalog || import.meta.env.VITE_TYPELAPSE_DEPLOYMENT_MODE !== "hosted") {
			return;
		}
		let active = true;
		void new StripeBillingAdapter()
			.getCatalog()
			.then((catalog) => {
				if (active) setLiveCatalog(catalog);
			})
			.catch(() => undefined);
		return () => {
			active = false;
		};
	}, [providedCatalog]);
	const monthly = liveCatalog?.creator.monthly;
	const annual = liveCatalog?.creator.annual;
	const creatorPrice = monthly
		? {
				amount: priceAmount(monthly),
				cadence: annual ? `monthly · ${priceAmount(annual)} annually` : "monthly",
			}
		: undefined;

	return (
		<section id="pricing" aria-labelledby="pricing-title" className={`${CONTAINER} ${SECTION_PY}`}>
			<Reveal className="lp-pricing-heading">
				<Eyebrow>Packaging</Eyebrow>
				<div>
					<h2 id="pricing-title" className="lp-h2 text-ink">
						The editor stays open. The cloud adds leverage.
					</h2>
					<p className="lp-line">
						Start on-device with no account. Hosted plans pay for persistence, private media and
						render compute — never access to the canvas.
					</p>
				</div>
			</Reveal>

			<RevealGroup className="lp-package-grid">
				<RevealItem>
					<PackageCard
						name="On-device"
						mode={`${local.label} mode`}
						status="Available now"
						summary="A private, accountless studio that keeps the working project in your browser."
						features={[
							{ label: "Text, code, image, video and audio scenes" },
							{ label: "Durable IndexedDB autosave", detail: "on this browser" },
							{ label: "Editable project file", detail: "original media stays on-device" },
							{ label: "No account or hosted plan gate" },
						]}
						action={{ label: "Open local studio", to: "/app" }}
					/>
				</RevealItem>

				<RevealItem>
					<PackageCard
						name="Hosted Free"
						mode={free.label}
						status="Hosted launch"
						summary="A gentle hosted starting point for saving and returning to small projects."
						features={[
							{ label: "Cloud projects and private media" },
							{ label: "Signed-in project continuity" },
							{ label: hostedVideoProfile(free) },
						]}
						action={{ label: "Start with cloud", to: "/app" }}
						footer="Same scene editor. Service limits apply only to hosted work."
					/>
				</RevealItem>

				<RevealItem>
					<PackageCard
						name={creator.label}
						mode="Hosted"
						status="First paid plan"
						tone="creator"
						price={creatorPrice}
						summary="For one creator who wants private cloud continuity and dependable render compute."
						features={[
							{ label: "One seat, private projects and assets" },
							{ label: "Private MP4 and WebM", detail: "from a saved cloud revision" },
							{ label: hostedVideoProfile(creator) },
							{ label: "Audio on request", detail: "signed private download" },
						]}
						action={{ label: "Choose Creator", to: "/app" }}
						footer={
							creatorPrice
								? "Sign in, then continue through secure Stripe Checkout."
								: "Checkout appears only when hosted billing is live."
						}
					/>
				</RevealItem>

				<RevealItem>
					<PackageCard
						name="Studio"
						mode="Planned"
						status="Later"
						tone="later"
						summary="A future collaboration package, held back until the product truly supports teams."
						features={[
							{ label: "Planned shared workspaces and seats" },
							{ label: "Planned higher limits and priority" },
							{ label: "Planned batch and agent API workflows" },
						]}
						footer="Not for sale. No team claim before team workflows ship."
					/>
				</RevealItem>
			</RevealGroup>

			<Reveal className="lp-pricing-disclosure">
				<span>Measured, then priced</span>
				<p>
					{creatorPrice
						? "Prices come directly from the active Stripe catalog; entitlement still comes only from signed webhooks."
						: "Hosted prices and render allowances will be published after mixed-media cost telemetry — not guessed for a landing page."}
				</p>
			</Reveal>
		</section>
	);
}
