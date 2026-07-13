import { ShikiAdapter } from "./shiki.adapter";

/**
 * One Shiki instance for the whole app. The editor store and the landing-page
 * demo both import this, so they share a single highlighter (one WASM load, one
 * set of themes) instead of spinning up their own.
 */
export const shikiAdapter = new ShikiAdapter();
