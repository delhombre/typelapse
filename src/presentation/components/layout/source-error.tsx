import { importErrorCopy } from "@/application/import/import-error-copy";
import { AlertCircle } from "reicon-react";

/**
 * A refusal under the field it is about, in three signals: the error ink, an
 * icon, and words that say what to do. Colour alone is invisible to anyone who
 * cannot tell it from the muted grey beside it.
 */
export function SourceError({ id, message }: { id: string; message: string }) {
	return (
		<p id={id} role="alert" className="sc-source-error">
			<AlertCircle size={13} strokeWidth={2} aria-hidden="true" />
			<span>{importErrorCopy(message)}</span>
		</p>
	);
}
