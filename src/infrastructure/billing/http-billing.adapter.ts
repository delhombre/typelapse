import type {
	BillingCadence,
	BillingCatalog,
	BillingNotice,
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

const HEALTH_TIMEOUT_MS = 4000;

/** Browser adapter for the server-authoritative billing API (Polar behind it). */
export class HttpBillingAdapter implements BillingPort {
	// The default wraps fetch rather than storing it: called as `this.fetcher(...)`
	// a bare window.fetch throws "Illegal invocation" in every browser.
	constructor(private readonly fetcher: typeof fetch = (input, init) => fetch(input, init)) {}

	/**
	 * The server's own capability read. Anything but a clear "billing: false"
	 * (an unreachable server, an odd body) leaves billing assumed, so a failed
	 * probe never hides a billing that works.
	 */
	async isConfigured(): Promise<boolean> {
		try {
			// A hung read must not keep a paying account on the Free default.
			const response = await this.fetcher("/api/health", {
				signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
			});
			const body = response.ok ? await response.json().catch(() => null) : null;
			const capabilities = isRecord(body) ? body.capabilities : undefined;
			return !(isRecord(capabilities) && capabilities.billing === false);
		} catch {
			return true;
		}
	}

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

	async getNotice(): Promise<BillingNotice | null> {
		const response = await this.fetcher("/api/billing/plan", { credentials: "include" });
		const body = await responseBody(response);
		const notice = isRecord(body.plan) ? body.plan.notice : undefined;
		if (
			!isRecord(notice) ||
			(notice.kind !== "past-due" && notice.kind !== "ended") ||
			typeof notice.sentence !== "string" ||
			!notice.sentence.trim()
		) {
			return null;
		}
		return { kind: notice.kind, sentence: notice.sentence };
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
			throw new Error("Billing returned an invalid checkout session");
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
