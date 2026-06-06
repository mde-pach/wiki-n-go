---
hatnote: Projektstartseite von Wikigit. Neu hier? Beginnen Sie mit Erste Schritte.
description: Wikigit ist ein kollaboratives Wiki, das ohne Neuerstellung lädt und direkt auf der Seite bearbeitet wird — ohne Konto, ohne Token.
kicker: Projektstartseite
protection: auto
translationKey: index
tags:
  - Referenz
  - Wiki-Software
infobox:
  Typ: Wiki-Software
  Lesen: aus einem CDN, ohne Neuerstellung
  Bearbeiten: auf der Seite, ohne Konto
  Backend: ein einziger Cloudflare-Worker
  Speicher: ein GitHub-Repository
  Lizenz:
    v: MIT (Software)
    mono: true
banner:
  kind: info
  text: Dies ist eine lebendige Demo — jede Seite ist eine Markdown-Datei in einem GitHub-Repository, und jeder kann sie bearbeiten.
---

# Willkommen bei Wikigit

**Wikigit** ist ein kollaboratives [[w:Wiki|Wiki]], das auf einer einfachen Idee
beruht: [[w:Git|Git]] und [[w:GitHub|GitHub]] dienen als Datenbank, und diese
Website ist die einzige Oberfläche. Seiten laden sofort, ohne die Website je neu
zu erstellen, und jeder kann eine Seite **direkt auf der Website** bearbeiten —
ohne Konto und ohne Token, so wie es [[w:Wikipedia|Wikipedia]] vormacht.

Alles, was Sie hier lesen, ist eine Markdown-Datei in einem öffentlichen
GitHub-Repository. Ändert sich diese Datei, ändert sich diese Seite — ohne
Veröffentlichungsschritt und ohne Wartezeit.

## Die Grundidee

Ein klassisches Wiki betreibt einen Server, eine Datenbank und einen eigenen
Editor. Wikigit macht fast nichts davon. Stattdessen **kombiniert es bereits
vorhandene Systeme**:

- **Git** bewahrt jede Version jeder Seite auf (die Versionsgeschichte).
- **GitHub** speichert die Dateien und beherbergt die Diskussionen.
- **Ein kostenloses [[w:Content Delivery Network|CDN]]** liefert die Seiten
  weltweit aus.
- **Ein kleiner Worker** verwandelt „jemand hat eine Änderung getippt" in eine
  gespeicherte Änderung.

Das Ergebnis ist ein vollständiges Wiki — Lesen, Bearbeiten, Verlauf,
Diskussionen, Moderation — mit nahezu keiner zu betreibenden Infrastruktur.

## Wo anfangen

| Sie möchten… | Gehen Sie zu |
|---|---|
| Ihre erste Seite lesen und bearbeiten | [[erste-schritte|Erste Schritte]] |

## Probieren Sie es gleich aus

Klicken Sie oben auf dieser Seite auf **Bearbeiten**. Sie sehen das Markdown, das
diese Seite erzeugt hat, mit einer Live-Vorschau neben dem Text. Ändern Sie ein
Wort, schreiben Sie eine kurze Zusammenfassung und veröffentlichen Sie — Ihre
Änderung wird zu einem Commit im Repository, und die Seite aktualisiert sich
**ohne Neuerstellung**.

## Siehe auch

- [[erste-schritte|Erste Schritte]] — machen Sie Ihre erste Bearbeitung.
