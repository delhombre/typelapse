/**
 * Production stand-in for `@aiforui/lapse/install`.
 *
 * The real module patches requestAnimationFrame, performance.now, Date.now and
 * the timer functions so Lapse can slow time down. That has to happen before
 * Motion caches its clock references, which forces a static import at the top of
 * the entry point, and a static import cannot be wrapped in a DEV check.
 *
 * So the swap happens at build time instead: vite.config.ts aliases the install
 * entry to this file in production. Visitors get no timing patches at all.
 */
export {};
