import { Nav } from "../nav";
import { Eyebrow, InkButton, Reveal } from "../primitives";
import { SiteFooter } from "../site-footer";
import { ThemeToggle } from "../theme-toggle";
import { CONTAINER, GITHUB_URL, HAIRLINE, SECTION_PY } from "../tokens";
import { useDocumentMeta } from "../use-document-meta";
import { useLandingTheme } from "../use-landing-theme";
import {
	COMPARISON_CHECKED_ON,
	COMPARISON_GROUPS,
	type Cell,
	PRODUCTS,
	type Row,
	type Source,
} from "./comparison";

/**
 * `/compare` — the spec sheet against Snappify and Snipcast.
 *
 * The page is deliberately not an ad. It sets no adjective where a number will
 * do, spends the primary colour only on the one CTA at the bottom, and prints a
 * source link under every single cell including the ones that say "Not
 * documented". The facts are the argument; the layout just has to stay out of
 * their way.
 *
 * Two renderings of the same data, one exposed at a time: a real `<table>` above
 * `md`, and stacked cards below it. Collapsing a table with CSS would leave a
 * screen reader announcing rows and columns that no longer exist, so the narrow
 * layout is its own markup — the same trade the frame fan makes on the landing.
 */

const COMPARE_META = {
	title: "Typelapse vs Snappify vs Snipcast: a sourced comparison",
	description:
		"A spec sheet comparing Typelapse, Snappify and Snipcast on export, motion, limits and price. Every cell links to its source, and anything a vendor does not document says so.",
} as const;

const ISSUE_URL = `${GITHUB_URL}/issues/new`;

/** 2026-08-12 → "12 August 2026", for the footnote. */
function formatCheckedOn(iso: string): string {
	const date = new Date(`${iso}T00:00:00Z`);
	return date.toLocaleDateString("en-GB", {
		day: "numeric",
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	});
}

export function ComparePage() {
	const [theme, toggleTheme] = useLandingTheme();
	useDocumentMeta(COMPARE_META);

	return (
		<div
			className="landing-root relative flex min-h-dvh flex-col bg-paper text-ink antialiased"
			data-theme={theme}
		>
			<Nav />
			<ThemeToggle theme={theme} onToggle={toggleTheme} />
			<main className="flex-1">
				<Header />
				<section className={`${CONTAINER} pb-4`}>
					<ComparisonTable />
					<ComparisonCards />
				</section>
				<Footnote />
				<Close />
			</main>
			<SiteFooter />
		</div>
	);
}

/* ──────────── Header ──────────── */

function Header() {
	return (
		<section className={`${CONTAINER} pt-28 pb-12 sm:pt-32 sm:pb-14`}>
			<Reveal immediate>
				<Eyebrow>Comparison</Eyebrow>
				<h1 className="lp-h2 mt-4 max-w-[16ch] text-ink">Three tools, side by side.</h1>
				<p className="lp-lead mt-5 max-w-[62ch]">
					We make one of these, so read this the way you would read any comparison written by a
					competitor: by checking it. Every cell links to its source — ours to the file or the
					commit in this repository that defines it, theirs to their own public pages. Where a
					vendor does not publish something, this page says{" "}
					<span className="text-ink">not documented</span> rather than guessing a no.
				</p>
			</Reveal>
		</section>
	);
}

/* ──────────── Cell rendering ──────────── */

/** The citation under a value: machine text, quiet, always present. */
function Cite({ source, prefix }: { source: Source; prefix?: string }) {
	return (
		<a
			href={source.href}
			target="_blank"
			rel="noreferrer"
			className="lp-prompt mt-2 inline-block text-[11px] underline decoration-ash/30 underline-offset-[3px] transition-colors ease-[var(--ease-out)] hover:text-ink hover:decoration-current"
		>
			{prefix ? `${prefix} ` : ""}
			{source.label}
		</a>
	);
}

function CellBody({ cell }: { cell: Cell }) {
	if (cell.kind === "undocumented") {
		return (
			<>
				{/* Block, not inline: the citation belongs on its own line even when
				    there is no note between it and the value. */}
				<span className="block text-[14px] text-ash">Not documented</span>
				{cell.note ? (
					<span className="mt-1.5 block text-[13px] text-ash leading-relaxed">{cell.note}</span>
				) : null}
				<Cite source={cell.checked} prefix="checked" />
			</>
		);
	}

	return (
		<>
			<span className="block text-[14px] text-ink leading-relaxed">{cell.value}</span>
			{cell.note ? (
				<span className="mt-1.5 block text-[13px] text-ash leading-relaxed">{cell.note}</span>
			) : null}
			<Cite source={cell.source} />
		</>
	);
}

function cellsOf(row: Row): Cell[] {
	return [row.typelapse, row.snappify, row.snipcast];
}

/* ──────────── Wide: the table ──────────── */

function ComparisonTable() {
	return (
		<table className="hidden w-full border-collapse text-left md:table">
			{/* The hiding goes on a span, not on the caption: `sr-only` sets
			    `position: absolute`, and a positioned `table-caption` box leaves a
			    stray sliver at the table's top-left corner in Chromium. */}
			<caption>
				<span className="sr-only">
					Typelapse, Snappify and Snipcast compared feature by feature. Every cell cites the page or
					file it was read from.
				</span>
			</caption>
			<thead>
				<tr className={`border-b ${HAIRLINE}`}>
					<th scope="col" className="lp-eyebrow w-[22%] py-4 pr-6 align-bottom">
						Feature
					</th>
					{PRODUCTS.map((product) => (
						<th key={product.id} scope="col" className="w-[26%] py-4 pr-6 align-bottom">
							<span className="block font-semibold text-[15px] text-ink tracking-tight">
								{product.name}
							</span>
							<span className="mt-1 block font-normal text-[12px] text-ash leading-snug">
								{product.summary}
							</span>
						</th>
					))}
				</tr>
			</thead>
			{COMPARISON_GROUPS.map((group) => (
				<tbody key={group.id}>
					<tr>
						<th scope="colgroup" colSpan={4} className="lp-eyebrow pt-12 pb-3 text-ash">
							{group.title}
						</th>
					</tr>
					{group.rows.map((row) => (
						<tr key={row.id} className={`border-t ${HAIRLINE}`}>
							<th
								scope="row"
								className="py-5 pr-6 align-top font-medium text-[14px] text-ink leading-relaxed"
							>
								{row.label}
							</th>
							{cellsOf(row).map((cell, index) => (
								<td key={PRODUCTS[index]?.id ?? index} className="py-5 pr-6 align-top">
									<CellBody cell={cell} />
								</td>
							))}
						</tr>
					))}
				</tbody>
			))}
		</table>
	);
}

/* ──────────── Narrow: one card per row ──────────── */

function ComparisonCards() {
	return (
		<div className="md:hidden">
			{COMPARISON_GROUPS.map((group) => (
				<section key={group.id} className="pt-10 first:pt-0">
					<h2 className="lp-eyebrow text-ash">{group.title}</h2>
					<div className="mt-4 flex flex-col gap-3">
						{group.rows.map((row) => (
							<article
								key={row.id}
								className={`rounded-2xl border ${HAIRLINE} bg-surface px-5 py-5`}
							>
								<h3 className="font-medium text-[14px] text-ink">{row.label}</h3>
								<dl className="mt-4 flex flex-col gap-4">
									{cellsOf(row).map((cell, index) => {
										const product = PRODUCTS[index];
										return (
											<div key={product?.id ?? index}>
												<dt className="lp-eyebrow text-[10px] text-ash">{product?.name}</dt>
												<dd className="mt-1.5">
													<CellBody cell={cell} />
												</dd>
											</div>
										);
									})}
								</dl>
							</article>
						))}
					</div>
				</section>
			))}
		</div>
	);
}

/* ──────────── Footnote ──────────── */

function Footnote() {
	return (
		<section className={`${CONTAINER} pt-12`}>
			{/* The rule spans the container like every other hairline on the site; the
			    prose inside it stops at a readable measure. */}
			<div className={`border-t ${HAIRLINE} pt-6`}>
				<p className="lp-micro max-w-[76ch] leading-relaxed">
					Checked on {formatCheckedOn(COMPARISON_CHECKED_ON)} against the pages linked in each cell.
					Products change and pages move: if a cell is out of date, or wrong, or unfair,{" "}
					<a
						href={ISSUE_URL}
						target="_blank"
						rel="noreferrer"
						className="text-ink underline decoration-ash/40 underline-offset-[3px] transition-colors ease-[var(--ease-out)] hover:decoration-current"
					>
						open an issue
					</a>{" "}
					and we will correct it. That invitation is open to Snappify and Snipcast too.
				</p>
			</div>
		</section>
	);
}

/* ──────────── Close ──────────── */

function Close() {
	return (
		<section className={`${CONTAINER} ${SECTION_PY} text-center`}>
			<Reveal>
				<h2 className="lp-h2 mx-auto max-w-[18ch] text-ink">Check our column yourself.</h2>
				<p className="lp-line mx-auto mt-4 max-w-[46ch]">
					Nothing to install, nothing to sign up for. The studio opens on a template.
				</p>
				<div className="mt-8 flex justify-center">
					<InkButton to="/app" size="lg">
						Open the studio
					</InkButton>
				</div>
			</Reveal>
		</section>
	);
}
