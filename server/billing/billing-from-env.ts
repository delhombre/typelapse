import type { CreatorDatabase } from "../db/database";
import { createBillingProjectionStore } from "../db/billing-projection.store";
import { createBillingService, type BillingService } from "./billing-service";
import { stripeGatewayFromEnv } from "./stripe-gateway";

type BillingEnvironment = Readonly<Record<string, string | undefined>>;

export function billingServiceFromEnv(input: {
	readonly db: CreatorDatabase;
	readonly env?: BillingEnvironment;
}): BillingService | null {
	const env = input.env ?? process.env;
	const stripe = stripeGatewayFromEnv(env);
	const monthlyPriceId = env.STRIPE_CREATOR_MONTHLY_PRICE_ID;
	const appUrl = env.TYPELAPSE_APP_URL ?? env.BETTER_AUTH_URL;
	if (!stripe || !monthlyPriceId || !appUrl) {
		return null;
	}
	const priceIds = new Map<"monthly" | "annual", string>([["monthly", monthlyPriceId]]);
	if (env.STRIPE_CREATOR_ANNUAL_PRICE_ID) {
		priceIds.set("annual", env.STRIPE_CREATOR_ANNUAL_PRICE_ID);
	}
	return createBillingService({
		store: createBillingProjectionStore({ db: input.db }),
		stripe,
		config: {
			creatorPriceIds: priceIds,
			appUrl,
		},
	});
}
