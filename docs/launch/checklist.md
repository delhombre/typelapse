# Launch day checklist

For the owner, in order. Each line says how to know it is done. Viability D6
step 5 is this list; D8 (prices, licence, when the repository opens) comes
first because the Action and the skill only install from a public repository.

## The day before

- [ ] **D8 decided.** Final Creator prices (D3 recommends $12 a month or $99 a
      year), whether there is a founder annual price, the licence and the day
      the repository opens. If the prices change, update
      `docs/launch/product-hunt.md` before posting.
- [ ] **Stripe live.** In live mode, create the Creator monthly and annual
      prices, then set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
      `STRIPE_CREATOR_MONTHLY_PRICE_ID` and `STRIPE_CREATOR_ANNUAL_PRICE_ID` on
      the API, and point a live webhook at the API's Stripe endpoint. Done when
      `pnpm hosted:check` lists nothing missing and a real checkout reaches the
      webhook.
- [ ] **`TYPELAPSE_APP_URL` set to the public studio origin**, for both the
      production build and the API (share images, Stripe return URLs). Done
      when the build log has neither "TYPELAPSE_APP_URL is not set" nor "is a
      local address", and
      `curl -s "$TYPELAPSE_APP_URL" | grep og:image` prints an absolute
      `https://` URL.
- [ ] **The host serves `index.html` for every path**, so `/app` and an
      unknown address both load the app (the 404 page is drawn by the app).
- [ ] **Unfurls.** Paste the production URL into Slack, X, iMessage and
      LinkedIn; each shows the share image and the title.

## The morning

- [ ] **Push `main`.** `git push origin main`, after the merge.
- [ ] **Open the repository**, if D8 says today.
- [ ] **Tag the Action.** `git tag v0.1.0 && git push origin v0.1.0`, then
      change `uses: delhombre/typelapse@main` to `@v0.1.0` in the README.
      Done when a workflow in another repository runs with
      `uses: delhombre/typelapse@v0.1.0`.
- [ ] **`TYPELAPSE_STUDIO_URL`.** Settings, Secrets and variables, Actions,
      Variables: `TYPELAPSE_STUDIO_URL` = the studio's `/app` address. Done
      when the comment on a new pull request links the deployed studio and no
      longer says "run `pnpm dev` first".
- [ ] **Publish the skill.** From a clean machine,
      `npx skills add delhombre/typelapse --skill typelapse-pr-to-video`
      installs it, and one prompt renders a public pull request. Then list it
      in the skills directory where the PR-to-video skill from the research
      lives (D5).
- [ ] **Render the assets** with the commands in `docs/launch/assets.md` and
      check the clip with ffprobe (20.00 s, 1920x1080, 60 fps).
- [ ] **Post** Product Hunt first (`product-hunt.md`), then the X thread
      (`x-thread.md`), linking the Product Hunt page from the last post.

## Needs a device

Things a desktop browser cannot prove. Each says what to look for.

- [ ] **iPhone, Safari: no zoom on focus.** Tap the account island's Email
      field, the Watermark field in the export island, "Paste a link" and the
      "Import a git diff" box. The page must not zoom in (they are 16 px on
      touch now).
- [ ] **iPhone and Android: taps.** Tap studio buttons, the layer buttons in
      the phone sheet and a template card. No grey flash, no button left in
      its hover colour after the tap, and each still shows a pressed state.
- [ ] **iPhone and Android: no rubber band in the studio.** Drag on the stage
      and on the corner row. The page must not bounce or pull to refresh. The
      landing still scrolls and bounces normally.
- [ ] **Android Chrome: keyboard.** Open the phone sheet and focus the code
      editor or a text layer field. The field must stay visible above the
      keyboard.
- [ ] **Phone: reorder scenes.** Reordering is HTML5 drag and drop. Try it on
      iOS and Android; if it does not move, say so and it becomes a ticket.
- [ ] **Phone: import popovers.** Opening "Paste a link" or "Import a git
      diff" focuses the field and raises the keyboard at once. Decide whether
      that is wanted on a phone.
- [ ] **Dark OS, slow network: no light flash.** With the system in dark mode
      and DevTools on Slow 3G, hard-refresh `/` and `/app`. The page must open
      dark. Then pick dark on the landing with a light system and refresh: it
      must open dark.
- [ ] **Mid-range phone or an old laptop: playback.** Play a five-scene
      project and watch the timeline: dropped frames point at the timeline
      re-rendering every frame (open item in the ship check).
- [ ] **VoiceOver, export.** Open Export: the rows read as "Format", "Size",
      "FPS", "Where". Press Render: it is announced as "Rendering…", focus
      stays on it, and "Saved …" is read when the file is done.
- [ ] **VoiceOver, account.** Sign in with a wrong password: the error is read.
      Close the panel with Escape: note where focus lands.
- [ ] **Safari, macOS and iOS: Device export.** Try MP4, WebM and GIF. A
      format the browser cannot encode is refused in one sentence that names
      the one it can make.
