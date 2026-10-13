import { createOpenRequestStore } from "./open-request.store";

/** A request, from anywhere in the studio, to open the capture library (see the Showcase's). */
export const useLibraryRequestStore = createOpenRequestStore();
