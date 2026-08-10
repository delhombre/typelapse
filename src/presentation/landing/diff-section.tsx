import { Theme } from "@/domain/entities/theme";
import { LoopingFrames } from "@/presentation/components/preview/looping-frames";
import { FeatureSection } from "./feature-section";

/* The transformation, performed.
   This section used to render a frozen hunk by hand: coloured rows, a plus and a
   minus, and nothing ever happening. But the feature *is* the change from one to
   the other, and the page has the engine that performs it. So the hunk is now
   the first frame and the file it produces is the second, morphed by the same
   engine as everything else: the markers drop away and the surviving lines glide
   into their new places, which is exactly what the product does to a pull
   request. Tokenized as `diff`, so the additions and deletions keep the colours
   a reviewer recognises. */
const HUNK = `@@ app/route.ts
 async function GET() {
-  return db.all()
+  const rows = db.all()
+  return json(rows)
 }`;

const RESULT = `@@ app/route.ts
 async function GET() {
   const rows = db.all()
   return json(rows)
 }`;

/* Long enough to read the diff before it resolves, and to sit on the result
   before it returns. */
const HOLDS = [2600, 2600, 1100];

/** Feature b: import a diff or a whole PR, windowed into steps. */
export function DiffSection() {
	return (
		<FeatureSection
			eyebrow="Diff to video"
			title="Paste a pull request. Get a video."
			line="Drop in a unified diff or a GitHub pull request URL. Typelapse reads the changed lines, windows them into steps, and animates the change the way a reviewer would read it."
			align="right"
			visual={<DiffMorph />}
		/>
	);
}

function DiffMorph() {
	return (
		<div className="lp-morph-frame">
			<LoopingFrames
				frames={[HUNK, RESULT]}
				holds={HOLDS}
				theme={Theme.midnight()}
				language="diff"
				fontSize={14}
				ariaLabel="A pull request diff resolving into the file it produces, line by line"
			/>
		</div>
	);
}
