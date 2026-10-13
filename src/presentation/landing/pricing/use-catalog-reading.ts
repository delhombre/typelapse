import { type CatalogReading, loadCatalogReading } from "@/application/billing/pricing-view";
import { HttpBillingAdapter } from "@/infrastructure/billing/http-billing.adapter";
import { useEffect, useState } from "react";

/**
 * The public catalog, read once when the page opens. The page is public: it asks
 * no account for anything, so a visitor who never signed in sees what a buyer
 * would. Any failure reads as "no price" (see `loadCatalogReading`).
 */
export function useCatalogReading(): CatalogReading {
	const [reading, setReading] = useState<CatalogReading>({ kind: "pending" });
	useEffect(() => {
		let current = true;
		void loadCatalogReading(new HttpBillingAdapter()).then((next) => {
			if (current) {
				setReading(next);
			}
		});
		return () => {
			current = false;
		};
	}, []);
	return reading;
}
