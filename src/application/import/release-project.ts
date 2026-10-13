/**
 * A GitHub release → a changelog video: its title on a blank scene (the title
 * card), then one chapter per commit, played exactly as a multi-commit pull
 * request plays. The network lives in `infrastructure/import/release-import`;
 * what the release becomes is decided here, once, for the CLI and the studio.
 *
 * The CLI builds the whole V2 document ({@link releaseProject}, then
 * {@link withReleaseCard}). The studio imports the chapters into its own
 * snippet, which keeps the look the user chose, and puts
 * {@link releaseCardLayers} on the blank first scene. The steps of both are
 * held to the same file by a test.
 */

import { type DiffChapter, chapterLanguage, chapterSequences } from "@/application/diff";
import type { ProjectPayload } from "@/application/project/project-payload";
import { TextBlock } from "@/domain/entities/block";
import { hydrateProjectDocument } from "../project/hydrate-project-document";
import { newTextLayer } from "../project/multimedia-authoring";
import type { ProjectDocumentV2 } from "../project/project-document";
import { serializeProjectDocument } from "../project/serialize-project-document";
import { projectFromSnapshots } from "./diff-project";

/** What the title card says: the release's title, and a short line under it. */
export interface ReleaseCard {
	title: string;
	subtitle?: string;
}

/** How long the title card holds: long enough to read a title and one line. */
export const RELEASE_CARD_MS = 2400;

/** An opening paragraph this long or longer is release notes, not a line on a card. */
const SUBTITLE_MAX_LENGTH = 140;

/** Markdown that opens a block (a heading, a list, a quote, a table, HTML), not a sentence. */
const BLOCK_START = /^(?:#|[-*+]\s|\d+[.)]\s|>|\||<|```)/;

/** The opening paragraph as plain text, or undefined when it is not a short sentence. */
function openingLine(body: string | null | undefined): string | undefined {
	const paragraph = (body ?? "")
		.replace(/\r\n?/g, "\n")
		.trim()
		.split(/\n\s*\n/)[0]
		?.trim();
	if (!paragraph || BLOCK_START.test(paragraph)) {
		return undefined;
	}
	const text = paragraph
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/(\*\*|__|`)/g, "")
		.replace(/\s*\n\s*/g, " ")
		.trim();
	// A link left in the line ("Full Changelog: https://…") reads as noise on a card.
	if (text === "" || /https?:\/\//.test(text) || text.length >= SUBTITLE_MAX_LENGTH) {
		return undefined;
	}
	return text;
}

/**
 * The card a release opens on: its title, or its tag when the release has none
 * (a bare tag has no release at all), and the body's opening paragraph when it
 * is one short sentence rather than a heading or a list.
 */
export function releaseCardText(release: {
	name?: string | null;
	tag: string;
	body?: string | null;
}): ReleaseCard {
	const title = release.name?.trim() || release.tag;
	const subtitle = openingLine(release.body);
	return subtitle ? { title, subtitle } : { title };
}

/**
 * The project a release renders as: a blank card step, then the chapters,
 * capped and captioned like the studio's chaptered pull request. Throws, in the
 * studio's words, when no commit carries a change to animate.
 */
export function releaseProject(card: ReleaseCard, chapters: DiffChapter[]): ProjectPayload {
	const sequences = chapterSequences(chapters);
	if (sequences.flat().length === 0) {
		throw new Error("These commits contain no changes to animate");
	}
	return projectFromSnapshots(sequences, {
		title: card.title,
		language: chapterLanguage(chapters),
		openingCardMs: RELEASE_CARD_MS,
	});
}

/** The card's text layers: the title, and under it the short line when there is one. */
export function releaseCardLayers(card: ReleaseCard, sceneId: string): TextBlock[] {
	if (!card.subtitle) {
		return [
			newTextLayer({
				id: `${sceneId}::release-title`,
				text: card.title,
				placement: { x: 0.1, y: 0.3, width: 0.8, height: 0.4 },
			}),
		];
	}
	const title = newTextLayer({
		id: `${sceneId}::release-title`,
		text: card.title,
		placement: { x: 0.1, y: 0.3, width: 0.8, height: 0.22 },
	});
	return [
		title,
		TextBlock.create({
			id: `${sceneId}::release-subtitle`,
			text: card.subtitle,
			opacity: 0.72,
			placement: { x: 0.12, y: 0.52, width: 0.76, height: 0.12 },
			typography: { ...title.typography, fontSize: 44, fontWeight: 450 },
		}),
	];
}

/** Put the card's layers on the document's first scene, the blank one {@link releaseProject} opens on. */
export function withReleaseCard(document: ProjectDocumentV2, card: ReleaseCard): ProjectDocumentV2 {
	const hydrated = hydrateProjectDocument(document);
	const first = hydrated.project.scenes[0];
	if (!first) {
		return document;
	}
	const project = releaseCardLayers(card, first.id).reduce(
		(next, layer) => next.addBlock(first.id, layer),
		hydrated.project,
	);
	return serializeProjectDocument({ ...hydrated, project });
}
