import {
	DEVICE_MAX_FPS,
	loadCatalogReading,
	pricingView,
} from "@/application/billing/pricing-view";
import { RESOLUTION_TIERS } from "@/domain/entities/render-config";
import type { BillingCatalog } from "@/domain/ports/billing.port";
import { HttpBillingAdapter } from "@/infrastructure/billing/http-billing.adapter";
import { FPS_OPTIONS } from "@/presentation/components/controls/cluster-panels";
import { describe, expect, it } from "vitest";

const PRICED: BillingCatalog = {
	environment: "production",
	creator: {
		monthly: { currency: "USD", unitAmount: 1200 },
		annual: { currency: "USD", unitAmount: 12000 },
	},
};

const view = (reading: Parameters<typeof pricingView>[0]["reading"]) => pricingView({ reading });

describe("the pricing page's Creator card", () => {
	it("puts the annual price first and states the saving the catalog proves", () => {
		const { creator } = view({ kind: "ready", catalog: PRICED });
		expect(creator.price).toEqual({
			state: "priced",
			lines: [
				{ cadence: "annual", label: "$120 / year", note: "Saves 16% against paying monthly" },
				{ cadence: "monthly", label: "$12 / month", note: null },
			],
		});
	});

	it("shows the one cadence the catalog has, with no saving to claim", () => {
		const { creator } = view({
			kind: "ready",
			catalog: { creator: { monthly: { currency: "EUR", unitAmount: 950 } } },
		});
		expect(creator.price).toEqual({
			state: "priced",
			lines: [{ cadence: "monthly", label: "€9.50 / month", note: null }],
		});
	});

	it("claims no saving when the annual price is not cheaper", () => {
		const { creator } = view({
			kind: "ready",
			catalog: {
				creator: {
					monthly: { currency: "USD", unitAmount: 1000 },
					annual: { currency: "USD", unitAmount: 12000 },
				},
			},
		});
		expect(creator.price).toMatchObject({ lines: [{ note: null }, { note: null }] });
	});

	it.each([
		["billing answered 503 or not at all", { kind: "unavailable" } as const],
		["the catalog holds no price", { kind: "ready", catalog: { creator: {} } } as const],
	])("shows no number when %s, and says what Creator adds", (_name, reading) => {
		const { creator } = view(reading);
		expect(creator.price.state).toBe("unpriced");
		expect(JSON.stringify(creator)).not.toMatch(/\d/);
		expect(creator.adds.length).toBeGreaterThan(0);
	});

	it("holds its place while the catalog is still being read", () => {
		expect(view({ kind: "pending" }).creator.price).toEqual({ state: "pending" });
	});
});

describe("the page's description", () => {
	it("makes the card's claim, from the same tier, and never the wider one", () => {
		const { description } = view({ kind: "pending" });
		expect(description).toContain(`MP4 and WebM up to ${RESOLUTION_TIERS.at(-1)}`);
		expect(description).not.toMatch(/every format/i);
		expect(description).not.toMatch(/[–—]/);
	});
});

describe("the test mode line", () => {
	it("is on only when the catalog says its environment is the sandbox", () => {
		const sandbox = { kind: "ready", catalog: { ...PRICED, environment: "sandbox" } } as const;
		expect(view(sandbox).testMode).toBe(true);
		expect(view({ kind: "ready", catalog: PRICED }).testMode).toBe(false);
		expect(view({ kind: "ready", catalog: { creator: PRICED.creator } }).testMode).toBe(false);
		expect(view({ kind: "unavailable" }).testMode).toBe(false);
		expect(view({ kind: "pending" }).testMode).toBe(false);
	});
});

describe("the Free card, on this device", () => {
	it("is pinned to the largest tier the export offers and its fastest rate", () => {
		const top = RESOLUTION_TIERS.at(-1);
		expect(top).toBe("4K");
		expect(DEVICE_MAX_FPS).toBe(Math.max(...FPS_OPTIONS.map((option) => option.value)));
		expect(DEVICE_MAX_FPS).toBe(60);
		expect(view({ kind: "unavailable" }).device.points).toEqual([
			"MP4 and WebM up to 4K at 60 fps, and GIF and PNG from the same frame",
			"No watermark",
			"Nothing uploaded, no account",
		]);
	});
});

describe("the comparison table", () => {
	const { table } = view({ kind: "unavailable" });
	const row = (label: string) => {
		const found = table.rows.find((candidate) => candidate.label === label);
		if (!found) throw new Error(`No row ${label}`);
		return found;
	};

	it("reads Creator's column from the Plan value object", () => {
		expect(row("Hosted render time")).toEqual({
			label: "Hosted render time",
			device: "Not needed",
			creator: "60 minutes a month",
		});
		expect(row("Projects kept in your account").creator).toBe("Up to 100");
		expect(row("Private media").creator).toBe("Up to 5 GB");
	});

	it("says what only a hosted render bakes in", () => {
		expect(row("Captions and audio in the video")).toMatchObject({
			device: "Not yet",
			creator: "Baked in",
		});
	});

	it("says what a free account already has, so Creator is not sold on it", () => {
		expect(table.freeAccount).toBe(
			"A free account keeps up to 3 cloud projects and 100 MB of private media. Hosted renders come with Creator.",
		);
	});
});

describe("the questions", () => {
	const { faq } = view({ kind: "unavailable" });
	const answer = (question: string) => {
		const found = faq.find((item) => item.question === question);
		if (!found) throw new Error(`No question ${question}`);
		return found.answer;
	};

	it("answers what happens to a video on cancelling, with the days the Plan grants", () => {
		expect(answer("What happens to my videos if I cancel?")).toContain(
			"stay downloadable for 30 days after your plan ends",
		);
	});

	it("says the device export is free and why", () => {
		const free = answer("Is the device export really free?");
		expect(free).toMatch(
			/^Yes\. It runs in your browser, on your machine, and nothing is uploaded\./,
		);
		expect(free).not.toMatch(/cost|charge/i);
	});

	it("has a refunds answer", () => {
		expect(faq.map((item) => item.question)).toContain("Refunds");
	});

	it("never writes an em-dash, whatever the catalog said", () => {
		for (const reading of [
			{ kind: "pending" },
			{ kind: "unavailable" },
			{ kind: "ready", catalog: PRICED },
		] as const) {
			expect(JSON.stringify(view(reading))).not.toMatch(/[–—]/);
		}
	});
});

describe("reading the catalog", () => {
	it("reads a priced catalog", async () => {
		const reading = await loadCatalogReading({ getCatalog: async () => PRICED });
		expect(reading).toEqual({ kind: "ready", catalog: PRICED });
	});

	it("reads a refused or failed catalog as unavailable, never as an error", async () => {
		const refusing = await loadCatalogReading({
			getCatalog: async () => {
				throw new Error("Hosted billing is not configured");
			},
		});
		expect(refusing).toEqual({ kind: "unavailable" });
	});

	it("reads the server's 503 as unavailable", async () => {
		const adapter = new HttpBillingAdapter(async () =>
			Response.json({ error: "Hosted billing is not configured" }, { status: 503 }),
		);
		expect(await loadCatalogReading(adapter)).toEqual({ kind: "unavailable" });
	});
});
