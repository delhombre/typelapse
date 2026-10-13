import { createOpenRequestStore } from "./open-request.store";

/**
 * A request, from anywhere in the studio, to open the Showcase.
 *
 * The gallery keeps owning its own `open` state (its trigger, its focus return and
 * its confirm all hang on it); the ask crosses in the shape of the diff dialog's
 * hand-off (`diff-import.store.ts`), so the empty scene list does not have to
 * know how the gallery is built.
 */
export const useShowcaseRequestStore = createOpenRequestStore();
