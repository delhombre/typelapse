import type { Page } from "@playwright/test";

export interface ControlReach {
	label: string;
	/** The layout box, as the element is drawn. */
	box: { x: number; y: number; width: number; height: number };
	/** Every point `elementFromPoint` hands to this control, as a rectangle. */
	reach: {
		left: number;
		right: number;
		top: number;
		bottom: number;
		width: number;
		height: number;
	};
	/** `elementFromPoint` at the middle of the reach's four edges, just inside it. */
	edgesHit: boolean;
	/** Points inside the reach rectangle that belong to another control: a reach into a neighbour. */
	foreign: number;
}

export interface CornerRowReach {
	controls: ControlReach[];
	/** Widths of the stretches along the row's middle that no control answers, between two controls. */
	deadZones: number[];
}

/**
 * The corner row as a thumb finds it: for every control in the row, what answers
 * to it around it, by asking the page (`elementFromPoint`, one point per pixel).
 * A hit area is a pseudo-element no layout box reports, and one a parent clips
 * answers to nobody, so a box read from the DOM would flatter the row.
 */
export async function measureCornerRow(page: Page): Promise<CornerRowReach> {
	return page.evaluate(() => {
		const row = document.querySelector(".sc-corner-row");
		if (!row) throw new Error("no corner row");
		const controls = [...row.querySelectorAll<HTMLElement>("button, a, input")].filter((el) => {
			const box = el.getBoundingClientRect();
			return box.width > 0 && box.height > 0;
		});
		const rowBox = row.getBoundingClientRect();
		const top = Math.floor(rowBox.top) - 12;
		const bottom = Math.ceil(rowBox.bottom) + 12;
		const width = window.innerWidth;
		const owner = (x: number, y: number) => {
			const hit = document.elementFromPoint(x, y);
			if (!hit) return -1;
			return controls.findIndex((control) => control === hit || control.contains(hit));
		};
		const grid: number[][] = [];
		for (let y = top; y < bottom; y += 1) {
			const line: number[] = [];
			for (let x = 0; x < width; x += 1) line.push(owner(x + 0.5, y + 0.5));
			grid.push(line);
		}
		const result: ControlReach[] = controls.map((control, index) => {
			let left = Number.POSITIVE_INFINITY;
			let right = Number.NEGATIVE_INFINITY;
			let up = Number.POSITIVE_INFINITY;
			let down = Number.NEGATIVE_INFINITY;
			grid.forEach((line, row) => {
				line.forEach((who, x) => {
					if (who !== index) return;
					left = Math.min(left, x);
					right = Math.max(right, x + 1);
					up = Math.min(up, top + row);
					down = Math.max(down, top + row + 1);
				});
			});
			let foreign = 0;
			for (let y = up; y < down; y += 1) {
				for (let x = left; x < right; x += 1) {
					const who = grid[y - top]?.[x] ?? -1;
					if (who !== -1 && who !== index) foreign += 1;
				}
			}
			const midX = (left + right) / 2;
			const midY = (up + down) / 2;
			const edgesHit = [
				[left + 0.5, midY],
				[right - 0.5, midY],
				[midX, up + 0.5],
				[midX, down - 0.5],
			].every(([x, y]) => owner(x as number, y as number) === index);
			const box = control.getBoundingClientRect();
			return {
				label: control.getAttribute("aria-label") ?? control.textContent?.trim() ?? control.tagName,
				box: { x: box.x, y: box.y, width: box.width, height: box.height },
				reach: {
					left,
					right,
					top: up,
					bottom: down,
					width: Math.max(0, right - left),
					height: Math.max(0, down - up),
				},
				edgesHit,
				foreign,
			};
		});
		// The row's middle: the stretches between the first control and the last that answer to none.
		const middle = grid[Math.round(rowBox.top + rowBox.height / 2) - top] ?? [];
		const first = middle.findIndex((who) => who !== -1);
		const last = middle.length - 1 - [...middle].reverse().findIndex((who) => who !== -1);
		const deadZones: number[] = [];
		let run = 0;
		for (let x = first; x <= last; x += 1) {
			if (middle[x] === -1) {
				run += 1;
			} else if (run > 0) {
				deadZones.push(run);
				run = 0;
			}
		}
		return { controls: result, deadZones };
	});
}
