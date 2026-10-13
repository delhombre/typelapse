import { existsSync, readFileSync, realpathSync } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
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

/**
 * The file a request path names under `root`, or null if it escapes it or is
 * hidden. Only `/.well-known/` may hold a dot-segment (security.txt and the
 * like); `..` and every other hidden name stay refused.
 */
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
	const segments = decoded.split("/").filter(Boolean);
	const hidden = segments.some(
		(segment, index) =>
			segment === ".." || (segment.startsWith(".") && !(index === 0 && segment === ".well-known")),
	);
	if (hidden) {
		return null;
	}
	const file = resolve(root, `.${decoded}`);
	return file.startsWith(root + sep) ? file : null;
}

/** The real path of a regular file, or null for anything else (a directory, nothing, a dangling link). */
async function regularFile(path: string): Promise<string | null> {
	try {
		const real = await realpath(path);
		return (await stat(real)).isFile() ? real : null;
	} catch {
		return null;
	}
}

/** Every page revalidates; Vite's hashed files never change; the rest keep their names across builds. */
function cacheControlFor(path: string, file: string): string {
	if (file.endsWith(".html")) {
		return HTML_CACHE;
	}
	return path.startsWith("/assets/") ? HASHED_CACHE : PUBLIC_CACHE;
}

/**
 * Serves the built app from one origin with the API.
 *
 * Mounted after every API route, so it only ever sees what the API did not
 * answer. The client has a single HTML entry and three routes, "/", "/app" and
 * the public "/pricing", all resolved to index.html. Any other path is a real 404;
 * a browser asking for a page gets the app's shell with that status, so the
 * client's own not-found screen renders instead of a bare line.
 */
export function createStaticSite(root: string): MiddlewareHandler {
	// A link inside the build must not lead out of it, so containment is checked
	// on real paths. The shell is read once: a build does not change under a running API.
	const realRoot = realpathSync(root);
	const shell = readFileSync(resolve(root, "index.html"), "utf8");

	return async (c, next) => {
		const path = c.req.path;
		if ((c.req.method !== "GET" && c.req.method !== "HEAD") || isApiPath(path)) {
			return next();
		}

		const html = (status: 200 | 404) => {
			c.header("Cache-Control", HTML_CACHE);
			return c.html(shell, status);
		};

		if (path === "/" || path === "/app" || path === "/app/" || path === "/pricing" || path === "/pricing/") {
			return html(200);
		}

		const candidate = fileUnder(root, path);
		const file = candidate ? await regularFile(candidate) : null;
		if (file?.startsWith(realRoot + sep)) {
			const headers = {
				"Content-Type": getMimeType(file) ?? "application/octet-stream",
				"Cache-Control": cacheControlFor(path, file),
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
