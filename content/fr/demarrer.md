---
kicker: Guide
description: Comment lire, éditer et créer des pages dans Wikigit — et comment déployer votre propre copie.
protection: auto
translationKey: getting-started
tags:
  - Guides
hatnote: Pour l'architecture derrière ces étapes, voir Comment ça marche.
infobox:
  Type: Guide pratique
  Public: Lecteurs et éditeurs débutants
  Compte requis: Non
---

# Démarrer

Cette page présente les trois gestes essentiels de Wikigit : **lire** une page,
en **éditer** une, et en **créer** une nouvelle. Rien de tout cela ne demande de
compte.

## Lire

Lire, c'est simplement naviguer. Chaque page est récupérée depuis un
[[concepts|CDN]] et affichée dans votre navigateur, donc les pages se chargent
vite et sont toujours à jour. En lisant, remarquez :

- La **table des matières** sur le côté, construite automatiquement.
- Les **liens internes** comme [[concepts|Concepts expliqués]]. Un lien en
  **rouge** mène à une page qui n'existe pas encore.
- Les **liens interwiki** comme [[w:Wikipédia|Wikipédia]] qui sortent vers
  Wikipédia.
- L'onglet **Discussion**, où les lecteurs échangent sur la page.

## Éditer

1. Cliquez sur **Éditer** en haut d'une page (ou sur le petit lien **edit** à
   côté d'un titre de section).
2. Tapez en [[w:Markdown|Markdown]]. Un **aperçu en direct** s'affiche à côté du
   texte.
3. Écrivez un court **résumé** de votre modification.
4. Cliquez sur **Publier**.

Votre brouillon est conservé sur votre appareil pendant que vous tapez. Ce qui
se passe après la publication dépend de la page et de la confiance acquise — voir
[[fonctionnement|Comment ça marche]]. En bref : les modifications de confiance
sur les pages ouvertes sont publiées immédiatement ; les autres passent par une
relecture rapide.

## Créer une page

Deux moyens simples : **suivre un lien rouge** vers une page inexistante, ou
utiliser l'**assistant de création** qui prend un titre, prévisualise l'adresse
et propose un modèle de départ. La nouvelle page existe dès l'enregistrement,
sans reconstruction.

## Qui êtes-vous quand vous éditez

Vous ne vous connectez pas, mais chaque modification est **signée** :

- **Anonymement par défaut** — sous un pseudonyme stable comme `anon-3f9a2c`,
  dérivé de votre adresse réseau par un hachage à sens unique. L'adresse brute
  n'est jamais stockée.
- **Sous votre identité, en option** — en vous connectant avec GitHub, vos
  modifications vous sont créditées.

## Pour aller plus loin

- [[concepts|Concepts expliqués]] — le vocabulaire, sans jargon.
- [[fonctionnement|Comment ça marche]] — l'architecture en une page.
