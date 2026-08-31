// @vitest-environment jsdom
import type { SelectedAudioAsset } from "@/application/project/audio-cue-authoring";
import { Asset } from "@/domain/entities/asset";
import type { AudioCuePatch } from "@/domain/entities/audio-cue";
import { AudioCue } from "@/domain/entities/audio-cue";
import { MultimediaAudioInspector } from "@/presentation/components/multimedia/multimedia-audio-inspector";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const asset = Asset.create({
	id: "audio-1",
	kind: "audio",
	fileName: "A quiet signal.wav",
	mimeType: "audio/wav",
	byteSize: 24_000,
	checksum: "audio-checksum",
	durationMs: 8_000,
}) as SelectedAudioAsset;

const cue = AudioCue.create({
	id: "cue-1",
	assetId: asset.id,
	startMs: 400,
	trim: { startMs: 500, endMs: 6_500 },
	gain: 0.75,
	fadeInMs: 250,
	fadeOutMs: 350,
});

afterEach(cleanup);

describe("MultimediaAudioInspector", () => {
	it("presents one audio cue as a concise, labelled editing surface", () => {
		render(
			<MultimediaAudioInspector
				cue={cue}
				asset={asset}
				timelineDurationMs={10_000}
				onPatch={vi.fn()}
				onDelete={vi.fn()}
				onClose={vi.fn()}
			/>,
		);

		expect(screen.getByRole("region", { name: "Audio properties" })).toBeTruthy();
		expect(screen.getByText("A quiet signal.wav")).toBeTruthy();
		expect(screen.getByText("6.0 s clip")).toBeTruthy();
		expect(screen.getByLabelText("Timeline start")).toMatchObject({
			min: "0",
			max: "10",
			value: "0.4",
		});
		expect(screen.getByLabelText("Source in")).toMatchObject({
			min: "0",
			max: "6.499",
			value: "0.5",
		});
		expect(screen.getByLabelText("Source out")).toMatchObject({
			min: "0.501",
			max: "8",
			value: "6.5",
		});
		expect(screen.getByRole("slider", { name: "Volume" })).toHaveProperty("value", "75");
		expect(screen.getByText("75%")).toBeTruthy();
	});

	it("emits renderer-compatible millisecond and normalized gain patches", () => {
		const onPatch = vi.fn<(patch: AudioCuePatch) => void>();
		render(
			<MultimediaAudioInspector
				cue={cue}
				asset={asset}
				timelineDurationMs={10_000}
				onPatch={onPatch}
				onDelete={vi.fn()}
				onClose={vi.fn()}
			/>,
		);

		fireEvent.change(screen.getByLabelText("Timeline start"), { target: { value: "1.25" } });
		fireEvent.change(screen.getByLabelText("Source in"), { target: { value: "1.1" } });
		fireEvent.change(screen.getByLabelText("Source out"), { target: { value: "6.2" } });
		fireEvent.change(screen.getByLabelText("Fade in"), { target: { value: "0.4" } });
		fireEvent.change(screen.getByLabelText("Fade out"), { target: { value: "0.5" } });
		fireEvent.change(screen.getByRole("slider", { name: "Volume" }), {
			target: { value: "55" },
		});

		expect(onPatch.mock.calls.map(([patch]) => patch)).toEqual([
			{ startMs: 1_250 },
			{ trimStartMs: 1_100 },
			{ trimEndMs: 6_200 },
			{ fadeInMs: 400 },
			{ fadeOutMs: 500 },
			{ gain: 0.55 },
		]);
	});

	it("exposes immediate close and delete actions without a toast dependency", () => {
		const onDelete = vi.fn();
		const onClose = vi.fn();
		const { rerender } = render(
			<MultimediaAudioInspector
				cue={cue}
				asset={asset}
				timelineDurationMs={10_000}
				onPatch={vi.fn()}
				onDelete={onDelete}
				onClose={onClose}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Delete audio cue" }));
		fireEvent.click(screen.getByRole("button", { name: "Close audio properties" }));
		expect(onDelete).toHaveBeenCalledOnce();
		expect(onClose).toHaveBeenCalledOnce();

		rerender(
			<MultimediaAudioInspector
				cue={cue}
				asset={asset}
				timelineDurationMs={10_000}
				canDelete={false}
				onPatch={vi.fn()}
				onDelete={onDelete}
				onClose={onClose}
			/>,
		);
		expect(screen.getByRole("button", { name: "Delete audio cue" })).toHaveProperty(
			"disabled",
			true,
		);
	});
});
