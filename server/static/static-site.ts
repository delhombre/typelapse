import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import type { MiddlewareHandler } from "hono";
import { getMimeType } from "hono/utils/mime";

interface StaticSiteEnvironment {
	readonly TYPELAPSE_STATIC_ROOT?: string;
}

/** The address prefixes the API owns; the app never answers under them. */
const API_PREFIXES = ["/api", "/v", "/health"] as const;

const HTML_CACHE = "no-cache";
/** Vite names everything under /assets after its content hash, so it never changes. */
const HASHED_CACHE = "public, max-age=31536000, immutable";
/** Public files keep their names across builds (icons, fonts), so they must be revalidated soon. */
const PUBLIC_CACHE = "public, max-age=3600";

/**
 * The directory of the Vite build the API should serve, or null to serve none.
 *
 * Off unless `TYPELAPSE_STATIC_ROOT` is set, so `pnpm dev:server` is unchanged.
 * A configured path that holds no `index.html` stops startup: a deploy that
 * lost its build must not come up answering 404 on the app's own address.
 */
export function staticRootFrom(
	environment: StaticSiteEnvironment = process.env,
): string | null {
	const configured = environment.TYPELAPSE_STATIC_ROOT?.trim();
	if (!configured) {
		return null;
	}
	const root = resolve(configured);
	if (!existsSync(resolve(root, "index.html"))) {
		throw new Error(`TYPELAPSE_STATIC_ROOT (${root}) must be a directory holding index.html`);
	}
	return root;
}

function isApiPath(path: string): boolean {
	return API_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** The file a request path names under `root`, or null if it escapes it or is hidden. */
function fileUnder(root: string, path: string): string | null {
	let decoded: string;
	try {
		decoded = decodeURIComponent(path);
	} catch {
		return null;
	}
	if (decoded.includes("\0") || decoded.includes("\\")) {
		return null;
	}
	const segments = decoded.split("/");
	if (segments.some((segment) => segment === ".." || segment.startsWith("."))) {
		return null;
	}
	const file = resolve(root, `.${decoded}`);
	return file.startsWith(root + sep) ? file : null;
}

function isFile(path: string): boolean {
	try {
		return statSync(path).isFile();
	} catch {
		return false;
	}
}

/**
 * Serves the built app from one origin with the API.
 *
 * Mounted after every API route, so it only ever sees what the API did not
 * answer. The client has a single HTML entry and two routes, "/" and "/app",
 * both resolved to index.html. Any other path is a real 404; a browser asking
 * for a page gets the app's shell with that status, so the client's own
 * not-found screen renders instead of a bare line.
 */
export function createStaticSite(root: string): MiddlewareHandler {
	const index = resolve(root, "index.html");

	return async (c, next) => {
		const path = c.req.path;
		if ((c.req.method !== "GET" && c.req.method !== "HEAD") || isApiPath(path)) {
			return next();
		}

		const html = async (status: 200 | 404) => {
			c.header("Cache-Control", HTML_CACHE);
			return c.html((await readFile(index)).toString("utf8"), status);
		};

		if (path === "/" || path === "/app" || path === "/app/") {
			return html(200);
		}

		const file = fileUnder(root, path);
		if (file && isFile(file)) {
			const headers = {
				"Content-Type": getMimeType(file) ?? "application/octet-stream",
				"Cache-Control": path.startsWith("/assets/") ? HASHED_CACHE : PUBLIC_CACHE,
			};
			return c.body(await readFile(file), 200, headers);
		}

		const wantsPage = c.req.header("accept")?.includes("text/html") ?? false;
		const namesFile = /\.[A-Za-z0-9]+$/.test(path);
		if (wantsPage && !namesFile && !path.endsWith("/")) {
			return html(404);
		}
		return next();
	};
}
