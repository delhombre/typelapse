import { createBillingProjectionStore } from "../db/billing-projection.store";
import type { CreatorDatabase } from "../db/database";
import { type BillingService, createBillingService } from "./billing-service";
import { polarGatewayFromEnv } from "./polar-gateway";

type BillingEnvironment = Readonly<Record<string, string | undefined>>;

export function billingServiceFromEnv(input: {
	readonly db: CreatorDatabase;
	readonly env?: BillingEnvironment;
}): BillingService | null {
	const env = input.env ?? process.env;
	const gateway = polarGatewayFromEnv(env);
	const monthlyProductId = env.POLAR_CREATOR_MONTHLY_PRODUCT_ID;
	const appUrl = env.TYPELAPSE_APP_URL ?? env.BETTER_AUTH_URL;
	if (!gateway || !monthlyProductId || !appUrl) {
		return null;
	}
	const productIds = new Map<"monthly" | "annual", string>([["monthly", monthlyProductId]]);
	if (env.POLAR_CREATOR_ANNUAL_PRODUCT_ID) {
		productIds.set("annual", env.POLAR_CREATOR_ANNUAL_PRODUCT_ID);
	}
	return createBillingService({
		store: createBillingProjectionStore({ db: input.db }),
		gateway,
		config: {
			creatorProductIds: productIds,
			appUrl,
		},
	});
}
