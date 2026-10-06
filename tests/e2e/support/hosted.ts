import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type APIRequestContext, type Page, expect, request } from "@playwright/test";
import pg from "pg";

/**
 * What the hosted journeys share: where the services are, the environment the
 * API and the worker start with, and the few facts a journey cannot reach
 * through the product. A subscription is the one such fact: the plan is
 * written only by a signed webhook, so the journeys write the same row the
 * webhook writes, straight into the service database.
 */

/** Every address and path, overridable so CI and a laptop can differ. */
export const HOSTED = (() => {
	const state = process.env.E2E_HOSTED_STATE ?? join(tmpdir(), "typelapse-e2e-hosted");
	const appPort = Number(process.env.E2E_HOSTED_PORT ?? 5281);
	const apiPort = Number(process.env.E2E_HOSTED_API_PORT ?? 3181);
	const pgPort = Number(process.env.E2E_PG_PORT ?? 54381);
	const minioPort = Number(process.env.E2E_MINIO_PORT ?? 9181);
	return {
		state,
		appPort,
		apiPort,
		appUrl: `http://localhost:${appPort}`,
		apiUrl: `http://127.0.0.1:${apiPort}`,
		databaseUrl:
			process.env.E2E_DATABASE_URL ?? `postgres://postgres:typelapse@127.0.0.1:${pgPort}/typelapse`,
		storageUrl: process.env.E2E_R2_ENDPOINT ?? `https://localhost:${minioPort}`,
		/** The self-signed certificate services.sh makes for MinIO. */
		caFile: process.env.E2E_HOSTED_CA ?? join(state, "certs", "public.crt"),
		bucket: "typelapse",
		accessKeyId: "typelapse",
		secretAccessKey: "typelapse1234",
	};
})();

// Generated once in the runner and inherited by every process it starts.
process.env.E2E_AUTH_SECRET ??= randomBytes(32).toString("base64");

/** The environment of the hosted API, the render worker and prepare.ts. */
export function hostedServerEnv(): Record<string, string> {
	return {
		TYPELAPSE_DEPLOYMENT_MODE: "hosted",
		DATABASE_URL: HOSTED.databaseUrl,
		PORT: String(HOSTED.apiPort),
		BETTER_AUTH_SECRET: process.env.E2E_AUTH_SECRET ?? "",
		// The preview proxies /api and /v/ to the API, so the browser sees one
		// origin: the auth cookie, the page links and CORS all name the preview.
		BETTER_AUTH_URL: HOSTED.appUrl,
		TYPELAPSE_APP_URL: HOSTED.appUrl,
		CORS_ORIGIN: HOSTED.appUrl,
		R2_ENDPOINT: HOSTED.storageUrl,
		R2_ACCESS_KEY_ID: HOSTED.accessKeyId,
		R2_SECRET_ACCESS_KEY: HOSTED.secretAccessKey,
		R2_BUCKET: HOSTED.bucket,
		R2_ACCOUNT_ID: "e2e",
		TYPELAPSE_COMPILER_VERSION: "e2e",
		TYPELAPSE_RENDER_TEMP_ROOT: join(HOSTED.state, "render-tmp"),
		NODE_EXTRA_CA_CERTS: HOSTED.caFile,
	};
}

let pool: pg.Pool | null = null;

function database(): pg.Pool {
	pool ??= new pg.Pool({ connectionString: HOSTED.databaseUrl, max: 2, allowExitOnIdle: true });
	return pool;
}

async function one<T>(sql: string, values: unknown[]): Promise<T> {
	const result = await database().query(sql, values);
	if (result.rowCount !== 1) {
		throw new Error(`expected one row, got ${result.rowCount}: ${sql}`);
	}
	return result.rows[0] as T;
}

export interface TestAccount {
	readonly name: string;
	readonly email: string;
	readonly password: string;
}

/** A fresh account per journey, so no journey sees another's projects or plan. */
export function newAccount(label: string): TestAccount {
	const tag = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
	return {
		name: `E2E ${label}`,
		email: `e2e-${label}-${tag}@typelapse.test`,
		password: randomBytes(12).toString("base64url"),
	};
}

export async function accountId(email: string): Promise<string> {
	const row = await one<{ id: string }>(`SELECT id FROM "user" WHERE email = $1`, [email]);
	return row.id;
}

/**
 * The row a `subscription.active` webhook leaves for an active
 * Creator subscription, with the event cursor a real event would set.
 */
export async function makeCreator(email: string): Promise<void> {
	const id = await accountId(email);
	await database().query(
		`INSERT INTO subscription_projections (
			user_id, plan_tier, provider_status, provider_customer_id, provider_subscription_id,
			provider_product_id, current_period_end, cancel_at_period_end, last_event_id, last_event_created_at
		) VALUES ($1, 'creator', 'active', $2, $3, 'prod_e2e_creator', now() + interval '30 days',
			false, $4, now())
		ON CONFLICT (user_id) DO UPDATE SET
			plan_tier = 'creator', provider_status = 'active',
			provider_customer_id = EXCLUDED.provider_customer_id,
			provider_subscription_id = EXCLUDED.provider_subscription_id,
			provider_product_id = EXCLUDED.provider_product_id,
			current_period_end = EXCLUDED.current_period_end,
			last_event_id = EXCLUDED.last_event_id,
			last_event_created_at = EXCLUDED.last_event_created_at`,
		[id, `cus_e2e_${id}`, `sub_e2e_${id}`, `evt_e2e_up_${id}`],
	);
}

/**
 * The row a `subscription.revoked` webhook leaves: free again, and the
 * event's time is the downgrade the grace period counts from.
 */
export async function downgradeToFree(email: string, at: Date): Promise<void> {
	const id = await accountId(email);
	await one(
		`UPDATE subscription_projections SET plan_tier = 'free', provider_status = 'canceled',
			cancel_at_period_end = false, last_event_id = $2, last_event_created_at = $3
		WHERE user_id = $1 RETURNING user_id`,
		[id, `evt_e2e_down_${id}`, at],
	);
}

/** Move a finished render back in time, as if it had completed `days` ago. */
export async function ageRender(jobId: string, days: number): Promise<void> {
	await one(
		`UPDATE render_usage SET accepted_at = accepted_at - make_interval(days => $2)
		WHERE job_id = $1 RETURNING job_id`,
		[jobId, days],
	);
	await one(
		`UPDATE render_jobs SET
			created_at = created_at - make_interval(days => $2),
			started_at = started_at - make_interval(days => $2),
			completed_at = completed_at - make_interval(days => $2)
		WHERE id = $1 RETURNING id`,
		[jobId, days],
	);
}

/** How many cloud projects the account owns. */
export async function cloudProjectCount(email: string): Promise<number> {
	const id = await accountId(email);
	const row = await one<{ count: string }>(
		"SELECT count(*)::text AS count FROM projects WHERE owner_id = $1",
		[id],
	);
	return Number(row.count);
}

/** The account's newest cloud project: what a script names when it asks for a render. */
export async function newestCloudProject(email: string): Promise<{ id: string; revision: number }> {
	const id = await accountId(email);
	return one<{ id: string; revision: number }>(
		"SELECT id, revision FROM projects WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 1",
		[id],
	);
}

/** The API keys the account holds, as the database keeps them: a prefix and a hash, never a secret. */
export async function apiKeysOf(
	email: string,
): Promise<{ prefix: string; name: string; secretHash: string; lastUsedAt: Date | null }[]> {
	const id = await accountId(email);
	const result = await database().query(
		`SELECT prefix, name, secret_hash AS "secretHash", last_used_at AS "lastUsedAt"
		FROM api_keys WHERE owner_id = $1 ORDER BY created_at DESC`,
		[id],
	);
	return result.rows;
}

/** The account's render jobs, newest first. */
export async function renderJobsOf(
	email: string,
): Promise<{ id: string; status: string; isPublic: boolean }[]> {
	const id = await accountId(email);
	const result = await database().query(
		`SELECT id, status, is_public AS "isPublic" FROM render_jobs
		WHERE owner_id = $1 ORDER BY created_at DESC`,
		[id],
	);
	return result.rows;
}

/**
 * The account's cloud projects, newest first: what a script that rendered by URL
 * can see of the project it left behind.
 */
export async function cloudProjectsOf(
	email: string,
): Promise<{ id: string; title: string; revision: number; scenes: number }[]> {
	const id = await accountId(email);
	const result = await database().query(
		`SELECT id, title, revision, jsonb_array_length(document -> 'project' -> 'scenes') AS scenes
		FROM projects WHERE owner_id = $1 ORDER BY created_at DESC`,
		[id],
	);
	return result.rows.map((row) => ({ ...row, scenes: Number(row.scenes) }));
}

/** What a render counts against the month's minutes, as if it had played that long. */
export async function setRenderDuration(jobId: string, durationMs: number): Promise<void> {
	await one("UPDATE render_jobs SET duration_ms = $2 WHERE id = $1 RETURNING id", [
		jobId,
		durationMs,
	]);
	// The month's minutes are read from the usage ledger, which a job's own row does not feed.
	await one("UPDATE render_usage SET duration_ms = $2 WHERE job_id = $1 RETURNING job_id", [
		jobId,
		durationMs,
	]);
}

/**
 * Better Auth allows three sign-ups or sign-ins per ten seconds per client, and
 * behind the preview proxy every journey is the same client (the API logs that
 * it cannot see an address). One retry remains, after the 429's named window:
 * the suite's pace alone trips the limiter, a visitor never would. The product
 * now handles the 429 itself (the island keeps the form and says when to try
 * again, which rate-limit.spec.ts proves), so a second refusal is a real failure
 * and no longer something this helper papers over.
 */
const AUTH_ATTEMPTS = 2;

function retryAfterMs(headers: Record<string, string>): number {
	return (Number(headers["x-retry-after"]) || 10) * 1000 + 250;
}

async function authPost(
	client: APIRequestContext,
	path: string,
	data: Record<string, string>,
): Promise<void> {
	for (let attempt = 1; ; attempt++) {
		const response = await client.post(path, { data });
		if (response.status() === 429 && attempt < AUTH_ATTEMPTS) {
			await new Promise((resolve) => setTimeout(resolve, retryAfterMs(response.headers())));
			continue;
		}
		expect(response.status(), await response.text()).toBe(200);
		return;
	}
}

/** Sign up through the Studio's account island, the way a visitor does. */
export async function signUpInIsland(page: Page, account: TestAccount): Promise<void> {
	// The trigger is disabled while the session check runs, then reads "Sign in".
	await page.getByRole("button", { name: "Sign in", exact: true }).click();
	const panel = page.getByRole("dialog", { name: "Typelapse account" });
	await panel.getByRole("button", { name: "New here? Create an account" }).click();
	await panel.getByLabel("Name").fill(account.name);
	await panel.getByLabel("Email").fill(account.email);
	await panel.getByLabel("Password").fill(account.password);
	for (let attempt = 1; ; attempt++) {
		const answer = page.waitForResponse(
			(response) => new URL(response.url()).pathname === "/api/auth/sign-up/email",
		);
		await panel.getByRole("button", { name: "Create account" }).click();
		const response = await answer;
		if (response.status() !== 429 || attempt === AUTH_ATTEMPTS) break;
		// A refused sign-up keeps the island's form and says so (rate-limit.spec.ts holds
		// the sentence), so this does what a visitor does: waits out the window the 429
		// names and presses the same button again.
		await expect(panel.getByRole("alert")).toBeVisible();
		await expect(panel.getByLabel("Email")).toHaveValue(account.email);
		await page.waitForTimeout(retryAfterMs(response.headers()));
	}
	// Signed in, the panel closes on its own and the trigger names the account.
	await expect(page.getByRole("button", { name: `Account for ${account.name}` })).toBeVisible();
}

/** Open the account island (signed in) and return its panel. */
export async function openAccountPanel(page: Page, account: TestAccount) {
	await page.getByRole("button", { name: `Account for ${account.name}` }).click();
	const panel = page.getByRole("dialog", { name: "Typelapse account" });
	await expect(panel.getByRole("heading", { name: account.name })).toBeVisible();
	return panel;
}

async function apiClient(): Promise<APIRequestContext> {
	return request.newContext({
		baseURL: HOSTED.appUrl,
		// Better Auth refuses a cookie-bearing request from an untrusted origin.
		extraHTTPHeaders: { origin: HOSTED.appUrl },
		ignoreHTTPSErrors: true,
	});
}

/**
 * A signed-in API client for an account created without a browser: the
 * tenancy journey only needs a second session, not a second visit.
 */
export async function signUpByApi(account: TestAccount): Promise<APIRequestContext> {
	const client = await apiClient();
	await authPost(client, "/api/auth/sign-up/email", {
		name: account.name,
		email: account.email,
		password: account.password,
	});
	return client;
}

/**
 * A key made the way the island makes one: by the signed-in account, shown once.
 * A script then holds only the key, with no cookie.
 */
export async function createApiKeyByApi(client: APIRequestContext, name: string): Promise<string> {
	const response = await client.post("/api/keys", { data: { name } });
	expect(response.status(), await response.text()).toBe(201);
	return ((await response.json()) as { key: string }).key;
}

/** A signed-in API client for an account that already exists. */
export async function signInByApi(account: TestAccount): Promise<APIRequestContext> {
	const client = await apiClient();
	await authPost(client, "/api/auth/sign-in/email", {
		email: account.email,
		password: account.password,
	});
	return client;
}

/** A visitor with no session at all. */
export function signedOut(): Promise<APIRequestContext> {
	return request.newContext({ baseURL: HOSTED.appUrl, ignoreHTTPSErrors: true });
}
