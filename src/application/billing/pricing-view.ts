// Relative rather than aliased, like plan-allowance beside it: this file shares
// a folder with code the Hono server loads under tsx, which has no "@/" mapping.
import { RESOLUTION_TIERS } from "../../domain/entities/render-config";
import type {
	BillingCadence,
	BillingCatalog,
	BillingPort,
	BillingPrice,
} from "../../domain/ports/billing.port";
import { Plan } from "../../domain/value-objects/plan";
import { ROUTE_HEADS } from "../routing/route-head";
import { DEVICE_MAX_FPS, deviceIntro } from "./device-export-claim";
import { formatBytes, formatMinutes, hostedOutputGraceDays } from "./plan-allowance";
import { priceLabel } from "./price-label";

/**
 * The public pricing page as data (ux-waves D3, #256): what the Free card and the
 * Creator card say, the device against hosted table and the questions. Every
 * number is read from the catalog or from the Plan value object, so the page
 * cannot promise what the plan rules do not grant, and it shows no price at all
 * until the catalog states one (final prices wait on #79).
 */

export { DEVICE_MAX_FPS };

/** What the page knows about the catalog: still asking, no answer, or an answer. */
export type CatalogReading =
	| { readonly kind: "pending" }
	| { readonly kind: "unavailable" }
	| { readonly kind: "ready"; readonly catalog: BillingCatalog };

/**
 * One read of the public catalog. A 503 (billing not configured, the provider
 * down), a network failure and an empty catalog all mean the same to a visitor:
 * there is no price to show. None of them is an error worth a screen.
 */
export async function loadCatalogReading(
	billing: Pick<BillingPort, "getCatalog">,
): Promise<CatalogReading> {
	try {
		return { kind: "ready", catalog: await billing.getCatalog() };
	} catch {
		return { kind: "unavailable" };
	}
}

export interface PriceLine {
	readonly cadence: BillingCadence;
	readonly label: string;
	/** A saving the two prices prove, or null. */
	readonly note: string | null;
}

export type CreatorPrice =
	| { readonly state: "pending" }
	| { readonly state: "unpriced" }
	| { readonly state: "priced"; readonly lines: readonly PriceLine[] };

export interface ComparisonRow {
	readonly label: string;
	readonly device: string;
	readonly creator: string;
}

export interface PricingView {
	/** The page's meta description: the Free card's claim, from the same tier and rate. */
	readonly description: string;
	/** The payment provider behind this build is its sandbox: say so beside the price. */
	readonly testMode: boolean;
	readonly device: { readonly points: readonly string[] };
	readonly creator: {
		readonly price: CreatorPrice;
		readonly adds: readonly string[];
		/**
		 * The card's one action. Only a catalog that states a price proves billing is
		 * there, so only then does it promise a hosted render; a 503 means the studio
		 * has no Cloud to choose, and the card says only that it opens the studio.
		 */
		readonly action: { readonly label: string; readonly hint: string };
	};
	readonly table: {
		readonly rows: readonly ComparisonRow[];
		/** What a free account holds, which Creator is not sold on. */
		readonly freeAccount: string;
	};
	readonly faq: readonly { readonly question: string; readonly answer: string }[];
}

/** Whole percent the annual price saves over twelve months, rounded down so it is never overstated. */
function annualSaving(monthly: BillingPrice, annual: BillingPrice): number | null {
	if (monthly.currency !== annual.currency) {
		return null;
	}
	const saved = Math.floor((1 - annual.unitAmount / (12 * monthly.unitAmount)) * 100);
	return saved >= 1 ? saved : null;
}

function creatorPrice(reading: CatalogReading): CreatorPrice {
	if (reading.kind === "pending") {
		return { state: "pending" };
	}
	if (reading.kind === "unavailable") {
		return { state: "unpriced" };
	}
	const { monthly, annual } = reading.catalog.creator;
	const saving = monthly && annual ? annualSaving(monthly, annual) : null;
	const lines: PriceLine[] = [];
	// Annual first: the cheaper way in is the one we would rather be asked about.
	if (annual) {
		lines.push({
			cadence: "annual",
			label: priceLabel(annual, "annual"),
			note: saving === null ? null : `Saves ${saving}% against paying monthly`,
		});
	}
	if (monthly) {
		lines.push({ cadence: "monthly", label: priceLabel(monthly, "monthly"), note: null });
	}
	return lines.length === 0 ? { state: "unpriced" } : { state: "priced", lines };
}

/** What Creator adds, in words that hold with or without a price on the page. */
const CREATOR_ADDS = [
	"Hosted renders with captions and audio baked in",
	"Room for more cloud projects and private media",
	"Past renders stay downloadable while you subscribe",
	"Works in a browser with no video encoder",
] as const;

function creatorCard(price: CreatorPrice): PricingView["creator"] {
	const priced = price.state === "priced";
	return {
		price,
		adds: CREATOR_ADDS,
		action: priced
			? { label: "Start a hosted render", hint: "Opens the studio; choose Cloud under Where." }
			: { label: "See Creator in the studio", hint: "Opens the studio." },
	};
}

function comparisonRows(creator: Plan): readonly ComparisonRow[] {
	const minutes = formatMinutes(creator.limitFor("hostedRenderTime"));
	return [
		{
			label: "Captions and audio in the video",
			// The on-device painter draws neither yet (frame-painter/scene.ts); only a hosted render bakes them.
			device: "Not yet",
			creator: creator.capabilities.allowsCloudExport ? "Baked in" : "Not included",
		},
		{ label: "Where it renders", device: "Your machine", creator: "Our servers" },
		{ label: "Account", device: "None", creator: "Required" },
		{
			label: "Hosted render time",
			device: "Not needed",
			creator: `${minutes} minutes a month`,
		},
		{
			label: "Projects kept in your account",
			device: "Stay on this device",
			creator: `Up to ${creator.limitFor("cloudProjects")}`,
		},
		{
			label: "Private media",
			device: "Stays on this device",
			creator: `Up to ${formatBytes(creator.limitFor("mediaBytes"))}`,
		},
		{
			label: "Past hosted renders",
			device: "None to keep",
			creator: "Kept while you subscribe",
		},
	];
}

function questions(free: Plan) {
	const top = RESOLUTION_TIERS.at(-1);
	const days = hostedOutputGraceDays(free);
	return [
		{
			question: "Is the device export really free?",
			answer: `Yes. It runs in your browser, on your machine, and nothing is uploaded. MP4 and WebM go up to ${top} at ${DEVICE_MAX_FPS} fps with no watermark and no account.`,
		},
		{
			question: "What happens to my videos if I cancel?",
			answer: `The files you already have are yours. Renders made on our servers stay downloadable for ${days} days after your plan ends, so there is time to save them. Anything you exported on your own device was never ours to keep.`,
		},
		{
			question: "How do I cancel?",
			answer:
				"From Manage billing in your account. It opens the payment provider's page, where you can cancel and download your invoices.",
		},
		{
			question: "Do I need an account to make a video?",
			answer:
				"No. The studio works as soon as it opens. An account adds private cloud copies of your projects and, with Creator, hosted renders.",
		},
		{
			question: "Refunds",
			// A placeholder until Bruno sets the terms (see the PR for #256): it promises nothing.
			answer:
				"The refund terms for Creator are being written and will be set out here before it goes on sale. Payments go through Polar, which handles your card and issues your receipt.",
		},
	];
}

export function pricingView(input: { readonly reading: CatalogReading }): PricingView {
	const free = Plan.free();
	const creator = Plan.pro();
	const sandbox = input.reading.kind === "ready" && input.reading.catalog.environment === "sandbox";
	return {
		description: ROUTE_HEADS.pricing.description,
		testMode: sandbox,
		device: {
			points: [deviceIntro(), "No watermark", "Nothing uploaded, no account"],
		},
		creator: creatorCard(creatorPrice(input.reading)),
		table: {
			rows: comparisonRows(creator),
			freeAccount: `A free account keeps up to ${free.limitFor("cloudProjects")} cloud projects and ${formatBytes(free.limitFor("mediaBytes"))} of private media. Hosted renders come with ${creator.label}.`,
		},
		faq: questions(free),
	};
}
