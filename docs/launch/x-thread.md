# X thread

Six posts, one fact each, each with the proof attached. Keep every post under
280 characters; the counts are in brackets. Links use `TYPELAPSE_APP_URL` and
the repository URL once both are public (`checklist.md`).

## 1. The sharpness numbers

> Code videos blur because a 4:2:0 encode keeps one colour sample in four.
> Typelapse exports WebM with AV1 4:4:4: on the same line of code it scores
> 43.63 dB, against 29.31 dB for an H.264 MP4. Script and crops are in the
> repo. [225]

Attach: `docs/sharpness/av1-444.png` and `docs/sharpness/h264-420.png`, side
by side. Proof: `docs/sharpness/sharpness.json`.

## 2. The export runs on your device

> The export runs in your browser tab with WebCodecs, in a worker. No account,
> no upload, no watermark, up to 4K, and it says which codec it used. [144]

Attach: a screen recording of the export panel set to Device, the status line
saying "on this device". Proof: Device never posts the project anywhere
(`tests/presentation/export-no-implicit-server-fallback.test.ts`).

## 3. Paste a pull request

> Paste a GitHub pull request link. Typelapse reads the diff and turns it into
> scenes in an editor: reorder them, retime them, add a title card, then
> export. Not a template, the actual change. [190]

Attach: the 20 second launch clip (`docs/launch/launch.project.json`), which
opens on a title card, then plays a real diff from this repository.

## 4. One command

> Same engine, no browser:
>
> pnpm typelapse render https://github.com/octocat/Hello-World/pull/1
>
> PR, commit, diff file or project file in; MP4, WebM or GIF out. It prints the
> file and a link that reopens it in the editor. [219]

Attach: a terminal screenshot of the command and its `--json` line.

## 5. Every pull request, rendered

> A free GitHub Action renders each pull request on the runner, uploads the
> video and comments a link that opens the change in the editor. No secret
> needed. [188]
>
> uses: delhombre/typelapse@v0.1.0

Attach: a screenshot of the comment on a pull request in this repository
(`.github/workflows/render-pr.yml` runs it on our own PRs).

## 6. Ask your agent

> Or ask your coding agent: "render this PR as a video". The skill runs the
> same CLI on your machine and answers with the file and the editor link.
>
> npx skills add delhombre/typelapse --skill typelapse-pr-to-video [211]

Attach: the agent's answer, the three lines from the skill's README (path, the
measured line, the studio link).
