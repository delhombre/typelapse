import { Hono } from "hono";

const billingRoute = new Hono();

/**
 * Create a Stripe Checkout Session: STUB.
 *
 * Production:
 *   const session = await stripe.checkout.sessions.create({
 *     mode: "subscription",
 *     line_items: [{ price: PRO_PRICE_ID, quantity: 1 }],
 *     success_url,
 *     cancel_url,
 *   });
 *   return c.json({ url: session.url, sessionId: session.id });
 */
billingRoute.post("/checkout", (c) => {
	return c.json({
		url: "https://checkout.stripe.com/pay/placeholder",
		sessionId: `cs_test_${Date.now().toString(36)}`,
		placeholder: true,
	});
});

/**
 * Stripe webhook: STUB.
 *
 * Production: verify the signature with STRIPE_WEBHOOK_SECRET, then on
 * `checkout.session.completed` mark the customer as Pro, and on
 * `customer.subscription.deleted` revert them to Free.
 */
billingRoute.post("/webhook", (c) => {
	return c.json({ received: true, placeholder: true });
});

export { billingRoute };
