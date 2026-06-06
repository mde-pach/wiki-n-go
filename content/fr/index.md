---
hatnote: Page d'accueil du projet Wikigit. Nouveau ? Commencez par Démarrer.
description: Wikigit est un wiki collaboratif qui s'affiche sans reconstruction et s'édite sur le site — sans compte ni jeton.
kicker: Accueil du projet
protection: auto
translationKey: index
tags:
  - Référence
  - Logiciel de wiki
infobox:
  Type: Logiciel de wiki
  Lecture: depuis un CDN, sans reconstruction
  Édition: sur le site, sans compte
  Backend: un seul Worker Cloudflare
  Stockage: un dépôt GitHub
  Licence:
    v: MIT (logiciel)
    mono: true
banner:
  kind: info
  text: Ceci est une démonstration vivante — chaque page est un fichier Markdown dans un dépôt GitHub, et chacun peut l'éditer.
---

# Bienvenue sur Wikigit

**Wikigit** est un [[w:Wiki|wiki]] collaboratif fondé sur une idée simple :
laisser [[w:Git|git]] et [[w:GitHub|GitHub]] servir de base de données, et faire
de ce site la seule interface. Les pages s'affichent instantanément sans jamais
reconstruire le site, et chacun peut éditer une page **directement sur le site** —
sans compte ni jeton, à la manière de [[w:Wikipédia|Wikipédia]].

Tout ce que vous lisez est un fichier Markdown dans un dépôt GitHub public.
Quand ce fichier change, cette page change — sans étape de publication ni
reconstruction à attendre.

## L'idée centrale

Un wiki classique fait tourner un serveur, une base de données et son propre
éditeur. Wikigit n'en fait presque rien. Il **compose des systèmes qui existent
déjà** :

- **git** conserve chaque version de chaque page (l'historique).
- **GitHub** stocke les fichiers et héberge les discussions.
- **Un [[concepts|CDN]] gratuit** distribue les pages dans le monde entier.
- **Un petit [[concepts|Worker]]** transforme « quelqu'un a tapé une
  modification » en un changement enregistré.

Le résultat : un wiki complet — lecture, édition, historique, discussions,
modération — avec [[fonctionnement|presque aucune infrastructure à gérer]].

## Par où commencer

| Vous voulez… | Allez à |
|---|---|
| Lire et éditer votre première page | [[demarrer|Démarrer]] |
| Comprendre les rouages | [[fonctionnement|Comment ça marche]] |
| Apprendre le vocabulaire en clair | [[concepts|Concepts expliqués]] |

## Essayez tout de suite

Cliquez sur **Éditer** en haut de cette page. Vous verrez le Markdown qui l'a
produite, avec un aperçu en direct à côté du texte. Changez un mot, écrivez un
court résumé, et publiez — votre modification devient un commit dans le dépôt, et
la page se met à jour **sans reconstruction**.

## Voir aussi

- [[demarrer|Démarrer]] — faites votre première modification.
- [[fonctionnement|Comment ça marche]] — l'architecture en une page.
- [[concepts|Concepts expliqués]] — le vocabulaire, sans jargon.
