# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dice Roller is a static single-page web app (vanilla HTML/CSS/JS, no build tools or dependencies) for rolling tabletop RPG dice. It uses an "Arcane Table" dark theme with gold accents and animated rolls.

## Running

Open `index.html` directly in a browser — no server, bundler, or install step required.

## Architecture

- **index.html** — Minimal shell: toolbar (add die, roll all, total display) and an empty `#dice-container` grid. Die cards are created dynamically by JS.
- **script.js** — All logic in module-level functions (no classes/modules). State is a plain `dice` array of `{ id, faces, value, isRolling }` objects. Key flows:
  - `addDie()` / `removeDie()` — mutate array + render/animate card DOM
  - `rollDie()` / `rollAll()` — interval-based animation with staggered timing
  - `setFaces()` / `showCustomInput()` — change die type (d4–d100 or custom 2–999)
  - `openPopover()` / `closePopover()` — mobile-only popover for die controls (face selector + remove)
  - `setupMobileTouch()` — tap-to-roll + long-press-to-open-popover on each card
  - `isMobile()` — media query check (`max-width: 600px`) for behavior switching
  - Spacebar shortcut rolls all dice (when not focused on inputs)
- **style.css** — CSS custom properties in `:root`, CSS animations for roll/flash/enter/exit. Responsive breakpoints:
  - `768px` — tablet adjustments
  - `600px` — **mobile compact mode**: cards show only die face + label, desktop controls (selector, roll btn, remove btn) are hidden via CSS, toolbar is fixed at bottom, grid uses `minmax(80px, 1fr)`
  - `380px` — extra-small: tighter grid with `minmax(70px, 1fr)`
  - `.die-popover` — positioned above the card, contains face selector + remove button, shown on long press

## Mobile UX

- **Tap** a die = roll it
- **Long press** (400ms) a die = open popover with face selector and remove button
- Tap outside popover closes it
- Toolbar (add, roll all, total) is fixed at screen bottom

## Conventions

- UI strings are in Italian (e.g., "Aggiungi Dado", "Lancia", "Facce...").
- Fonts loaded from Google Fonts: Cinzel Decorative (display) and Crimson Pro (body).
- No framework, no transpilation, no package manager.
- Do not add `Co-Authored-By` trailers to commit messages.
