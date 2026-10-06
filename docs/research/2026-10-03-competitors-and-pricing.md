# Competitors and pricing, code and launch video tools

Research date: 2026-10-03. Method: official pricing pages, docs, GitHub repos and APIs, npm API, Product Hunt and Hacker News threads. X (402), Indie Hackers (403), Crunchbase (403) and screen.studio/pricing (404) could not be fetched; figures from those come from search snippets and are marked "snippet". Anything not confirmed on a primary page is marked "unverified". Short quotes are kept to a minimum and paraphrased where possible.

## Executive summary

1. Nobody ships a GUI product that turns a pull request into a polished, editable video. The only PR-URL-to-video tools are agent skills: HeyGen's open-source `pr-to-video` (HyperFrames) and the community `pr-walkthrough`. Both have one fixed style and no editor.
2. HyperFrames is the real threat. It has 56.2k GitHub stars, 696k npm downloads a week and 298k skill installs, under Apache 2.0 with no render fee. Typelapse has to win on editor, preview-equals-export and sharpness, not on "PR to video exists".
3. On code video, the closest paid tools are Hackreels ($9 to $59/mo, server render minutes, ProRes and alpha) and Snappify ($5 to $9/mo, video export marked "experimental" and desktop-only). Snipcast ($12/mo, $99/yr) has no free tier and publishes no spec beyond "4K".
4. No competitor documents chroma subsampling, and none sells sharp text as its edge. Only Rotato (ProRes 4444, HEVC alpha), Jitter Max (ProRes 4444) and Hackreels (ProRes) offer a high-fidelity codec. Our AV1 4:4:4 WebM has no counterpart.
5. Local, no-account export works as a business. Cursorful has 60k users and a 4.9 rating with a free local tier and $79 one-time Pro. Cap is free for personal use, with $29/yr or $58 lifetime for commercial use. Every code-video SaaS above requires sign-in.
6. Developers punish subscriptions on occasional-use tools. Screen Studio dropped its $229 lifetime licence in October 2025 for $29/mo or $108/yr, which drew visible backlash and a wave of clones. Rotato, Cap, Cursorful and FocuSee still sell one-time licences.
7. The money is modest in code visuals and real in video. Snappify, after years of work, reported about $3k MRR in 2023 (snippet). Screen Studio made about $30k in its first month. Remotion-based SaaS self-report $1M+ ARR (Submagic, Revid, Crayo).
8. No evidence turned up of teams paying for release-notes videos specifically (unverified). The proven spend is launch videos: $2k to $8k freelance, $10k to $50k agency. Linear embeds videos in its changelog, and a Supabase DevRel repo builds launch videos with Remotion.
9. The best distribution channels are Product Hunt (polished dev-visual tools hit #1 to #3 with 500 to 1,000 upvotes), agent skills (298k installs), a free GitHub Action, then a paid GitHub App. Paid Marketplace apps need a verified org and 100 installs, and GitHub keeps 5%. Paid SaaS Show HNs get 1 to 2 points.
10. Remotion licence: free up to 3 people, contractors included. From 4 people, a hosted renderer or an embedded Player falls under "Automators" at $0.01 per render with a $100/month floor. Typeframes, a 2-person team, paid voluntarily. Our on-device canvas export is outside Remotion entirely.

## 1. Competitor matrix

Prices in USD. "Local" means rendering and export work on the user's device without an account.

| Tool | What it does | Free tier | Paid (monthly / yearly / one-time) | Max export | Codecs, GIF, alpha | Platform | Local, no account | Differentiator | Visible weakness |
|---|---|---|---|---|---|---|---|---|---|
| Typelapse (today) | Scene-first code, diff, PR and mixed-media video | On-device free | Hosted profile paid (billing stub) | 4K class | MP4, WebM AV1 4:4:4, GIF | Web | Yes | 4:4:4, WYSIWYG, PR import | Not launched |
| snipcast.dev | Paste code, auto-animate, export video | None (2-week trial) | $12 / $99 / none | "4K" | unverified | Web | No (sign-up for trial) | Simplest paste-to-video | No free tier, no spec, ~500 users claimed |
| ui.camera | 3D camera moves on UI shots and recordings | 1080p60, 1 project, 3 captures/wk, 12 s, personal | Pro $29/mo, Business $349/mo (3 seats); annual -28% | 4K60 | MP4, MOV, WebM, GIF; alpha unverified | Web | No | Cinematic product photography for UI | Very new, no reviews found |
| Screen Studio | Mac recorder with auto-zoom and cursor polish | unverified | $29 / $108 / removed Oct 2025 (was $229) | 4K60 MP4, GIF 1080p | MP4, GIF; alpha unverified | macOS only | Local render; account unverified | Best auto-zoom polish | Subscription backlash, no audio editing, Electron |
| Snappify | Code snippets, slides, video from slides | 3 snaps, 5 slides, watermark | $5/$60, $9/$108, Team $32/$384 (4 seats) | 4x scale, 60 fps (Pro) | Video, GIF, transparent bg option | Web; video in desktop app only | Web needs account | Most complete code-visual suite | Video "experimental", tight free tier |
| Hackreels | Snippet series to diffed animated video (Remotion) | 1 render min/mo, 10 s | $9 / $19 / $59 per month (15 / 60 / 240 render min) | 4K | ProRes, GIF, WebM, alpha | Web | No (server render, inferred) | Only code tool with ProRes and alpha | Pricing called steep, letter tweening "noise" (HN) |
| Chalk.ist | Multi-block code to image | Free, MIT | none | PNG | No video | Web | Yes for export (unverified) | Before/after layouts | Static only, slow maintenance |
| ray.so | Code to image (Raycast) | Free, MIT | none | PNG, SVG 2x | No video | Web, Raycast | Yes | Cleanest static output | Images not accessible, static |
| Carbon | Original code to image | Free, MIT | none | PNG, SVG up to 4x | No video | Web | Yes | 36.1k stars, category creator | Static, iframe export bugs |
| Rotato | 3D device mockup images and video | Unlimited trial | One-time $79 / $89 / $199 (snippet, unverified) | 8K, up to 120 fps | H.264, HEVC, ProRes 4444, HEVC alpha, GIF | macOS; Web beta | Yes (offline-first) | Alpha video and 8K, one-time | Mac only, keyframe bugs |
| Jitter | Browser motion design, Figma import | 3 files, 720p30, watermark | Pro, Max (~$35/mo, snippet), Ultra; annual -15% | 4K120 (Max) | MP4, GIF, Lottie, WebM, ProRes 4444; alpha on Max | Web | No | Figma-style motion design | No sound, alpha gated to top tier |
| Tella | Record and edit screen/webcam videos, hosted | unverified | $13 / $19 per user/mo (annual) | 4K, 60 fps on Premium | unverified | Web, macOS, Windows | No | Edit-as-you-record, hosting, analytics | Lost-recording reports, laggy editor |
| Cursorful | Auto-zoom screen recorder | Free, local, non-commercial, no watermark | $79 one-time (was $119) | 4K | unverified | Chrome ext, macOS, Windows | Yes | Free local Screen Studio alternative | Free tier non-commercial |
| Cap | Open-source Loom / Screen Studio alternative | Personal use, 4K60 local | Desktop $29/yr or $58 lifetime; Pro $12/user/mo | 4K60 | unverified | macOS, Windows, self-host | Studio Mode local; sign-in at start | AGPL, self-hostable | Export flicker, Windows memory issues |
| Kap | Free GIF screen recorder | Free, MIT | none | unverified | GIF flagship | macOS | Yes | Simple GIF capture | Dormant since 2022, crashes on macOS 27 |
| Motion Canvas | TS library plus editor for code animation | Free, MIT | none | Configurable | Image sequence, FFmpeg; PNG alpha | Local browser (Vite) | Yes | Precise programmatic animation | Last release Dec 2024, no headless render |
| Revideo / Midrender | Motion Canvas fork, headless render; AI editor | MIT; Midrender 3 projects | Midrender $20 / $100 per month | unverified | MP4, WebM, MOV, alpha | Node, browser | OSS yes | Code-to-video API for agents | OSS deprioritised behind Midrender |
| HyperFrames pr-to-video | Agent skill: PR URL to MP4 | Free, Apache 2.0 | none (HeyGen voice optional) | 1080p (3 aspect ratios) | MP4 | Local CLI + agent | Yes | Only PR-URL-to-video at scale | Needs an agent, one style, no editor |
| pr-walkthrough | Agent skill: PR URL to narrated video | Free | none | unverified | MP4 | Local Python | Yes | Narration via whisper | Community, heavy setup |
| RepoClip | Repo URL to AI promo video, release Action | 2 videos/mo, 720p | $29 / $79 / $199 per month (unverified) | 4K (Agency) | MP4 | Web | No | GitHub Action on release | Generative visuals, not the real diff |
| Velo | Changelog to narrated "what's new" video | 15 min/mo | $20 / $200 per month | unverified | unverified | Web | No | Changelog-video use case | No code visuals |
| ngram | Release notes or GitHub Release URL to video | none | Contact sales | unverified | MP4 | Web | No | Multi-channel, localisation | No code visuals, opaque price |
| zlvox | Typewriter code to vertical video | Free, no watermark | none | 1440x2560, 60 fps | H.264 MP4 via WebCodecs | Chromium browsers | Yes | Zero-friction in-browser | Vertical only, no morph |
| FocuSee | Auto-zoom recorder (iMobie) | 1 free export | $19.99 to $24.99/mo; $49.99 or $79.99/yr; $199.99 lifetime | 4K60 | unverified | macOS, Windows | unverified | Lifetime option | Traction unverified |

Gource (13.2k stars), git-story (275 stars) and gitlogue (5.1k stars) animate repo history or commit replays. None renders a PR diff into an editable video. gitlogue has no video export.

## 2. Where is the money

### Visible revenue and traction

| Company | Team | Money signal | Source quality |
|---|---|---|---|
| Screen Studio | 5, bootstrapped | ~$30k first month; 8,000 customers in 9 months; PH #1, 828 upvotes | Podcast and Starter Story (secondary); "$100K MRR" unverified |
| Snappify | 1 | $460 MRR (May 2022), ~$1k MRR (Nov 2022), ~$3k MRR (2023); 40k+ users claimed | Snippets and aggregators |
| Tella | ~3 to small | $2.1M seed Apr 2025, $3.5M total incl. YC; est. $5M ARR 2024 | Tech.eu (primary press); Latka estimate |
| Jitter | small, France | YC W20 ~$150K; est. $3.6M ARR 2024; Golden Kitty 2023 | Snippets; Latka estimate |
| Rotato | founder-led | "100% self-funded", "Profitable", 250,000 installs | rotato.app/about (self-reported) |
| Cap | 4 | Pre-seed, amount undisclosed; 23,012 GitHub stars | Secondary blog; GitHub API |
| Remotion | ~6 (est.) | 2024 "slightly profitable", 200+ active customers, CHF 241k raised | remotion.dev/docs/investors (primary) |
| Revid.ai (Remotion) | 4 | "$680k MRR" | X snippet, unverified |
| Submagic (Remotion) | ~10 | $1M ARR 3 months after launch; $8M revenue | Remotion page (self-reported); Baremetrics interview |
| Crayo (Remotion) | small | Over $500k per month | Remotion page, self-reported |
| Typeframes (Remotion) | 2 | $2k to $8k MRR, later folded into Revid | X snippets, unverified |
| Hackreels | 1 (maker) | PH 190 points, #7 of the day; no revenue found | PH page |
| snipcast | unverified | 500+ users, 1k+ videos claimed | Homepage, self-reported |

Reading: AI or marketing video SaaS (Submagic, Revid, Crayo) earns real money. Code-specific visual tools stay small (Snappify around $3k MRR), and static code images anchor at $0 (ray.so, Carbon). Screen Studio shows that "make a developer look good on video" sells to individuals.

### Price points developers accept

| Model | Examples | Price |
|---|---|---|
| Low monthly code tool | Snappify Starter / Pro | $5 / $9 per month |
| Mid monthly code video | Hackreels Basic, snipcast | $9 to $12 per month; $99/yr |
| Premium individual video | Screen Studio, ui.camera Pro | $29/mo or $108/yr; $29/mo |
| One-time licence | Cursorful, Rotato, Cap lifetime, FocuSee lifetime | $79; $79 to $199; $58; $199.99 |
| Per seat | Snappify Team, Cap Pro, Tella | $8, $12, $13 to $19 per user/mo |
| Done-for-you | ui.camera Business (2 videos/mo, 3 seats) | $349/mo |
| Launch video agency | Freelancer / agency / avg 60 s video | $2k to $8k / $10k to $50k / ~$2,940 |

Willingness-to-pay signals:
- HN users said Screen Studio would be clearly worth it without a subscription. One buys a single month at release time, then pauses. Another suggested about $100 for unlimited access (HN 47645554).
- Its founder called the $229 lifetime tier a mistake with low adoption, and said in an X snippet that he regrets the price.
- "Free for personal, paid for work" works at Cap and Cursorful. Team seats sit at $8 to $19.
- PR or release-notes video: no public price or customer statement was found (unverified). The adjacent spend is launch videos ($1k to $16k per video), plus changelog SaaS like Velo ($20 to $200/mo) and ngram (sales-led).

## 3. Distribution

### How these tools got their users

| Channel | Evidence | Number |
|---|---|---|
| Product Hunt | Screen Studio #1 (Nov 2022); ray.so #3; snappify #2; Remotion 2.0 #1; Jitter Golden Kitty | 828; ~1,000; 522 to 538; 443 upvotes |
| Hacker News | ray.so Show HN; Revideo Show HN; Remotion Show HN; snappify; RepoClip | 384; 298; 42; 2; 1 points |
| GitHub stars | Carbon; Kap; Motion Canvas; Cap; HyperFrames; Remotion | 36.1k; 19.4k; 19.2k; 23.0k; 56.2k; 61.7k |
| Chrome Web Store | Cursorful | 60,000 users, 4.9 from 1.1k ratings |
| Agent skills | HyperFrames pr-to-video on skills.sh | 298.2k installs |
| VS Code extensions | CodeSnap; Polacode; carbon-now-sh; snappify (funnel) | 3.96M; 1.80M; 226k; 25k installs |
| npm weekly | remotion; hyperframes; shiki-magic-move; codehike; @revideo/core; carbon-now-cli | 2.09M; 696k; 67.6k; 27.9k; 24.9k; 114 |
| Affiliates | Screen Studio affiliates in one month | $17k+ (Starter Story, secondary) |

Pattern: polished, visual dev tools win on Product Hunt and X. HN rewards free or open-source simplicity and ignores paid SaaS launches. Free screenshot extensions reach millions of installs, but the paid funnel extension (snappify) reaches about 25k. The CLI screenshot niche is tiny (114 downloads a week).

### Channels that fit a PR renderer

| Channel | Fit | Constraint |
|---|---|---|
| Agent skill (Claude Code, Codex) | Strong: this is where pr-to-video got 298k installs | Competes head-on with HyperFrames; Typelapse needs a headless export path |
| GitHub Action (free) | Strong: "render a video on release or PR merge" posts an artifact link | Actions are listed free and unreviewed; RepoClip already has one (1 star) |
| GitHub App (paid, Marketplace) | Good for team workspaces and the PR comment bot | Verified publisher org, 100 installs, monthly and annual billing, 5% fee; a free listing cannot coexist with a paid version sold outside the Marketplace |
| VS Code extension | Funnel only | snappify's extension reached 25k; free screenshot extensions reach millions |
| Product Hunt + X launch with our own export as the demo | Proven for this category | One-day spike; needs a sharp demo asset |
| CLI / npm | Weak on its own | carbon-now-cli at 114 a week; useful as the engine behind the Action and the skill |

## 4. Gaps we can own (ranked)

1. **Code-sharp export (4:4:4 chroma, no subsampling blur on thin glyphs).**
   - No tool in the matrix mentions chroma subsampling or text sharpness. Snipcast claims only "4K".
   - The only high-fidelity codecs are ProRes at Hackreels (server-rendered, paid), Rotato Premium and Jitter Max. Those are designer formats, not web-playable files.
   - Our AV1 4:4:4 WebM is web-playable and was measured on code. This can ship as a claim plus a side-by-side zoom demo now.
2. **PR or diff import inside a real editor where preview equals export.**
   - HeyGen pr-to-video needs an agent, renders one locked style, caps hunks at 12 lines and has no editor or token-level morph.
   - pr-walkthrough needs a Python stack. RepoClip takes repo URLs and invents visuals. ngram and Velo take release text, not code.
   - Snappify and Hackreels need code pasted by hand.
   - Typelapse already merged diff and PR-URL import, windowing and multi-commit chapters.
3. **On-device, no account, free forever for the user's machine.**
   - Every code-video SaaS (snipcast, Hackreels, Snappify web) requires sign-in. The local options (zlvox, Snippet Cast, CodeMotion) have 0 to 1 stars and no polish.
   - Cursorful (60k users, 4.9 stars) and Cap (23k stars) show that a free local tier with paid commercial or cloud features grows.
   - The Screen Studio backlash shows a trust premium for tools that do not lock work behind a subscription.
4. **Scene-first mixed media for launch videos (code plus text, image, video, audio).**
   - Code tools stop at code. Screen recorders stop at recordings. Jitter is designer-grade but has no code awareness, and Product Hunt users ask it for sound.
   - The spend sits in launch videos ($2k to $8k freelance, about $2,940 average). One tool that composes the diff, the screenshot and the soundtrack fills the space between Snappify and an agency.
5. **Team workspaces for release videos (GitHub App plus seats).**
   - No product combines seat pricing with PR import for release or changelog videos. Snappify Team ($32 for 4 seats) is code stills and slides. Tella seats ($13 to $19) cover recordings.
   - Demand signals: Linear embeds videos in its changelog, and a Supabase DevRel repo builds launch videos in Remotion.
   - Willingness to pay for release videos is unverified. Rank it last and validate with 5 to 10 DevRel interviews before building billing.

## 5. Remotion licensing precedent

Note: remotion.dev/docs/license renders as a stub via fetch. The text below comes from the raw docs sources (license FAQ and Terms on GitHub) and LICENSE.md.

### What the licence says (paraphrased unless quoted)

- **Free licence:** individuals, for-profit organisations with up to 3 employees, non-profits, and anyone evaluating without commercial use (LICENSE.md). The FAQ adds that an incorporated company stays free while total headcount is 3 or less, even when it launches a SaaS or an automation. Free and paid licences have identical functionality.
- **Company licence, Creators:** $25 per month per person who writes Remotion code. The current FAQ and Terms say there is no minimum when Creators is bought alone. The older remotion.pro/license summary still says 3 seats minimum. Re-check at purchase time.
- **Company licence, Automators:** $0.01 per render, billed in blocks of 1,000, with a $100/month minimum. It applies to anyone owning code that calls renderMedia, renderStill, the Lambda, Cloud Run and Vercel render functions, renderMediaOnWeb, the CLI render, or the `<Player>`. The FAQ explicitly places video editors and anyone embedding the Player in this tier. Enterprise is the same price with a $500 floor.
- **Team-size counting (Terms, "Determination of company size and team size"):**
  - A licence is required once personnel across all parties operating the software on the same project reach "the threshold of four or more" (quote).
  - Part-time employees and independent contractors count.
  - A party that only receives the generated media does not count.
  - Whether non-Remotion staff of the same company count is ambiguous: the Terms say project personnel, LICENSE.md says employees. Ask hi@remotion.dev for written confirmation (unverified).
- **SaaS rules:** a drag-and-drop editor where end users edit and render is allowed. A cloud service that renders user-uploaded Remotion projects is not, without written approval. Native apps need an abstraction layer and render reporting, plus a licence for one year after the last release.
- **Enforcement trend:** Remotion 5.0 makes a licence key and telemetry mandatory for Automators. Client-side rendering APIs always send a telemetry event. Significant infringement carries a 10% monthly interest clause. Codec patent fees are not covered.
- **Cost context:** AWS Lambda costs about $0.017 to $0.021 per 1-minute video, so the $0.01 Remotion fee adds roughly 50%.

### How small teams on Remotion handle it

| Product | Team | Licence handling | Source |
|---|---|---|---|
| Typeframes | 2 | Inside the free tier but bought a licence anyway "to support Remotion" (paraphrase of founder) | remotion.dev/success-stories/typeframes |
| Revid.ai | 4 | Above the threshold; no public statement on licence | X snippet (team of 4), unverified |
| Submagic | ~10 | Would require a Company licence; not stated publicly | Baremetrics; Remotion page |
| Crayo, AIVideo.com | small | Not stated; Remotion says it cannot verify their revenue claims | remotion.dev/success-stories/a-million-dollars |
| Hackreels | 1 | Free tier (solo) | HN thread mentions Remotion |
| RepoClip | small | Renders on Remotion Lambda; licence not stated | HN Show HN |
| GitHub Unwrapped | Remotion itself | Open source showcase on Lambda | github.com/remotion-dev/github-unwrapped |

Implications for Typelapse:
- The on-device WebCodecs export uses our own canvas painter, so it is outside the Remotion licence.
- The hosted queued render uses Remotion and falls under Automators once the team, contractors included, reaches 4 people. At 10,000 renders a month that is the $100 floor; at 100,000 it is $1,000.
- If the studio preview embeds `@remotion/player`, that also counts as automation at 4+ people (check the current code).
- While the team is 3 or fewer, everything is free. Typeframes shows that paying voluntarily is good standing with the Remotion team.
- HyperFrames (Apache 2.0) has no such fee, which is a structural cost edge for HeyGen's tool.

## Sources

Competitor pages and docs
- https://snipcast.dev/ , https://snipcast.dev/pricing (404) , https://daily.dev/posts/52lxda3nc , https://pitchwall.co/product/snipcast
- https://ui.camera/ , https://ui.camera/pricing , https://www.designminis.com/tools/ui-camera
- https://screen.studio , https://screen.studio/pricing (404) , https://hub.screen.studio/en , https://www.producthunt.com/products/screen-studio , https://www.producthunt.com/products/screen-studio/reviews , https://news.ycombinator.com/from?site=screen.studio
- https://alternativeto.net/news/2025/10/screen-studio-has-removed-their-non-subscription-licensing-options-for-new-customers/ , https://pricetimeline.com/news/173 , https://www.screenkite.com/blog/screen-studio-subscription-free-alternative
- https://x.com/pie6k/status/1645770967216451585 , https://x.com/pie6k/status/1973321084641358308 , https://x.com/screenstudio/status/1909705311369470115 , https://x.com/AlternativeTo/status/1973440299440439589 , https://x.com/aakashgupta/status/2039289929281466692 (all X: snippet only)
- https://www.starterstory.com/screen-studio-breakdown , https://www.systemaic.com/teardowns/screen-studio , https://make-lemonade.simplecast.com/episodes/taking-on-adobe-with-his-bootstrapped-tool-screen-studio-adam-pietrasiak-_vH5kqBv , https://getlatka.com/companies/screen.studio
- https://snappify.com , https://snappify.com/pricing , https://snappify.com/features/video-export , https://snappify.com/docs/slides/video-export , https://snappify.com/blog/best-ray-so-alternatives , https://snappify.com/blog/carbon-now-sh-alternatives , https://www.producthunt.com/products/snappify , https://www.producthunt.com/products/snappify/reviews , https://hunted.space/dashboard/332783 , https://news.ycombinator.com/item?id=27519465
- https://getlatka.com/companies/snappify.io , https://www.indiehackers.com/product/snappify/1000-mrr--NJ4NwCuCqLCcXGHND_W (403) , https://www.startups.fyi/product/snappify
- https://www.hackreels.com/ , https://www.producthunt.com/products/hackreels , https://news.ycombinator.com/item?id=37967010 , https://x.com/devhunt_/status/1727977108767436849 (402)
- https://github.com/idered/chalk.ist , https://openalternative.co/chalkist
- https://github.com/raycast/ray-so , https://news.ycombinator.com/item?id=26168285 , https://hunted.space/dashboard/284836 , https://openalternative.co/ray-so , https://devresourc.es/resource/ray-so/39nywhco
- https://github.com/carbon-app/carbon , https://github.com/carbon-app/carbon/issues/915 , https://github.com/mixn/carbon-now-cli , https://github.com/mixn/carbon-now-cli/issues/67
- https://rotato.app , https://rotato.app/pricing , https://rotato.app/about , https://rotato.app/ai-info , https://makerstack.co/reviews/rotato-review/ , https://www.producthunt.com/products/rotato , https://www.producthunt.com/products/rotato/reviews
- https://jitter.video/pricing , https://help.jitter.video/en/articles/5369843-export-your-work , https://help.jitter.video/en/articles/14809073-compare-jitter-s-subscription-plans , https://help.jitter.video/en/articles/5366937-does-jitter-offer-a-lifetime-subscription , https://x.com/StudentOffersHQ/status/2085887795839844362 , https://www.producthunt.com/products/jitter , https://getlatka.com/companies/jitter.video , https://www.crunchbase.com/organization/snack-this (403)
- https://www.tella.com/pricing , https://www.producthunt.com/products/tella-1-0/reviews , https://efficient.app/apps/tella , https://getlatka.com/companies/tella.tv , https://tech.eu/2025/04/22/tella-raises-2-1m-for-ai-powered-video-creation/ , https://techfundingnews.com/exclusive-tella-lands-2-1m-to-lead-the-next-wave-of-screen-recording-software-challenging-looms-dominance/ (403)
- https://www.cursorful.com , https://chromewebstore.google.com/detail/cursorful-screen-recorder/eihpmapodnppeemkhkbhikmggfojdkjd , https://www.uneed.best/blog/cursorful-review
- https://cap.so/pricing , https://github.com/CapSoftware/Cap , https://github.com/CapSoftware/Cap/issues/1787 , https://github.com/CapSoftware/Cap/issues/1291 , https://github.com/CapSoftware/cap/issues/1754 , https://flaviocopes.com/cap-business-model/
- https://github.com/wulkano/Kap , https://github.com/wulkano/Kap/issues/1063 , https://github.com/wulkano/Kap/issues/1125 , https://github.com/wulkano/Kap/issues/1270 , https://github.com/wulkano/Kap/issues/1276 , https://github.com/wulkano/Kap/issues/1293 , https://github.com/wulkano/Kap/issues/1294
- https://github.com/motion-canvas/motion-canvas , https://motion-canvas.io/docs/rendering/ , https://motioncanvas.io/docs/code-block/ , https://github.com/orgs/motion-canvas/discussions/1015 , https://github.com/motion-canvas/motion-canvas/issues/1218 , https://github.com/motion-canvas/motion-canvas/issues/1115 , https://news.ycombinator.com/item?id=44507381 , https://news.ycombinator.com/item?id=47191103
- https://github.com/midrender/revideo , https://github.com/midrender/revideo/pull/74 , https://midrender.com , https://midrender.com/revideo , https://midrender.com/revideo/docs , https://midrender.com/revideo/docs/animations/code-animations , https://midrender.com/revideo/docs/code-snippets/transparent-video , https://midrender.com/pricing , https://www.ycombinator.com/companies/midrender , https://www.producthunt.com/products/revideo , https://news.ycombinator.com/item?id=40646741 , https://news.ycombinator.com/item?id=40656657
- https://focusee.imobie.com/pricing.htm

PR, diff and changelog video tools
- https://github.com/heygen-com/hyperframes , https://github.com/heygen-com/hyperframes/tree/main/skills/pr-to-video , https://raw.githubusercontent.com/heygen-com/hyperframes/main/skills/pr-to-video/SKILL.md , https://hyperframes.heygen.com/prompting/overview , https://hyperframes.video/blog/animated-changelog-videos (502) , https://www.skills.sh/heygen-com/hyperframes/pr-to-video , https://www.getclaudeskills.com/skills/pr-to-video-heygen-com , https://happycapy.ai/skills/pr-to-video , https://skillstore.io/skills/heygen-com-pr-to-video
- https://skills.rest/skill/pr-walkthrough-ilamanov , https://github.com/ilamanov/skills
- https://repoclip.io , https://repoclip.io/blog/auto-generate-demo-videos-github-release , https://www.softwaresuggest.com/repoclip , https://github.com/repoclip/generate-video , https://news.ycombinator.com/item?id=47045631
- https://www.ngram.com/convert/release-notes-to-video , https://www.usevelo.ai/pricing , https://usevelo.ai/use-cases/changelog-videos/
- https://github.com/Abdulkader-Safi/Snippet-cast , https://github.com/revng-claudietto/magicmove , https://github.com/shikijs/shiki-magic-move , https://sli.dev/features/shiki-magic-move , https://github.com/putrarawr/CodeMotion , https://codemotion.biz.id/ , https://zlvox.com/tools/code-to-video
- https://github.com/HeyItsJhello/CodeAnimator , https://dev.to/heyitsjhello/i-just-made-codeanimator-an-open-source-tool-that-turns-code-files-into-animated-videos-for-1f1l , https://github.com/jjlimin/CodeAnimator , https://github.com/sleuth-io/code-video-generator , https://github.com/im-oree/CodeVideo , https://github.com/GavalasDev/typingvid
- https://github.com/riccardoperra/codeimage , https://www.codeimage.dev , https://codeshotapp.com/posts/carbon-now-sh-alternatives-2026/ , https://www.screensnap.pro/blog/best-code-to-image-tools
- https://github.com/initialcommit-com/git-story , https://github.com/acaudwell/Gource , https://github.com/unhappychoice/gitlogue
- https://www.remotion.dev/templates/code-hike , https://github.com/remotion-dev/template-code-hike , https://codehike.org/blog/remotion , https://github.com/code-hike/examples/tree/main/with-remotion
- https://poko.video/blog/best-github-to-video-tools , https://github.com/EveryInc/product-launch-video , https://remocn.dev/docs/guides/changelog-video , https://github.com/marketplace/actions/pr-gif-generator , https://www.govideolink.com/blog/how-to-create-pull-request-walkthrough-videos , https://news.ycombinator.com/item?id=46694975 , https://news.ycombinator.com/item?id=41827955

Remotion licence and Remotion-based SaaS
- https://www.remotion.dev/docs/license , https://www.remotion.dev/docs/license/faq , https://www.remotion.dev/docs/license/pricing , https://www.remotion.dev/docs/terms , https://www.remotion.dev/docs/telemetry , https://www.remotion.dev/docs/lambda/cost-example
- https://github.com/remotion-dev/remotion , https://github.com/remotion-dev/remotion/blob/main/LICENSE.md , https://raw.githubusercontent.com/remotion-dev/remotion/main/packages/docs/docs/license/faq.mdx , https://raw.githubusercontent.com/remotion-dev/remotion/main/packages/docs/docs/terms.mdx , https://github.com/remotion-dev/remotion/pull/3750
- https://www.remotion.pro , https://www.remotion.pro/license
- https://www.remotion.dev/docs/investors , https://www.remotion.dev/blog/seed-funding , https://getlatka.com/companies/remotion.dev , https://x.com/JNYBGR/status/2016935523462332487 , https://x.com/JNYBGR/status/1892128469569458199 , https://x.com/JNYBGR/status/1837035972870930681 (X: snippet only)
- https://www.remotion.dev/success-stories , https://www.remotion.dev/success-stories/a-million-dollars , https://www.remotion.dev/success-stories/typeframes , https://github.com/remotion-dev/github-unwrapped , https://githubunwrapped.com/about , https://news.ycombinator.com/item?id=30557206 , https://hunted.space/dashboard/283561 , https://hunted.space/dashboard/302871
- https://baremetrics.com/founder-chats/david-zitoun , https://getlatka.com/companies/submagic.co , https://x.com/tibo_maker/status/2024068923256168688 , https://x.com/tibo_maker/status/1785262592333689328 , https://x.com/petergyang/status/2048462231470547038 , https://www.therundown.ai/tools/typeframes-video-creation

Distribution
- https://docs.github.com/en/apps/github-marketplace/creating-apps-for-github-marketplace/requirements-for-listing-an-app , https://docs.github.com/en/apps/github-marketplace/github-marketplace-overview/about-github-marketplace-for-apps , https://docs.github.com/en/apps/github-marketplace/selling-your-app-on-github-marketplace/pricing-plans-for-github-marketplace-apps , https://docs.github.com/en/actions/sharing-automations/creating-actions/publishing-actions-in-github-marketplace , https://docs.github.com/en/site-policy/github-terms/github-marketplace-developer-agreement , https://github.blog/news-insights/company-news/github-reduces-marketplace-transaction-fees-revamps-technology-partner-program/
- https://marketplace.visualstudio.com/items?itemName=adpyke.codesnap , https://marketplace.visualstudio.com/items?itemName=pnp.polacode , https://marketplace.visualstudio.com/items?itemName=ericadamski.carbon-now-sh , https://marketplace.visualstudio.com/items?itemName=snappify.snappify , https://marketplace.visualstudio.com/items?itemName=utiltools.code-screenshot-utiltools
- https://api.npmjs.org/downloads/point/last-week/remotion , https://api.npmjs.org/downloads/point/last-week/@remotion/renderer , https://api.npmjs.org/downloads/point/last-week/hyperframes , https://api.npmjs.org/downloads/point/last-week/shiki-magic-move , https://api.npmjs.org/downloads/point/last-week/codehike , https://api.npmjs.org/downloads/point/last-week/@revideo/core , https://api.npmjs.org/downloads/point/last-week/@code-hike/mdx , https://api.npmjs.org/downloads/point/last-week/@motion-canvas/core , https://api.npmjs.org/downloads/point/last-week/carbon-now-cli

Money, willingness to pay, DevRel
- https://news.ycombinator.com/item?id=47645554 , https://news.ycombinator.com/item?id=46995331
- https://linear.app/changelog , https://github.com/SamRome1/Remotion-DevRel-Assests , https://www.productlift.dev/blog/best-changelog-examples/
- https://supaintro.com/guides/product-launch-video-cost , https://studiomonday.co/blog/explainer-video-cost-in-2026/ , https://solairmotion.com/blog/how-much-does-a-saas-explainer-video-cost-in-2026/ , https://www.flowjam.com/blog/affordable-launch-video-agency , https://vidico.com/news/best-saas-video-production-company/ , https://www.retainable.com/blog/b2b-video-production-cost-guide , https://www.contentbeta.com/blog/product-demo-video-cost/
