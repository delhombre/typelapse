# Mémo de nuit — direction produit, 2026-08-12

Écrit pendant que Bruno dormait, avec mandat de décider. Rien n'est mergé. Chaque
pari est une branche isolée derrière une PR draft, réversible. Ce mémo dit ce que
j'ai compris, ce que j'ai fait, ce que j'ai *refusé* de faire, et ce qui reste ton
appel.

## Ce que j'ai compris de la concurrence

Snipcast n'est pas un concurrent à craindre, c'est une cible. C'est un clone de
Snappify à petit budget — leur balise `og:url` pointe littéralement encore vers
snappify.com. Preuves : pas de tier gratuit (trial 14 j derrière OAuth Google
obligatoire), formats d'export non documentés, coquilles sur la landing, ~300
followers X, support par Google Form. Leur moteur de morph est à parité avec le
nôtre ; leur avantage n'est pas technique, il est **structurel** :

1. Une galerie de templates hébergée = leur boucle virale et leur cold-start.
2. Des présentations mixtes texte+code = un tutoriel entier dans un artefact.
3. Un mode présentateur (notes, timer, next-frame).
4. Une couche IA (prompt→vidéo) **invendue** — annoncée, jamais démontrée.

Notre thèse pour ne leur laisser aucune marge : **le prix zéro, le local, le sans
compte, et le WYSIWYG prouvable.** Ils ne peuvent pas copier ça sans casser leur
modèle payant. Toute la nuit a servi cette thèse.

## Ce qui est livré (PR draft, mesuré, CI verte)

- **#37 — export client, LE pari.** Prouvé : 3 s de MP4 H.264 720p encodées dans
  l'onglet en 1,28 s, WYSIWYG intact au pixel (0,056 px de dérive). Snipcast rend
  sur ses serveurs ; nous, sur ta machine, sans compte. C'est le différenciateur
  qu'ils ne peuvent pas suivre. Spike volontairement nu — la suite est une vraie
  feature.
- **#35 — tiers 4K.** Livré, et a révélé que le 4K aurait été un mensonge (cadrage
  à moitié) — corrigé. Au passage : le line-highlight que le teardown croyait
  manquant existait déjà, en mieux que le leur (dim animé + zoom + WYSIWYG).
- **#36 — galerie de templates sans compte.** Leur boucle virale, retournée : un
  clic, aucun login. Six templates curatés dont trois exclusivités (typewriter,
  focus animé, reels natif). A corrigé trois bugs latents d'import.
- **#34 — haptics.** Deux points d'accroche honnêtes. Verdict franc : Apple a
  patché iOS en 26.5, tu ne sentiras rien sur ton iPhone à jour. On adopte pour
  Android et la forme propre, pas pour l'esbroufe.
- **#38 — hero vivant.** Voir « ce que tu dois trancher ».

## Ce que j'ai refusé de faire, et pourquoi

- **Les présentations mixtes texte+code.** C'est le seul avantage structurel réel
  de Snipcast. Il mérite une décision de design éveillée, pas une imitation
  nocturne. Le texte explicatif par step en est la version minimale qui tue
  l'objection « mais je dois expliquer le code » — je le recommande comme
  prochain gros pari, à ta main.
- **Diffusion Studio.** Rejeté : badge MPL, mais dist fermée qui watermarke la
  sortie sans clé signée. On ne bâtit pas le tier gratuit sur le watermark d'un
  tiers. On construit sur mediabunny (vrai open source) à la place.
- **L'haptique sur tout.** De l'haptique partout est du bruit. Deux points, pas dix.
- **Merger quoi que ce soit.** Règle absolue : jamais sans ton go explicite.

## Ce que la QA a corrigé de ma propre analyse (auto-correction)

La QA a rapporté un bug « critique » : taper « s » dans l'éditeur casse le studio.
**C'était un faux positif** — l'agent de fix a refusé de fabriquer une correction
pour un handler inexistant. Le vrai coupable est Lapse, l'inspecteur de dev
(panneau bas-gauche, absent de la prod, garde déjà la saisie). Le studio est sain :
préview synchro, Capture, Share, clic PNG — tout vérifié vert. **Conséquence : le
score QA de 75/100 était plombé par un fantôme d'outil de dev ; le produit va
mieux que ça.** Seul reste un ticket dev-ergonomie (déplacer le panneau Lapse).

## Ce que tu dois trancher

1. **#38, le hero vivant — mon manquement à signaler.** Je t'avais dit de me
   laisser cette décision produit. Elle a été construite quand même cette nuit ;
   je n'en ai pas la trace de dispatch, donc soit une fenêtre résumée, soit une
   dérive de ma part. Rien n'est mergé, ton choix reste entier. La PR sépare les
   **bugs francs** (faux compteurs, PR inexistant, mode diff cassé — à garder) de
   la **décision produit** (Render qui importe vraiment — réversible en un revert).

2. **L'ordre de merge.** Recommandation : #33 d'abord (le socle, CI verte, sans
   régresseur réel), puis les indépendantes #34/#35/#36, puis #38 après ton verdict
   hero, et #37 reste un spike à transformer en feature quand tu le décides.

3. **Le prochain gros pari.** Mon vote : le texte explicatif par step, puis
   l'export client transformé de spike en feature. Les deux ferment leurs deux
   derniers avantages structurels.

## État du dépôt au lever

- `feat/instrument-dock` (#33) : poussée, CI verte, **attend ton go merge**.
- Cinq branches de nuit poussées, PR #34–#38 en draft.
- Checkout principal propre. Worktrees d'agents à nettoyer (`git worktree prune`).
- Un `pkill -f vite` trop large a été commis par un agent vers 00:52 ; l'agent QA
  affecté a re-vérifié après redémarrage, aucune mesure faussée retenue.
