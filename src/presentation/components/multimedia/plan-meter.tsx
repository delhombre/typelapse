import type { QuotaMeter } from "@/application/billing/quota-meter";

/**
 * One bar and one count per quota of the plan, from the numbers the server
 * counted (`quotaMeters`). The rows are drawn for the eye and hidden from
 * assistive technology; the server's own sentence carries the same facts, once,
 * as text a screen reader reads in order. The warning is never colour alone:
 * the count turns bold, a mark sits beside it, and a reader is told which
 * quotas are close to their ceiling.
 */
export function PlanMeter({
	meters,
	sentence,
}: {
	readonly meters: readonly QuotaMeter[];
	/** The server's allowance sentence, kept as real text for a screen reader. */
	readonly sentence: string | null;
}) {
	const near = meters.filter((meter) => meter.kind === "bar" && meter.warn);
	// What the sentence does not carry and the drawn rows do: the facts and the reset date.
	const facts = meters.flatMap((meter) => {
		if (meter.kind === "fact") {
			return [`${meter.label}: ${meter.text}.`];
		}
		return meter.resets ? [`${meter.label} ${meter.resets}.`] : [];
	});
	return (
		<div className="mm-meter">
			<ul className="mm-meter-list" aria-hidden="true">
				{meters.map((meter) =>
					meter.kind === "bar" ? (
						<li key={meter.key} className="mm-meter-row" data-warn={meter.warn ? "" : undefined}>
							<div className="mm-meter-line">
								<span>{meter.label}</span>
								<span className="mm-meter-count">{meter.count}</span>
							</div>
							<div className="mm-meter-track">
								<div className="mm-meter-fill" style={{ transform: `scaleX(${meter.ratio})` }} />
							</div>
							{meter.resets ? <span className="mm-meter-resets">{meter.resets}</span> : null}
						</li>
					) : (
						<li key={meter.key} className="mm-meter-row" data-kind="fact">
							<div className="mm-meter-line">
								<span>{meter.label}</span>
								<span className="mm-meter-count">{meter.text}</span>
							</div>
						</li>
					),
				)}
			</ul>
			{sentence ? <p className="sr-only">{sentence}</p> : null}
			{facts.length > 0 ? <p className="sr-only">{facts.join(" ")}</p> : null}
			{near.length > 0 ? (
				<p className="sr-only">
					Close to the limit: {near.map((meter) => meter.label.toLowerCase()).join(", ")}.
				</p>
			) : null}
		</div>
	);
}
