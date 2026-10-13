import { springs } from "@/presentation/motion";
import { motion, useReducedMotion } from "motion/react";
import {
	type KeyboardEvent,
	type ReactNode,
	useId,
	useLayoutEffect,
	useRef,
	useState,
} from "react";

export interface AccountTab<Id extends string> {
	readonly id: Id;
	readonly label: string;
	readonly content: ReactNode;
}

/** Where a panel was left: how far it was scrolled, and what in it had focus. */
interface PanelMemory {
	scroll: number;
	focus: HTMLElement | null;
}

function recall<Id>(memory: Map<Id, PanelMemory>, id: Id): PanelMemory {
	let entry = memory.get(id);
	if (!entry) {
		entry = { scroll: 0, focus: null };
		memory.set(id, entry);
	}
	return entry;
}

/** The control a panel was left with focus on, if it is still in that panel. */
function focusLeft<Id>(
	memory: Map<Id, PanelMemory>,
	panels: Map<Id, HTMLElement>,
	id: Id,
): HTMLElement | null {
	const { focus } = recall(memory, id);
	return focus?.isConnected && panels.get(id)?.contains(focus) ? focus : null;
}

/** A field a finger would get a keyboard for: focus is not handed back to it on a phone. */
function raisesKeyboard(element: HTMLElement): boolean {
	const coarse = window.matchMedia?.("(pointer: coarse)").matches === true;
	return coarse && (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement);
}

/**
 * The account sheet's sections as tabs (WAI-ARIA tabs, automatic activation): the
 * arrows, Home and End walk the tabs and choose as they go, one tab is in the tab
 * order. A panel's section is drawn the first time its tab is chosen (so the keys
 * are asked for only once someone looks at them) and stays, hidden, after: a half-typed key
 * name or a question about a project survives a look at another tab. Each panel is
 * its own scroller and is given back its scroll, and the control that had focus in
 * it when a tab is pressed again (or when Tab leaves the tab for its panel).
 */
export function AccountTabs<Id extends string>({
	tabs,
	active,
	onActive,
	label,
}: {
	readonly tabs: readonly AccountTab<Id>[];
	readonly active: Id;
	readonly onActive: (id: Id) => void;
	readonly label: string;
}) {
	const base = useId();
	const reduceMotion = useReducedMotion() === true;
	const tabRefs = useRef(new Map<Id, HTMLButtonElement>());
	const panelRefs = useRef(new Map<Id, HTMLDivElement>());
	const memory = useRef(new Map<Id, PanelMemory>());
	const [visited, setVisited] = useState<ReadonlySet<Id>>(() => new Set([active]));
	if (!visited.has(active)) setVisited(new Set([...visited, active]));
	// A press brings focus back into the panel; the arrows leave it on the tab.
	const handBackFocus = useRef(false);

	const remembered = (id: Id) => recall(memory.current, id);
	const focusLeftIn = (id: Id) => focusLeft(memory.current, panelRefs.current, id);

	// On a change of tab only: the panel gets its scroll back, and, after a press, its focus.
	useLayoutEffect(() => {
		const panel = panelRefs.current.get(active);
		if (!panel) return;
		panel.scrollTop = recall(memory.current, active).scroll;
		const focus = handBackFocus.current
			? focusLeft(memory.current, panelRefs.current, active)
			: null;
		handBackFocus.current = false;
		if (focus && !raisesKeyboard(focus)) focus.focus({ preventScroll: true });
	}, [active]);

	const choose = (id: Id, by: "press" | "arrow") => {
		if (id === active) return;
		handBackFocus.current = by === "press";
		onActive(id);
	};

	const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
		if (event.key === "Tab" && !event.shiftKey) {
			const focus = focusLeftIn(active);
			if (focus) {
				event.preventDefault();
				focus.focus({ preventScroll: true });
			}
			return;
		}
		const last = tabs.length - 1;
		const target = (() => {
			switch (event.key) {
				case "ArrowRight":
					return index === last ? 0 : index + 1;
				case "ArrowLeft":
					return index === 0 ? last : index - 1;
				case "Home":
					return 0;
				case "End":
					return last;
				default:
					return null;
			}
		})();
		const next = target === null ? undefined : tabs[target];
		if (!next) return;
		event.preventDefault();
		choose(next.id, "arrow");
		tabRefs.current.get(next.id)?.focus();
	};

	const tabId = (id: Id) => `${base}-tab-${id}`;
	const panelId = (id: Id) => `${base}-panel-${id}`;

	return (
		<>
			<div role="tablist" aria-label={label} className="account-tabs">
				{tabs.map((item, index) => {
					const selected = item.id === active;
					return (
						<button
							key={item.id}
							ref={(element) => {
								if (element) tabRefs.current.set(item.id, element);
								else tabRefs.current.delete(item.id);
							}}
							type="button"
							role="tab"
							id={tabId(item.id)}
							aria-selected={selected}
							aria-controls={panelId(item.id)}
							tabIndex={selected ? 0 : -1}
							className="account-tab"
							onClick={() => choose(item.id, "press")}
							onKeyDown={(event) => onKeyDown(event, index)}
						>
							{item.label}
							{/* The mark under the chosen tab is a line, not a fill (DECISIONS D2), and
							    it glides on a transform between tabs (D8); reduced motion moves it at once. */}
							{selected ? (
								<motion.span
									layoutId={`${base}-mark`}
									className="account-tab-mark"
									aria-hidden="true"
									transition={reduceMotion ? { duration: 0 } : springs.snappy}
								/>
							) : null}
						</button>
					);
				})}
			</div>
			{/* Every panel is in the page, so each tab's aria-controls names one; a panel holds
			    its section only from the first time its tab is chosen. */}
			{tabs.map((item) => (
				<div
					key={item.id}
					ref={(element) => {
						if (element) panelRefs.current.set(item.id, element);
						else panelRefs.current.delete(item.id);
					}}
					role="tabpanel"
					id={panelId(item.id)}
					aria-labelledby={tabId(item.id)}
					hidden={item.id !== active}
					tabIndex={-1}
					className="account-panel"
					onScroll={(event) => {
						if (item.id === active) remembered(item.id).scroll = event.currentTarget.scrollTop;
					}}
					onFocus={(event) => {
						if (event.target !== event.currentTarget) {
							remembered(item.id).focus = event.target as HTMLElement;
						}
					}}
				>
					{visited.has(item.id) ? item.content : null}
				</div>
			))}
		</>
	);
}
