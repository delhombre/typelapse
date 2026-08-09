import { useCallback, useState } from "react";
import { Picker } from "../hero-picker";
import "./proto.css";
import { Instrument, Marks, Specimen } from "./variants";

const VARIANTS = [
	{ name: "Instrument", render: () => <Instrument /> },
	{ name: "Marks", render: () => <Marks /> },
	{ name: "Specimen", render: () => <Specimen /> },
];

const initialIndex = () => {
	const raw = new URLSearchParams(window.location.search).get("v");
	const n = Number.parseInt(raw ?? "", 10);
	return n >= 1 && n <= VARIANTS.length ? n - 1 : 0;
};

export function IslandProto() {
	const [current, setCurrent] = useState(initialIndex);
	const [nonce, setNonce] = useState(0);

	const select = useCallback((i: number) => {
		setCurrent(i);
		setNonce((n) => n + 1);
		const url = new URL(window.location.href);
		url.searchParams.set("v", String(i + 1));
		window.history.replaceState(null, "", url);
	}, []);

	const variant = VARIANTS[current] ?? VARIANTS[0];

	return (
		<div className="iproto">
			<div className="iproto-stage" />
			<div key={`${current}-${nonce}`}>{variant?.render()}</div>
			<p className="iproto-caption">
				Three ways to make four controls read as one system. Flip with 1 / 2 / 3, open the backdrop
				or theme control in each.
			</p>
			<Picker
				names={VARIANTS.map((v) => v.name)}
				current={current}
				onSelect={select}
				onReplay={() => setNonce((n) => n + 1)}
				position="top"
			/>
		</div>
	);
}
