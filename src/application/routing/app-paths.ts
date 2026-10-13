/**
 * The pages the client routes, in one place. The router reads it (`app-routes`)
 * and so does the static host (`server/static/static-site.ts`), which answers a
 * page with the app's shell and a 200 and every other path with a real 404: a
 * page added to the router and not here would ship answering 404.
 */
export const APP_PATHS = {
	landing: "/",
	studio: "/app",
	pricing: "/pricing",
} as const;
