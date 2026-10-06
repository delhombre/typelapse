import { createFakePolar } from "../../support/fake-polar";
import { POLAR_E2E } from "./polar";

/**
 * The double the hosted API's billing talks to when no sandbox token is set. It
 * serves the two Creator products and nothing else until a journey asks it to.
 */
const fake = createFakePolar();
for (const [cadence, id] of Object.entries(POLAR_E2E.fakeProducts)) {
	fake.products.set(id, {
		id,
		name: cadence === "monthly" ? "Creator, monthly" : "Creator, yearly",
		is_archived: false,
		is_recurring: true,
		recurring_interval: cadence === "monthly" ? "month" : "year",
		recurring_interval_count: 1,
		prices: [
			{
				id: `price_${id}`,
				amount_type: "fixed",
				price_currency: "usd",
				price_amount: cadence === "monthly" ? 1200 : 9900,
				is_archived: false,
			},
		],
	});
}
await fake.start(POLAR_E2E.fakePort);
console.log(`Fake Polar listening on ${POLAR_E2E.fakeUrl}`);
