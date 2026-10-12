import type { BillingEnvironment } from "@/domain/ports/billing.port";
import "./test-mode-line.css";

/** The words of the line, one place for every surface that shows it. */
export const TEST_MODE_TEXT = "Test mode: no real charges";

/**
 * A slim, fixed line that says the payment provider behind this build is its
 * sandbox. It is drawn only for a sandbox: the environment is the server's own
 * (`/api/billing/catalog`), so a production build, an older server and a missing
 * value all render nothing. It has no close control on purpose: test money must
 * not look like real money for as long as the build points at the sandbox.
 *
 * Any surface that sits beside a price or a checkout takes it with the catalog's
 * environment, the account panel's plan card today and the sheet that follows a
 * checkout next.
 */
export function TestModeLine({
	environment,
}: { readonly environment: BillingEnvironment | undefined }) {
	if (environment !== "sandbox") {
		return null;
	}
	return (
		<p className="test-mode-line" data-test-mode="">
			<span className="test-mode-line-mark" aria-hidden="true" />
			{TEST_MODE_TEXT}
		</p>
	);
}
