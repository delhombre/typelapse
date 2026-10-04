# Product Hunt listing

Viability D1 sets the order of the pitch: the file is as sharp as the preview,
it runs in the browser with nothing uploaded, and it starts from a pull
request. Mixed media is the second sentence. Prices follow D3 and stay a
recommendation until the owner confirms them (D8); check `checklist.md` before
posting.

## Name

Typelapse

## Tagline (56 characters)

Code videos from a pull request, as sharp as the preview

## Topics

Developer Tools, Video, GitHub, Open Source (only once the repository is public)

## Description

Typelapse turns a pull request, a diff or a snippet into a code video, in your
browser. Paste a PR link and the change becomes scenes you can edit: reorder
them, retime them, add a title card, an image, a clip or a voice-over, then
export.

The export runs on your machine with WebCodecs. No account, nothing uploaded,
no watermark, up to 4K. The WebM keeps full colour on every glyph (AV1 4:4:4):
on the same frame of code it scores 42.81 dB against 32.18 dB for an H.264
4:2:0 MP4, and the measurement is committed next to the code.

The same engine runs headless: a CLI, a free GitHub Action that renders every
pull request and comments a link back into the editor, and an agent skill.

## Gallery

Rendered with Typelapse itself; the commands are in `assets.md`.

1. The 20 second launch clip (`docs/launch/launch.project.json`).
2. The sharpness pair: `docs/sharpness/av1-444.png` next to
   `docs/sharpness/h264-420.png`, captioned with the two numbers.
3. The README demo (`docs/demo.gif`).
4. A pull request comment posted by the Action, with its studio link.

## First comment from the maker

Hi, I'm Bruno. I make Typelapse.

I kept making short videos of code changes for release notes and launches, and
every tool I tried either blurred the text or wanted my code on its servers. So
Typelapse works from the pull request you already have, and it renders on your
machine.

Three things I can show rather than claim:

1. The file is as sharp as the preview. The studio preview, the server renderer
   and the in-browser encoder draw from the same scene math, and the WebM uses
   AV1 with 4:4:4 chroma, so thin coloured glyphs keep their colour. I measured
   it on one dense line of code: 42.81 dB for our WebM, 32.18 dB for an H.264
   4:2:0 MP4 of the same frame. The project, the script and the crops are in
   the repository (`docs/sharpness`), so you can rerun it.
2. It runs in your browser. No account, nothing uploaded. Your projects live in
   this browser's storage until you export them.
3. It starts from a pull request and lands in a real editor. Paste a GitHub PR
   or commit URL, or a diff, and you get scenes you can change, not a fixed
   template.

What is free: the whole studio on your machine, every export format and size,
the CLI, the GitHub Action and the agent skill. That stays free. The rule I
price by: what runs on your machine is free, what runs on ours is paid.

What is paid: Creator, $12 a month or $99 a year. It adds hosted renders (your
laptop stays free while a long video renders), cloud projects and private media
across devices. A free account can try cloud save with a small allowance and
no hosted renders.

What it does not do yet: captions and synthesized audio are baked only by the
server renderer, and Safari's encoder support decides which formats export on
the device there. The export panel says which format it can make before you
press Render.

I would like to hear where it breaks, especially on your own pull requests.
