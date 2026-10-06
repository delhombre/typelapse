import { randomUUID } from "node:crypto";
import { type IncomingMessage, type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A stand-in for the slice of api.polar.sh the billing code touches: products,
 * checkouts, customer sessions and subscriptions, over real HTTP, so the Polar
 * SDK runs unmodified against it (`POLAR_API_URL` points the gateway here). It
 * keeps what it was asked, so a test can say what the product sent, and it lets
 * a test set the subscription a webhook will make the API read back.
 */

export interface FakeProduct {
	id: string;
	name: string;
	is_archived: boolean;
	is_recurring: boolean;
	recurring_interval: "month" | "year";
	recurring_interval_count: number;
	prices: {
		id: string;
		amount_type: "fixed";
		price_currency: string;
		price_amount: number;
		is_archived: boolean;
	}[];
}

export interface FakeSubscription {
	id: string;
	status: string;
	customer_id: string;
	product_id: string;
	current_period_end: string;
	cancel_at_period_end: boolean;
}

export interface FakePolar {
	readonly products: Map<string, FakeProduct>;
	readonly subscriptions: Map<string, FakeSubscription>;
	/** Every request body the API received, in order, by "METHOD /path". */
	readonly requests: { readonly route: string; readonly body: unknown }[];
	/** Where the checkout and portal URLs it hands back point. */
	readonly checkoutOrigin: string;
	start(port?: number): Promise<string>;
	stop(): Promise<void>;
}

function send(response: import("node:http").ServerResponse, status: number, body: unknown): void {
	response.statusCode = status;
	response.setHeader("content-type", "application/json");
	response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
	const chunks: Buffer[] = [];
	for await (const chunk of request) chunks.push(chunk as Buffer);
	const text = Buffer.concat(chunks).toString("utf8");
	return text ? JSON.parse(text) : undefined;
}

export function createFakePolar(options: { readonly checkoutOrigin?: string } = {}): FakePolar {
	const checkoutOrigin = options.checkoutOrigin ?? "https://sandbox.polar.sh";
	const products = new Map<string, FakeProduct>();
	const subscriptions = new Map<string, FakeSubscription>();
	const requests: { route: string; body: unknown }[] = [];
	let server: Server | null = null;

	const handle = async (
		request: IncomingMessage,
		response: import("node:http").ServerResponse,
	): Promise<void> => {
		const url = new URL(request.url ?? "/", "http://fake.polar");
		const path = url.pathname.replace(/\/$/, "");
		const method = request.method ?? "GET";
		const body = await readJson(request);
		if (!path.startsWith("/__")) requests.push({ route: `${method} ${path}`, body });

		if (method === "GET" && path === "/v1/products") {
			const query = url.searchParams.get("query");
			const items = [...products.values()].filter(
				(product) => !product.is_archived && (!query || product.name.includes(query)),
			);
			return send(response, 200, {
				items,
				pagination: { total_count: items.length, max_page: 1 },
			});
		}
		if (method === "POST" && path === "/v1/products") {
			const input = body as {
				name: string;
				recurring_interval: "month" | "year";
				prices: { price_currency?: string; price_amount: number }[];
			};
			const product: FakeProduct = {
				id: `prod_fake_${randomUUID().slice(0, 8)}`,
				name: input.name,
				is_archived: false,
				is_recurring: true,
				recurring_interval: input.recurring_interval,
				recurring_interval_count: 1,
				prices: input.prices.map((price) => ({
					id: `price_fake_${randomUUID().slice(0, 8)}`,
					amount_type: "fixed" as const,
					price_currency: price.price_currency ?? "usd",
					price_amount: price.price_amount,
					is_archived: false,
				})),
			};
			products.set(product.id, product);
			return send(response, 201, product);
		}
		if (method === "GET" && path === "/__requests") {
			return send(response, 200, requests);
		}
		// Not part of Polar: how a journey sets the subscription the API will read back.
		const controlled = path.match(/^\/__subscriptions\/([^/]+)$/)?.[1];
		if (method === "PUT" && controlled) {
			subscriptions.set(controlled, { id: controlled, ...(body as Omit<FakeSubscription, "id">) });
			return send(response, 200, subscriptions.get(controlled));
		}
		const productId = path.match(/^\/v1\/products\/([^/]+)$/)?.[1];
		if (method === "GET" && productId) {
			const product = products.get(productId);
			return product ? send(response, 200, product) : send(response, 404, { detail: "not found" });
		}
		if (method === "POST" && path === "/v1/checkouts") {
			const id = `co_fake_${randomUUID().slice(0, 8)}`;
			return send(response, 201, { id, url: `${checkoutOrigin}/checkout/${id}` });
		}
		if (method === "POST" && path === "/v1/customer-sessions") {
			const external = (body as { external_customer_id: string }).external_customer_id;
			return send(response, 201, {
				customer_portal_url: `${checkoutOrigin}/portal/${encodeURIComponent(external)}?token=fake`,
			});
		}
		const subscriptionId = path.match(/^\/v1\/subscriptions\/([^/]+)$/)?.[1];
		if (method === "GET" && subscriptionId) {
			const subscription = subscriptions.get(subscriptionId);
			return subscription
				? send(response, 200, subscription)
				: send(response, 404, { detail: "not found" });
		}
		send(response, 404, { detail: `no route for ${method} ${path}` });
	};

	return {
		products,
		subscriptions,
		requests,
		checkoutOrigin,
		async start(port = 0) {
			server = createServer((request, response) => {
				void handle(request, response).catch((error) =>
					send(response, 500, { detail: String(error) }),
				);
			});
			await new Promise<void>((resolve) => server?.listen(port, "127.0.0.1", resolve));
			return `http://127.0.0.1:${(server?.address() as AddressInfo).port}`;
		},
		stop: () =>
			new Promise<void>((resolve) => {
				if (!server) return resolve();
				server.close(() => resolve());
			}),
	};
}
