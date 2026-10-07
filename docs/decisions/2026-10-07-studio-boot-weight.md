# The studio pays for what a visit uses

Ticket #214, from the prep-for-prod pass ([after the gate](2026-10-07-after-the-gate.md) D8).
Measured on a production build: `/app` transferred 1.99 MB over 27 requests
(the landing 678 KB), Monaco's runtime (988 KB gzip), its icon font and the
TypeScript worker (1.5 MB gzip) came on every visit, and a phone on Slow 4G
saw a blank page until the entry bundle had run.

## D1 The code editor mounts when its slot is first shown, and stays

**Decision:** `EditorPresence` (`presentation/contexts/editor-presence.tsx`)
wraps the editor slot in the desktop card (`shown = !folded`) and the phone
sheet (`shown = not at its peek`). `StudioEditor` renders `CodeEditor` only
once the slot has been shown, and never unmounts it afterwards. A studio that
opens in Preview (the default) or with the sheet resting never requests Monaco.

**Why:** the card's fold is a transform and an opacity precisely so Monaco is
not rebuilt (`scene-code-card.tsx`); an unmount on every fold would lose the
cursor and the worker blob URLs again. Latching keeps the draft, the cursor
and the model exactly as today, and costs one boolean.

**Rejected:** unmounting on Preview (rebuilds Monaco each time); prefetching
Monaco at idle (the megabyte is what the ticket removes from a visit that
never edits).

## D2 The worker is chosen by language, in one pure function

**Decision:** `monacoWorkerKind(label)` in `monaco-language.ts` maps a Monaco
language label to a worker; `monaco-runtime.ts` constructs from it. TypeScript
and JavaScript get the TypeScript worker, JSON, CSS and HTML their own, every
other language the editor worker alone.

**Why:** the labels were already switched in `monaco-runtime.ts`, so a Python
snippet never loaded the TypeScript worker; the production build showed it
(the e2e asserts it: Python requests `editor.worker` and no `ts.worker`).
The ticket's "also requested" was the default TypeScript snippet on a
Monaco that was mounted for nobody. The rule is now testable without a browser.

## D3 The route names its own files, and the landing fetches them on intent

**Decision:** the build writes the studio route's hashed files into a JSON
element (`vite-plugin-studio-preload.ts`); an inline script in `index.html`
adds `modulepreload` (and a style preload) for them when the path is `/app`,
and the Ioskeley and JetBrains Mono fonts for `/` and `/app` only (Geist stays
a static preload: every route sets text in it). The landing prefetches the
same files when a pointer, a focus or a touch reaches a link into `/app`
(`use-studio-prefetch.ts`), not at idle.

**Why:** the studio is a lazy route; nothing asked for its chunk until the
entry bundle had run and React had rendered the Suspense boundary. A hint in
the document starts the fetch beside the bundle. Prefetch on intent costs a
visitor who only reads nothing, where an idle prefetch would add the studio to
every landing view.

**Rejected:** a `modulepreload` for every route in the HTML (the landing would
carry the studio); `import()` as the prefetch (a failed fetch would sit in the
module map and fail the real navigation).

## D4 The wait draws the studio's outline; the tab and the page say what they are

**Decision:** the `/app` Suspense fallback is `StudioSkeleton`: the header's
pills, the frame, the island and the timeline (the sheet's peek on a phone) at
the sizes the shell uses, in the studio ramp at 6%, appearing after 140 ms so a
fast load never flashes it. No spinner. The tab is "Studio · Typelapse", or
"{project} · Typelapse" once the project has a name (`studioDocumentTitle`,
`useDocumentTitle`; the 404 uses the same hook). `index.html` carries a
`<noscript>` with the heading, the description and a link to `/app`, and a
sentence inside `#root` that is revealed if the entry script errors or ten
seconds pass with nothing mounted (React replaces it on mount).

**Why:** a blank page reads as broken and, with JavaScript off or a failed
script, never recovers. The outline is measured off the real shell so the swap
does not move anything (CLS 0 before and after).
