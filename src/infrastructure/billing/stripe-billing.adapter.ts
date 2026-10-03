import type {
	BillingCadence,
	BillingCatalog,
	BillingPort,
	BillingPortalSession,
	CheckoutSession,
} from "@/domain/ports/billing.port";
import { Plan } from "@/domain/value-objects/plan";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
	const body = await response.json().catch(() => null);
	if (!response.ok) {
		const message =
			isRecord(body) && typeof body.error === "string" ? body.error : "Billing failed";
		throw new Error(message);
	}
	if (!isRecord(body)) {
		throw new Error("Billing returned an invalid response");
	}
	return body;
}

function secureRedirect(value: unknown): string {
	if (typeof value !== "string") {
		throw new Error("Billing did not return a secure redirect URL");
	}
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error("Billing did not return a secure redirect URL");
	}
	if (url.protocol !== "https:") {
		throw new Error("Billing did not return a secure redirect URL");
	}
	return url.toString();
}

function billingPrice(value: unknown): { currency: string; unitAmount: number } | undefined {
	if (!isRecord(value)) return undefined;
	if (
		typeof value.currency !== "string" ||
		!/^[A-Z]{3}$/.test(value.currency) ||
		typeof value.unitAmount !== "number" ||
		!Number.isSafeInteger(value.unitAmount) ||
		value.unitAmount <= 0
	) {
		throw new Error("Billing returned an invalid price");
	}
	return { currency: value.currency, unitAmount: value.unitAmount };
}

/** Browser adapter for the server-authoritative Stripe integration. */
export class StripeBillingAdapter implements BillingPort {
	// The default wraps fetch rather than storing it: called as `this.fetcher(...)`
	// a bare window.fetch throws "Illegal invocation" in every browser.
	constructor(private readonly fetcher: typeof fetch = (input, init) => fetch(input, init)) {}

	async getCatalog(): Promise<BillingCatalog> {
		const response = await this.fetcher("/api/billing/catalog", { credentials: "include" });
		const body = await responseBody(response);
		if (!isRecord(body.creator)) {
			throw new Error("Billing returned an invalid catalog");
		}
		const monthly = billingPrice(body.creator.monthly);
		const annual = billingPrice(body.creator.annual);
		if (!monthly && !annual) {
			throw new Error("Billing returned an empty catalog");
		}
		return { creator: { ...(monthly ? { monthly } : {}), ...(annual ? { annual } : {}) } };
	}

	async getCurrentPlan(): Promise<Plan> {
		const response = await this.fetcher("/api/billing/plan", { credentials: "include" });
		const body = await responseBody(response);
		const tier = isRecord(body.plan) ? body.plan.tier : undefined;
		return tier === "creator" ? Plan.pro() : Plan.free();
	}

	async getAllowance(): Promise<string> {
		const response = await this.fetcher("/api/billing/allowance", { credentials: "include" });
		const body = await responseBody(response);
		const sentence = isRecord(body.allowance) ? body.allowance.sentence : undefined;
		if (typeof sentence !== "string" || !sentence.trim()) {
			throw new Error("Billing returned an invalid allowance");
		}
		return sentence;
	}

	async startCheckout(cadence: BillingCadence): Promise<CheckoutSession> {
		const response = await this.fetcher("/api/billing/checkout", {
			method: "POST",
			credentials: "include",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ cadence }),
		});
		const body = await responseBody(response);
		if (typeof body.sessionId !== "string") {
			throw new Error("Billing returned an invalid Checkout session");
		}
		return { url: secureRedirect(body.url), sessionId: body.sessionId };
	}

	async openPortal(): Promise<BillingPortalSession> {
		const response = await this.fetcher("/api/billing/portal", {
			method: "POST",
			credentials: "include",
		});
		const body = await responseBody(response);
		return { url: secureRedirect(body.url) };
	}
}
