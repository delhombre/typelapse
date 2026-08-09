# Typelapse — plan produit et plan d'implémentation

> **Signature :** *A timelapse for your code.*
> **Catégorie :** outil de création de vidéos de code, open source, avec un service hébergé payant
> **Version du document :** 1.0 — 9 août 2026
> **Destinataire principal :** Claude, chargé de l'implémentation
> **Statut :** source de vérité produit et technique jusqu'à nouvel ADR

---

## 0. Directive d'exécution

Lire ce document entièrement avant de produire du code.

1. Ce projet n'est **pas** greenfield. Le moteur, l'export et l'UI sont faits et testés. Chaque tranche ci-dessous s'ajoute à un produit qui marche déjà : ne rien réécrire sans ADR.
2. Avancer par tranches verticales démontrables. Une tranche se termine par une démo utilisateur, pas par une couche technique complète.
3. Double boucle : un test d'acceptation extérieur guide la tranche, puis le TDD guide les objets internes. Red, Green, Refactor.
4. `src/domain` et `src/application` n'importent ni React, ni Hono, ni un SDK fournisseur, ni `node:`. La CI le vérifie (`tests/architecture/dependency-rule.test.ts`).
5. Toute dépendance nouvelle passe par un port existant ou en justifie un. Better-auth, Stripe et le stockage objet entrent par des adapters, jamais par un import direct depuis un cas d'usage.
6. **Ne jamais brider ce qui tourne sur la machine de l'utilisateur.** `Plan.local()` reste débloqué à l'infini. C'est une décision produit, pas un oubli.
7. Un entitlement ne se décide jamais côté client. Le serveur relit toujours l'état d'abonnement depuis sa propre source.
8. Le code ne porte pas de commentaire par défaut : les noms et les types portent l'intention. Un commentaire explique une contrainte externe que le code ne peut pas rendre évidente.
9. À la fin de chaque phase : critères de sortie, preuves de test, écarts restants. Pas de phase déclarée finie avec un critère obligatoire manquant.

---

## 1. État des lieux au 9 août 2026

Vérifié dans le dépôt, pas déduit de la documentation.

| Domaine | État réel |
|---|---|
| Moteur magic-move | fait, pur, partagé preview et rendu (invariant WYSIWYG) |
| Walkthrough de diff et d'URL de PR | fait, avec windowing et chapitrage |
| Export Remotion MP4/WebM/GIF | fait, serveur Hono local |
| Backgrounds, typewriter, captions, focus, audio | faits |
| Preview social in-feed (safe zones, chrome) | fait, PR #13 mergée |
| Landing page | faite, non déployée |
| Domaine `Plan` (local/free/pro/team, seats, caps) | fait et testé |
| Domaine team workspaces (org, member, workspace, role) | fait et testé, **non branché sur l'app** |
| Auth | **inexistante** |
| Stripe | **stub** : `server/routes/billing.ts` renvoie `cs_test_…` et `placeholder: true`, le webhook ne vérifie aucune signature |
| Rendu hébergé | **stub** : `server/routes/cloud.ts` lit un header `x-typelapse-plan`, ce qui est contournable par n'importe qui |
| CI | ajoutée le 9 août 2026 (PR #18) |
| Vulnérabilités | 38 ramenées à 0 (PR #17, #19) |
| Tests | 468 au vert |
| Distribution | **aucune** : pas de domaine en ligne, pas d'utilisateurs |

Le produit est bon et il n'a pas d'utilisateurs. C'est le fait le plus important de ce tableau.

---

## 2. Décision produit

### 2.1 Ce que vend Typelapse

Typelapse transforme un changement de code en une vidéo que quelqu'un a envie de regarder.

Le concurrent direct est snipcast, payant. Typelapse fait déjà mieux sur trois points mesurables : le morph token par token au lieu d'un fondu, l'invariant WYSIWYG entre preview et export, et l'import d'une PR GitHub entière en walkthrough chapitré. Ce dernier point n'a aucun équivalent chez le concurrent.

### 2.2 Ce que Typelapse n'est pas

- un éditeur vidéo généraliste ;
- un outil de capture d'écran ou de screencast ;
- un générateur de belles images de code figées (Carbon, ray.so) ;
- un service qui bride sa version locale pour vendre sa version hébergée.

### 2.3 North-star metric

**Nombre de vidéos publiées par semaine par un utilisateur récurrent.**

Pas le nombre d'exports : le nombre de vidéos qui finissent réellement postées. Un export qu'on ne publie pas est un échec produit déguisé en succès technique.

### 2.4 Anti-métriques

Ne pas optimiser pour le nombre d'étoiles GitHub, le nombre d'inscriptions sans export, ni le temps passé dans le studio. Un utilisateur qui reste longtemps dans l'éditeur est un utilisateur qui se bat avec l'outil.

---

## 3. Monétisation

### 3.1 Le problème posé

Le dépôt est public et sous licence MIT. N'importe qui peut le prendre et lancer le même service. La question naturelle est : « comment protéger la valeur ? »

C'est la mauvaise question. Pour un projet à zéro utilisateur, le risque n'est pas qu'un concurrent copie le code : c'est que personne ne s'en serve. La licence ne protège pas un produit que personne ne cherche. La distribution, la marque et le coût opérationnel le font.

### 3.2 Le principe de découpe

Une seule règle, qui décide de tous les cas limites :

> **Ce qui tourne sur la machine de l'utilisateur est gratuit et le restera. Ce qui tourne sur la nôtre est payant.**

Cette règle est déjà encodée dans le domaine : `Plan.local()` a des caps à l'infini et `allowsCloudExport: false`. L'OSS ne se bride jamais lui-même ; il ne donne simplement pas accès à notre infrastructure.

Elle est aussi la seule règle défendable techniquement. Un paywall sur une fonctionnalité qui s'exécute dans le navigateur de l'utilisateur, dans un dépôt MIT, se contourne en cinq minutes. Payer pour du CPU et du stockage qu'on ne possède pas, non.

### 3.3 Les trois sources de revenu, par ordre de solidité

**1. Le rendu hébergé (fondation).**
Rendre une vidéo Remotion demande Chrome headless, ffmpeg, de la RAM et des minutes de CPU. C'est un coût réel et une friction réelle à l'installation. On vend la commodité, pas le code. C'est le modèle de Plausible, Cal.com et de Remotion lui-même. C'est ce que le domaine `Plan` prévoit déjà.

**2. L'intégration GitHub PR vers vidéo (le vrai levier).**
Typelapse sait déjà transformer une URL de PR en walkthrough chapitré. Une GitHub App qui commente automatiquement chaque pull request avec une vidéo du changement transforme un outil de créateur en outil d'équipe. C'est le seul endroit où Typelapse a un pricing power réel :

- le budget d'une équipe est un ordre de grandeur au-dessus de celui d'un créateur individuel ;
- l'usage est récurrent et involontaire (chaque PR), pas ponctuel et motivé (« je veux faire une vidéo ») ;
- snipcast n'a rien de comparable, et la distance n'est pas rattrapable en une itération : elle repose sur le moteur de diff déjà écrit.

C'est là qu'il faut mettre l'effort produit après l'auth, pas dans plus d'options d'export.

**3. La marque (add-on).**
Retrait du watermark, brand kit, thèmes et presets partagés. Faible en revenu autonome, bon en justification de montée de gamme. Déjà partiellement modélisé (`forcesBrandingWatermark`, `allowsCustomWatermark`).

### 3.4 Ce qu'il ne faut pas faire

- **GitHub Sponsors comme stratégie.** C'est un pourboire, pas un revenu. À garder comme bouton, pas comme plan.
- **Vendre des templates ou des thèmes.** Trivialement copiables dans un dépôt MIT.
- **Un tier « pro » qui déverrouille des fonctionnalités purement client.** Contournable, et surtout : cela punit exactement les gens qui font vivre le projet.
- **Relicencier en AGPL par réflexe défensif.** L'AGPL bloque l'usage interne en entreprise (donc le tier Team, la cible la plus lucrative) et n'arrête pas un concurrent sérieux. Garder MIT.

### 3.5 Grille tarifaire proposée

À valider par des conversations utilisateurs, pas par déduction.

| | Free | Pro (~12 €/mois) | Team (~10 €/siège/mois, 3 sièges min) |
|---|---|---|---|
| Studio local, export local | illimité | illimité | illimité |
| Exports hébergés | aucun | illimités (fair use), 4K | illimités, file prioritaire |
| Watermark personnalisé | non | oui | oui |
| Brand kit, presets partagés | non | non | oui |
| Workspaces partagés | non | non | oui |
| GitHub App PR vers vidéo | non | non | oui |

Le paywall structurel du domaine team est déjà décidé : **le tier gratuit donne un siège**. Le second siège est l'acte d'achat.

Le tier gratuit ne donne aucun export hébergé, et c'est volontaire. Un quota gratuit de rendus contredirait la règle de la section 3.2, coûterait du CPU réel dès le premier abus, et `Plan.free()` encode déjà `allowsCloudExport: false`. L'essai sans engagement passe par la démo publique de la phase 1, pas par un compteur à surveiller.

### 3.6 Séquence

L'ordre compte plus que le contenu.

1. **Distribution d'abord.** Mettre la landing en ligne, publier la démo, aller chercher les cent premiers utilisateurs. Construire un tunnel de paiement avant d'avoir des utilisateurs, c'est installer une caisse enregistreuse dans un magasin vide.
2. **Auth ensuite.** Rien n'est facturable sans identité.
3. **Entitlements réels**, en remplaçant le header `x-typelapse-plan` par une vérification serveur.
4. **Stripe réel**, avec webhook signé.
5. **Quotas et file de rendu.**
6. **GitHub App**, une fois seulement que les cinq points précédents tiennent.

---

## 4. La contrainte Remotion, risque structurant

Remotion n'est pas MIT. Sa licence est gratuite pour les individus et les entreprises de trois personnes ou moins ; au-delà, elle exige une Company License, et le rendu cloud demande des seats dédiés (Cloud Rendering Units).

Deux conséquences directes, aucune n'est théorique.

**Sur le service hébergé.** Opérer un rendu Remotion commercial demande de vérifier notre propre éligibilité auprès de Remotion. Tant que le projet est porté par une personne seule, la licence gratuite s'applique vraisemblablement, mais le rendu cloud a ses propres règles. **Action obligatoire avant d'encaisser le premier euro : écrire à Remotion pour faire confirmer par écrit le cas d'usage exact.** Ce n'est pas une question technique et elle ne se tranche pas en lisant la documentation.

**Sur les utilisateurs qui auto-hébergent.** Une entreprise de quatre personnes ou plus qui installe Typelapse a besoin de sa propre licence Remotion. Ce n'est pas notre problème juridique, mais c'est notre problème d'honnêteté : le README doit le dire clairement. C'est aussi, incidemment, un argument commercial pour l'offre hébergée.

**Option de repli à garder ouverte.** Un chemin d'export navigateur via WebCodecs supprimerait la dépendance Remotion pour le tier local. Ce n'est pas à faire maintenant, mais toute décision d'architecture doit garder l'export derrière `ExporterPort` pour que ce repli reste possible sans réécriture.

---

## 5. Ubiquitous language, extension auth et facturation

Le langage existant (Snippet, Step, Theme, RenderConfig, Plan, Organization, Member, Workspace, Role) est conservé. Ajouts :

| Terme | Définition métier |
|---|---|
| **Account** | Identité authentifiable. Un humain qui se connecte. Distinct de `Member`, qui est son rôle dans une organisation. |
| **Session** | Preuve d'authentification vérifiable côté serveur, avec une expiration. |
| **Subscription** | Lien entre une `Organization` et un `Plan`, avec l'état renvoyé par le fournisseur de paiement. |
| **Entitlement** | Réponse à « ce compte a-t-il le droit de faire cette action maintenant ? ». Dérivé de `Subscription` et `Plan`, jamais lu depuis le client. |
| **Quota** | Compteur consommable sur une période (exports hébergés par mois). Distinct d'un entitlement, qui est booléen. |
| **RenderJob** | Demande de rendu hébergé, avec un état et un propriétaire. |

Distinction à tenir : `Account` est qui vous êtes, `Member` est ce que vous êtes dans une organisation, `Entitlement` est ce que vous avez le droit de faire. Les confondre est la première source de bugs d'autorisation.

---

## 6. Architecture de l'authentification

### 6.1 Décision

Better-auth entre comme **adapter**, derrière un port du domaine. Le domaine ne connaît pas better-auth ; il connaît `AuthPort`.

```
src/domain/ports/auth.port.ts          AuthPort, Account, Session (types purs)
src/domain/entities/account.ts         entité Account, immuable
src/infrastructure/auth/
  better-auth.adapter.ts               implémente AuthPort
  better-auth.config.ts                schéma, providers, cookies
server/routes/auth.ts                  monte le handler better-auth
server/middleware/require-session.ts   traduit une requête en Session ou 401
```

### 6.2 Règles

- `AuthPort` expose au minimum : `verifySession(token)`, `accountFromSession(session)`. Il n'expose ni « login », ni « signup » : ce sont des préoccupations de l'adapter et de son handler HTTP, pas du domaine.
- Aucun type better-auth ne franchit la frontière de `src/infrastructure`. La CI le vérifie déjà pour le domaine et l'application.
- Le middleware serveur ne fait pas d'autorisation, seulement de l'authentification. L'autorisation reste dans `Role.can()`, qui existe et est testé.
- L'entitlement de rendu hébergé devient : session valide, puis organisation, puis subscription, puis `Plan`. Le header `x-typelapse-plan` disparaît complètement.

### 6.3 Ce qui doit tomber

`server/routes/cloud.ts` accepte aujourd'hui n'importe quelle requête portant `x-typelapse-plan: pro`. Cette ligne est la première à supprimer une fois l'auth en place, et le test d'acceptation de la phase 2 est précisément : *une requête avec ce header et sans session reçoit un 401*.

---

## 7. Plan par phases

### Phase 1 — Distribution (avant tout le reste)

Objectif : avoir des utilisateurs à qui vendre quelque chose.

Livrables : landing déployée sur un domaine, démo publique fonctionnelle, README qui dit la contrainte de licence Remotion, une première publication publique (Show HN, Product Hunt ou équivalent).

Critères de sortie : le site est en ligne, la démo tourne pour un visiteur qui n'installe rien, et il existe au moins un canal de retour utilisateur.

### Phase 2 — Authentification

Objectif : savoir qui est qui.

Livrables : `AuthPort`, adapter better-auth, persistance, routes serveur, middleware de session, UI de connexion, branchement du domaine team existant (`Organization`, `Member`) sur des comptes réels.

Critères de sortie : un compte peut se créer, se connecter, se déconnecter ; une route protégée renvoie 401 sans session ; le header `x-typelapse-plan` n'existe plus nulle part ; la fitness function d'architecture reste verte.

### Phase 3 — Facturation réelle

Objectif : encaisser.

Livrables : Stripe Checkout réel, webhook à signature vérifiée, entité `Subscription`, réconciliation d'état, portail client.

Critères de sortie : un paiement de test fait passer **une organisation** de free à pro de bout en bout ; un webhook non signé est rejeté ; une résiliation la redescend. L'abonnement porte sur l'organisation, jamais sur le compte : c'est ce que dit le modèle de la section 5, et c'est ce qui rend le comptage de sièges possible. **Bloqué tant que la question de licence Remotion (section 4) n'a pas de réponse écrite.**

### Phase 4 — Rendu hébergé réel

Objectif : livrer ce qui est vendu.

Livrables : file de rendu, workers Remotion, stockage objet, URLs signées, quotas mensuels, états de job réels.

Critères de sortie : un utilisateur pro lance un rendu depuis le navigateur sans serveur local et récupère un MP4 ; un utilisateur free dépassant son quota reçoit un message actionnable, pas une erreur brute.

### Phase 5 — GitHub App, PR vers vidéo

Objectif : atteindre le budget d'équipe.

Livrables : GitHub App, webhook de pull request, génération automatique du walkthrough, commentaire avec la vidéo, réglages par dépôt.

Critères de sortie : ouvrir une PR sur un dépôt connecté produit un commentaire vidéo sans intervention humaine.

---

## 8. Definition of Done

Une tranche est terminée quand, et seulement quand :

1. les tests d'acceptation de la tranche passent ;
2. `pnpm lint`, `pnpm check-types`, `pnpm typecheck:server`, `pnpm test` et `pnpm build` sont verts en CI ;
3. la fitness function d'architecture est verte ;
4. aucun secret n'est présent dans le dépôt ;
5. les erreurs d'infrastructure sont traduites en messages métier actionnables, sans stack trace ni message fournisseur brut exposé ;
6. pour toute surface UI : clavier, contraste, reduced motion et responsive vérifiés ;
7. la documentation utilisateur reflète le comportement réel, y compris ce qui reste un stub.

---

## 9. Risques et réponses

| Risque | Gravité | Réponse |
|---|---|---|
| Licence Remotion incompatible avec un service commercial | **bloquant** | confirmation écrite de Remotion avant la phase 3 ; garder l'export derrière `ExporterPort` pour préserver le repli WebCodecs |
| Aucun utilisateur au moment du lancement du paiement | élevé | phase 1 avant tout le reste, non négociable |
| Le coût de rendu dépasse le prix de l'abonnement | élevé | quotas dès la phase 4, mesure du coût par minute rendue avant d'annoncer un prix |
| Un concurrent reprend le dépôt MIT | faible | la valeur est dans la distribution et l'intégration GitHub, pas dans le code ; ne pas surréagir par la licence |
| Fuite d'autorisation entre organisations | élevé | l'entitlement se calcule uniquement côté serveur ; test d'acceptation d'isolation inter-organisations |
| Le domaine team reste non branché et pourrit | moyen | phase 2 le branche sur des comptes réels, sinon le supprimer plutôt que le laisser mentir |

---

## 10. Décisions réversibles et irréversibles

**Difficiles à inverser, verrouillées maintenant**

- licence MIT du studio et du moteur ;
- l'invariant WYSIWYG : un seul moteur pour la preview et le rendu ;
- `Plan.local()` illimité, à perpétuité ;
- l'architecture hexagonale et la règle de dépendance, désormais vérifiées par la CI.

**Réversibles, derrière un port ou un flag**

- better-auth comme fournisseur d'authentification (derrière `AuthPort`) ;
- Stripe comme fournisseur de paiement (derrière `BillingPort`) ;
- Remotion comme moteur de rendu (derrière `ExporterPort` et `RendererPort`) ;
- la grille tarifaire et les seuils de quota ;
- l'hébergeur du service de rendu.

---

## 11. Prochain pas concret

La phase 1 reste la priorité produit, et rien de ce qui suit ne la remplace.

Une exception, et une seule : `POST /api/cloud/render` accorde aujourd'hui un rendu hébergé à quiconque envoie l'en-tête `x-typelapse-plan: pro`. C'est un défaut de sécurité présent en production, pas une fonctionnalité manquante, et un défaut de sécurité ne se planifie pas derrière une phase de distribution. La fermeture de cette faille se fait donc immédiatement, en empruntant les fondations de la phase 2, sans que cela ne réordonne le plan.

Le test d'acceptation qui guide la tranche :

> Une requête `POST /api/cloud/render` portant `x-typelapse-plan: pro` mais aucune session valide reçoit un 401.

Ce test échouait au moment de la rédaction : la route répondait 202.

Une fois la faille fermée, l'ordre de la section 3.6 reprend : distribution, puis le reste de la phase 2.
