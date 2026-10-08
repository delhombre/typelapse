import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../server/index";
import { staticRootFrom } from "../../server/static/static-site";

/**
 * One origin: the API serves the Vite build when TYPELAPSE_STATIC_ROOT is set.
 * The client has one HTML entry (index.html) and two routes, "/" and "/app".
 * Anything the API owns (/api, /v, /health) is never answered by the app.
 */

const INDEX = "<!doctype html><title>Typelapse</title>";
let sandbox: string;
let root: string;

beforeAll(() => {
	sandbox = mkdtempSync(join(tmpdir(), "typelapse-static-"));
	root = join(sandbox, "dist");
	mkdirSync(join(root, "assets"), { recursive: true });
	mkdirSync(join(root, "fonts"), { recursive: true });
	writeFileSync(join(root, "index.html"), INDEX);
	writeFileSync(join(root, "assets", "index-4f2a9c.js"), "export {};");
	writeFileSync(join(root, "assets", "index-4f2a9c.css"), "body{}");
	writeFileSync(join(root, "favicon.svg"), "<svg/>");
	writeFileSync(join(root, "fonts", "Mono.woff2"), "font");
	writeFileSync(join(root, ".secret"), "dotfile");
	writeFileSync(join(root, "api-docs.txt"), "docs");
	writeFileSync(join(root, "version.txt"), "v1");
	mkdirSync(join(root, ".well-known"), { recursive: true });
	writeFileSync(join(root, ".well-known", "security.txt"), "Contact: mailto:security@example.com");
	writeFileSync(join(root, ".well-known", ".hidden"), "hidden under well-known");
	writeFileSync(join(sandbox, "outside.txt"), "outside the root");
	mkdirSync(join(sandbox, "outside-dir"));
	writeFileSync(join(sandbox, "outside-dir", "leak.txt"), "outside the root");
	symlinkSync(join(sandbox, "outside.txt"), join(root, "leak.txt"));
	symlinkSync(join(sandbox, "outside-dir"), join(root, "linked-dir"));
	symlinkSync(join(root, "version.txt"), join(root, "alias.txt"));
});

afterAll(() => {
	rmSync(sandbox, { recursive: true, force: true });
});

async function appWith(staticRoot: string | null) {
	return createApp({
		deploymentMode: "local",
		database: null,
		auth: null,
		objectStorage: null,
		synchronousRenderRoute: new Hono(),
		localMultimediaRenderRoute: new Hono(),
		staticRoot,
	});
}

async function get(path: string, init?: RequestInit) {
	return (await appWith(root)).request(`http://localhost${path}`, init);
}

describe("static site: the client's two routes", () => {
	it("serves index.html on / and on /app, with no cache", async () => {
		for (const path of ["/", "/app", "/app/"]) {
			const response = await get(path);

			expect(response.status, path).toBe(200);
			expect(await response.text()).toBe(INDEX);
			expect(response.headers.get("content-type")).toContain("text/html");
			expect(response.headers.get("cache-control")).toBe("no-cache");
		}
	});

	it("revalidates index.html asked for by name, as every .html", async () => {
		const response = await get("/index.html");

		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("no-cache");
	});

	it("answers HEAD without a body", async () => {
		const response = await get("/app", { method: "HEAD" });

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("");
	});
});

describe("static site: assets", () => {
	it("serves a hashed asset with a year-long immutable cache and its media type", async () => {
		const script = await get("/assets/index-4f2a9c.js");
		const style = await get("/assets/index-4f2a9c.css");

		expect(script.status).toBe(200);
		expect(script.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
		expect(script.headers.get("content-type")).toContain("javascript");
		expect(style.headers.get("content-type")).toContain("text/css");
	});

	it("serves unhashed public files with a short cache, never immutable", async () => {
		const icon = await get("/favicon.svg");
		const font = await get("/fonts/Mono.woff2");

		expect(icon.status).toBe(200);
		expect(icon.headers.get("content-type")).toContain("image/svg+xml");
		expect(icon.headers.get("cache-control")).toBe("public, max-age=3600");
		expect(font.headers.get("cache-control")).toBe("public, max-age=3600");
	});

	it("lets the API's hardening headers through on static responses", async () => {
		const response = await get("/");

		expect(response.headers.get("x-content-type-options")).toBe("nosniff");
		expect(response.headers.get("x-frame-options")).toBe("DENY");
	});
});

describe("static site: unknown paths", () => {
	it("is a real 404 for an unknown path, carrying the app so its own not-found page shows", async () => {
		const response = await get("/nope", { headers: { accept: "text/html" } });

		expect(response.status).toBe(404);
		expect(await response.text()).toBe(INDEX);
		expect(response.headers.get("cache-control")).toBe("no-cache");
	});

	it("is a bare 404 for a missing file or a request that did not ask for a page", async () => {
		const missingAsset = await get("/assets/gone-123.js", { headers: { accept: "text/html" } });
		const fetched = await get("/nope", { headers: { accept: "application/json" } });

		expect(missingAsset.status).toBe(404);
		expect(await missingAsset.text()).not.toContain("<title>");
		expect(fetched.status).toBe(404);
		expect(await fetched.text()).not.toContain("<title>");
	});

	it("does not list a directory", async () => {
		expect((await get("/assets", { headers: { accept: "text/html" } })).status).toBe(404);
		expect((await get("/assets/")).status).toBe(404);
	});

	it("refuses to leave the root or read a dotfile", async () => {
		for (const path of [
			"/../outside.txt",
			"/%2e%2e/outside.txt",
			"/assets/..%2f..%2foutside.txt",
			"/assets/%2e%2e/%2e%2e/outside.txt",
			"/.secret",
			"/%00",
		]) {
			const response = await get(path);

			expect(response.status, path).toBe(404);
			const body = await response.text();
			expect(body, path).not.toContain("outside the root");
			expect(body, path).not.toContain("dotfile");
		}
	});

	it("does not follow a link out of the root, to a file or to a directory", async () => {
		for (const path of ["/leak.txt", "/linked-dir/leak.txt"]) {
			const response = await get(path);

			expect(response.status, path).toBe(404);
			expect(await response.text(), path).not.toContain("outside the root");
		}
	});

	it("follows a link that stays inside the root", async () => {
		const response = await get("/alias.txt");

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("v1");
	});

	it("serves /.well-known/ files and nothing hidden beneath them", async () => {
		const policy = await get("/.well-known/security.txt");

		expect(policy.status).toBe(200);
		expect(await policy.text()).toContain("Contact:");
		expect((await get("/.well-known/.hidden")).status).toBe(404);
		expect((await get("/.well-known/../.secret")).status).toBe(404);
		expect((await get("/x/.well-known/security.txt")).status).toBe(404);
	});

	it("serves only GET and HEAD", async () => {
		const response = await get("/app", { method: "POST" });

		expect(response.status).toBe(404);
	});
});

describe("static site: what the API owns stays the API's", () => {
	it("keeps /health and /api/health as the capability read", async () => {
		for (const path of ["/health", "/api/health"]) {
			const response = await get(path);

			expect(response.status, path).toBe(200);
			expect(response.headers.get("content-type")).toContain("application/json");
			expect((await response.json()).status).toBe("ok");
		}
	});

	it("never answers /api/* or /v/* with the app, even when the route does not exist", async () => {
		for (const path of ["/api/nope", "/api", "/v/abc", "/v", "/health/extra"]) {
			const response = await get(path, { headers: { accept: "text/html" } });

			expect(response.status, path).toBe(404);
			const body = await response.text();
			// /v answers the API's own themed 404, which has a title of its own: it must
			// only not be the app's shell. The rest answer no page at all.
			if (path.startsWith("/v")) {
				expect(body, path).not.toContain(INDEX);
			} else {
				expect(body, path).not.toContain("<title>");
			}
		}
	});

	it("does not shadow a file whose name only starts like a reserved prefix", async () => {
		expect((await get("/api-docs.txt")).status).toBe(200);
		expect((await get("/version.txt")).status).toBe(200);
	});
});

describe("static site: off by default", () => {
	it("serves nothing when no root is configured", async () => {
		const app = await appWith(null);

		expect((await app.request("http://localhost/")).status).toBe(404);
		expect((await app.request("http://localhost/app")).status).toBe(404);
		expect((await app.request("http://localhost/health")).status).toBe(200);
	});
});

describe("staticRootFrom", () => {
	it("is null when the variable is unset or blank", () => {
		expect(staticRootFrom({})).toBeNull();
		expect(staticRootFrom({ TYPELAPSE_STATIC_ROOT: "  " })).toBeNull();
	});

	it("resolves the configured directory to an absolute path", () => {
		expect(staticRootFrom({ TYPELAPSE_STATIC_ROOT: root })).toBe(root);
	});

	it("fails startup when the directory holds no index.html", () => {
		expect(() => staticRootFrom({ TYPELAPSE_STATIC_ROOT: join(sandbox, "missing") })).toThrow(
			/TYPELAPSE_STATIC_ROOT/,
		);
		expect(() => staticRootFrom({ TYPELAPSE_STATIC_ROOT: join(root, "assets") })).toThrow(
			/index\.html/,
		);
	});
});
