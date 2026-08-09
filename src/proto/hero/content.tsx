/**
 * Worst content, on purpose. A short headline and a tidy snippet make every
 * variant look fine and hide the decision, so this is the longest realistic
 * headline, a two-line lead, and a snippet with a line that overflows.
 */

export const HEADLINE = "Turn a pull request into a video people actually watch";

export const LEAD =
	"Paste a snippet, a unified diff, or a whole GitHub pull request. Typelapse morphs it token by token, chapter by chapter, and exports a video that matches the preview frame for frame.";

export const MICRO = "MIT licensed. Runs on your machine. No account needed.";

interface Line {
	readonly n: number;
	readonly parts: readonly { readonly t: string; readonly c?: string }[];
}

/** Deliberately includes one line far wider than the frame. */
export const SNIPPET: readonly Line[] = [
	{
		n: 1,
		parts: [
			{ t: "export function ", c: "tok-key" },
			{ t: "authorizeHostedRender", c: "tok-fn" },
			{ t: "({ credential, auth, subscriptions, now }: HostedRenderRequest) {" },
		],
	},
	{
		n: 2,
		parts: [
			{ t: "  // a credential that proves nothing is expected, not a failure", c: "tok-com" },
		],
	},
	{
		n: 3,
		parts: [
			{ t: "  if ", c: "tok-key" },
			{ t: "(credential === " },
			{ t: "null", c: "tok-key" },
			{ t: ") return { outcome: " },
			{ t: '"unauthenticated"', c: "tok-str" },
			{ t: " };" },
		],
	},
	{ n: 4, parts: [{ t: "" }] },
	{
		n: 5,
		parts: [
			{ t: "-  const plan = c.req.header(", c: "tok-del" },
			{ t: '"x-typelapse-plan"', c: "tok-del" },
			{ t: ");", c: "tok-del" },
		],
	},
	{
		n: 6,
		parts: [{ t: "+  const session = await auth.verify(credential);", c: "tok-add" }],
	},
	{
		n: 7,
		parts: [{ t: "+  const plan = await subscriptions.planFor(session.accountId);", c: "tok-add" }],
	},
	{ n: 8, parts: [{ t: "}" }] },
];

export function CodeFrame({ label }: { label: string }) {
	return (
		<div className="proto-frame">
			<div className="proto-frame-bar">
				<span className="proto-dot" />
				<span className="proto-dot" />
				<span className="proto-dot" />
				<span className="proto-mono proto-micro" style={{ marginInlineStart: 8 }}>
					{label}
				</span>
			</div>
			<div className="proto-code">
				{SNIPPET.map((line) => (
					<div className="proto-line" key={line.n}>
						<span className="proto-gutter">{String(line.n).padStart(2, "0")}</span>
						<span>
							{line.parts.map((p, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: throwaway prototype
								<span key={i} className={p.c}>
									{p.t}
								</span>
							))}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}
