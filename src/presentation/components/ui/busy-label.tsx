import type { ReactNode } from "react";

/**
 * A button's word, with a spinner laid over it while the button waits. The
 * word stays in the same grid cell, unseen, so the button keeps the width it
 * had: swapping the word for the spinner shrank Fetch and Apply under the
 * finger that had just pressed them.
 */
export function BusyLabel({ busy, children }: { busy: boolean; children: ReactNode }) {
	return (
		<span className="grid place-items-center">
			<span
				className={`col-start-1 row-start-1 ${busy ? "invisible" : ""}`}
				aria-hidden={busy || undefined}
			>
				{children}
			</span>
			{busy ? (
				<span className="col-start-1 row-start-1">
					<Spinner />
				</span>
			) : null}
		</span>
	);
}

function Spinner() {
	return (
		<svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" role="img">
			<title>Loading</title>
			<circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
			<path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
		</svg>
	);
}
