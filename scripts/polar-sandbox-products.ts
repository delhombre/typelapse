/**
 * Creates the two Creator products in the Polar SANDBOX organisation, from the
 * command line, never by hand (decision log 2026-10-06-billing-polar, D3):
 * "Creator, monthly" at $12 and "Creator, yearly" at $99, in USD. Idempotent: a
 * product is found by name and interval before it is created, so running it twice
 * leaves the same two products. One found with a different price is not reused: the run
 * fails naming the mismatch, so a wrong price is fixed or archived on purpose.
 * Prints the two ids as the variables the API reads.
 *
 *   pnpm billing:sandbox-products
 *
 * Reads POLAR_SANDBOX_ACCESS_TOKEN (a sandbox.polar.sh organisation access
 * token) from the environment or .env. It never touches production: the client
 * is built for the sandbox, and the token is never printed.
 */
import { createPolar } from "@polar-sh/sdk/2026-10";

type PolarClient = Pick<ReturnType<typeof createPolar>, "products">;

interface CreatorProductSpec {
	readonly key: "monthly" | "annual";
	readonly name: string;
	readonly interval: "month" | "year";
	/** Cents, in USD. */
	readonly amount: number;
}

const CREATOR_PRODUCTS: readonly CreatorProductSpec[] = [
	{ key: "monthly", name: "Creator, monthly", interval: "month", amount: 1200 },
	{ key: "annual", name: "Creator, yearly", interval: "year", amount: 9900 },
];

export interface CreatorProductIds {
	readonly monthly: string;
	readonly annual: string;
}

export async function ensureCreatorProducts(polar: PolarClient): Promise<CreatorProductIds> {
	const ids: Record<string, string> = {};
	for (const spec of CREATOR_PRODUCTS) {
		const found = await polar.products.list({ query: spec.name, is_archived: false, limit: 100 });
		const existing = found.items.find(
			(product) =>
				product.name === spec.name &&
				!product.is_archived &&
				product.recurring_interval === spec.interval,
		);
		if (existing) {
			const fixed = existing.prices.find(
				(price) =>
					price.amount_type === "fixed" && price.price_currency === "usd" && !price.is_archived,
			);
			const amount = fixed && "price_amount" in fixed ? fixed.price_amount : undefined;
			if (amount !== spec.amount) {
				throw new Error(
					`${spec.name} is priced ${amount ?? "without a USD fixed price"} USD cents, expected ${spec.amount}: archive it or fix its price in the sandbox, then run again.`,
				);
			}
		}
		const product =
			existing ??
			(await polar.products.create({
				name: spec.name,
				recurring_interval: spec.interval,
				prices: [{ amount_type: "fixed", price_currency: "usd", price_amount: spec.amount }],
			}));
		ids[spec.key] = product.id;
	}
	return ids as unknown as CreatorProductIds;
}

if (process.argv[1]?.endsWith("polar-sandbox-products.ts")) {
	const accessToken = process.env.POLAR_SANDBOX_ACCESS_TOKEN;
	if (!accessToken) {
		console.error("POLAR_SANDBOX_ACCESS_TOKEN is not set (put it in .env).");
		process.exit(1);
	}
	const ids = await ensureCreatorProducts(createPolar({ accessToken, environment: "sandbox" }));
	console.log(`POLAR_CREATOR_MONTHLY_PRODUCT_ID=${ids.monthly}`);
	console.log(`POLAR_CREATOR_ANNUAL_PRODUCT_ID=${ids.annual}`);
}
