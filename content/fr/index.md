---
kicker: Concepts
description: Wikigit est un moteur de wiki qui stocke chaque page sous forme de
  fichier Markdown dans un dépôt Git et l'affiche en direct, sans reconstruction.
protection: auto
translationKey: index
tags:
  - Concepts
  - Démarrer
infobox:
  Type: Moteur de wiki
  Pages stockées en: Markdown dans Git
  Dorsale: L'Engine (un serveur Bun)
  Lecture: Servie par un CDN
  Édition: Dans le navigateur
  Identité: Anonyme ou connexion
  Licence:
    v: MIT
    mono: true
banner:
  kind: info
  text: Ce site est un Wikigit qui tourne sur Wikigit — chaque page ici est un
    simple fichier que vous pouvez modifier.
---

# Wikigit

**Wikigit** est un moteur de wiki — un logiciel pour faire tourner un site qu'un groupe écrit ensemble, une page à la fois. Il fonctionne comme [[w:Wikipedia|Wikipédia]] vous a appris à l'attendre : on ouvre une page, on clique sur *Modifier*, on change, on enregistre. Ce qui le distingue tient en dessous : chaque page est un simple fichier [[w:Markdown|Markdown]] conservé dans un dépôt [[w:Git|Git]], et non une ligne dans une base de données.

Cette seule décision règle la plupart des autres. L'historique de la page est celui du dépôt, donc rien n'est jamais vraiment perdu. Le contenu vous appartient, puisqu'il vit dans votre propre compte [[w:GitHub|GitHub]]. Et il n'y a presque rien à faire tourner : la lecture vient d'un CDN, et la seule pièce sur mesure est un petit serveur, l'**Engine**, qui enregistre les modifications.

## Pour commencer

- [[help/create-your-wiki|Créer votre wiki]] — la mise en place, étape par étape *(en anglais)*.
- [[help/editing|Modifier des pages]] — écrire et publier une modification *(en anglais)*.
- [[reference/faq|Questions fréquentes]] *(en anglais)*.

*Cette page existe aussi en anglais — utilisez le sélecteur de langue en haut pour basculer. La documentation complète est pour l'instant en anglais.*
