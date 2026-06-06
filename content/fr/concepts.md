---
kicker: Guide en langage clair
description: Les mots derrière Wikigit — wiki, git, commit, dépôt, CDN, pull request, Worker — expliqués sans jargon.
protection: maintainer
translationKey: concepts
tags:
  - Aide
  - Référence
hatnote: Vous voulez la version technique ? Voir Comment ça marche.
banner:
  kind: info
  text: Cette page ne suppose aucune connaissance technique. Chaque terme y est expliqué.
infobox:
  Type: Glossaire
  Public: Tout le monde
  Jargon: expliqué, pas supposé
---

# Concepts expliqués

Wikigit emprunte quelques outils aux noms techniques. Vous n'avez **pas** besoin
de les connaître pour lire ou éditer — mais si vous êtes curieux, voici chacun
expliqué simplement.

## Un wiki

Un **wiki** est un site web que ses propres lecteurs peuvent modifier. Au lieu
d'un auteur unique, beaucoup de personnes améliorent les mêmes pages au fil du
temps. L'exemple le plus connu est [[w:Wikipédia|Wikipédia]]. Wikigit est un
logiciel pour faire tourner votre propre wiki.

## git

**Git** est un outil qui retient chaque version d'un ensemble de fichiers.
Voyez-le comme un « annuler » illimité et partagé : à chaque changement, git
note *qui* a modifié, *quand*, et *exactement quoi* — sans jamais jeter les
anciennes versions. C'est ce qui sert d'historique des pages.

## un commit

Un **commit** est une modification enregistrée — un instantané des fichiers à un
moment donné, accompagné d'une courte note (le « résumé »). Chaque publication
dans Wikigit devient un commit, identifié par une empreinte unique.

## un dépôt

Un **dépôt** est le dossier de fichiers que git suit, stocké en ligne pour que
tout le monde partage la même copie. Wikigit garde le sien sur
[[w:GitHub|GitHub]]. Ici, le dépôt *est* la base de données : chaque page est un
simple fichier texte.

## un CDN

Un **CDN** (réseau de diffusion de contenu) est un réseau mondial de serveurs qui
gardent des copies des fichiers près des lecteurs, pour un chargement rapide
partout. Wikigit lit chaque page depuis un CDN gratuit — d'où la rapidité et
l'absence de reconstruction.

## une pull request

Une **pull request** est une modification *proposée* qui attend une approbation
avant d'intégrer les pages partagées. C'est ainsi que sont relues les
modifications des contributeurs nouveaux ou peu connus ; les modifications de
confiance sautent cette étape.

## le Worker

Un **Worker** est un petit programme qui s'exécute à la demande sur les serveurs
de Cloudflare, sans machine à gérer. Wikigit en utilise un seul : son unique rôle
est d'enregistrer le texte que vous tapez sous forme de commit, car votre
navigateur ne peut pas le faire directement en sécurité.

## Qui êtes-vous quand vous éditez

Vous ne créez pas de compte, mais chaque modification est attribuée : soit
**anonymement** sous un surnom comme `anon-3f9a2c` (créé à partir de votre
adresse réseau par un brouillage *à sens unique* — impossible de remonter à
l'adresse), soit **sous votre identité GitHub** si vous vous connectez. Aucune
information personnelle n'est stockée.

## Voir aussi

- [[demarrer|Démarrer]] — faites votre première modification.
- [[fonctionnement|Comment ça marche]] — les mêmes idées, version technique.
