# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal website for securit.se — a single-page terminal emulator that simulates a Unix shell experience. Pure static HTML/CSS/JavaScript with no build system. The only code dependency is Babylon.js (+ its glTF loaders plugin), loaded from the jsdelivr CDN by `deerhunt.html` (version-pinned with SRI integrity hashes — recompute the hashes when bumping the version). `assets/` holds CC0 3D models by Quaternius used by the game (sources listed in `assets/LICENSE.txt`); the deploy pipeline copies the whole directory.

## Development

There is no build step. Edit `index.html` directly and open it in a browser to test. The site consists of `index.html` and `404.html` (identical copies — after editing `index.html`, run `cp index.html 404.html`), the X11 app pages (`garden-clock.html`, `floppy.html`, `deerhunt.html`), and a `CNAME` file for the custom domain.

## Deployment

Push to `main` triggers GitHub Actions (`.github/workflows/pipeline.yaml`) which copies the HTML files and `CNAME` into `_site/` and deploys to GitHub Pages. No build tools are invoked — files are served as-is. New standalone pages must be added to the `cp` list in the workflow.

## Architecture

Everything lives in `index.html` (~444 lines):

- **CSS** is in an inline `<style>` block (dark terminal theme)
- **JavaScript** is in an inline `<script>` block containing:
  - A virtual filesystem object (~line 34) defining directories and files under `/home/guest/`
  - Command implementations (`ls`, `cat`, `cd`, `pwd`, `whoami`, `echo`, `date`, `history`, `help`, etc.)
  - A deny list for destructive commands (`rm`, `mv`, `cp`, `mkdir`, `touch`, etc.)
  - Terminal UI logic: command history (arrow keys), tab completion, Ctrl+C/Ctrl+L handling, blinking cursor

When adding new commands, add them to the command handler switch/if-chain in the JavaScript. When adding new files or directories, update the virtual filesystem object.

**X11 apps**: entries in `/usr/bin` with `xapp: true` open a separate HTML page (`src`) inside a draggable Motif-style window in an iframe. Optional `winW`/`winH` set the default window size. `clock` → `garden-clock.html`, `floppy` → `floppy.html`, `deerhunt` → `deerhunt.html` (a stylized arcade 3D hunting game built on Babylon.js; time of day, season and weather follow the real clock).
