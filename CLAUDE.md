# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal website for securit.se — a single-page terminal emulator that simulates a Unix shell experience. Pure static HTML/CSS/JavaScript with no build system. The only code dependency is Babylon.js (+ its glTF loaders plugin), loaded from the jsdelivr CDN by `deerhunt.html` (version-pinned with SRI integrity hashes — recompute the hashes when bumping the version). `assets/` holds 3D models used by the game — CC0 by Quaternius plus two CC-BY 3.0 by Google Poly, all sourced in `assets/LICENSE.txt` (keep the CC-BY attribution when touching credits); the deploy pipeline copies the whole directory.

## Development

There is no build step. Edit `index.html` directly and open it in a browser to test. The site consists of `index.html` and `404.html` (identical copies — after editing `index.html`, run `cp index.html 404.html`), the X11 app pages (`garden-clock.html`, `floppy.html`, `deerhunt.html`), and a `CNAME` file for the custom domain.

## Deployment

Push to `main` triggers GitHub Actions (`.github/workflows/pipeline.yaml`) which copies the HTML files and `CNAME` into `_site/` and deploys to GitHub Pages. No build tools are invoked — files are served as-is. New standalone pages must be added to the `cp` list in the workflow.

## Architecture

Everything lives in `index.html` (~3200 lines of inline JS). The terminal emulates BusyBox v1.37.0 (`busybox ash`):

- **CSS** is in an inline `<style>` block (dark terminal theme, X11 windows, vi overlay)
- **Filesystem**: `buildBaseFS()` defines the read-only factory image (`/bin`, `/etc`, `/proc`, `/home/guest`, ...). All mutations go through `writeFile`/`mkdirNode`/`removeNode`/`moveNode`, which record changed paths in an `overlay` object persisted to `localStorage` (`securit.fs.v1`) — the browser is the disk, so `vi`, `cp`, `rm`, `>` redirects etc. survive reloads. `fsreset -f` restores the factory image. Command history persists too (`securit.hist.v1`). Guest may only write under `$HOME` and `/tmp`.
- **Shell**: `tokenize`/`parseTokens`/`runPipeline` implement quoting (`'`, `"`, `\`), `$VAR`/`$?` expansion, tilde, globs, pipes, `;`/`&&`/`||`/`&`, and redirections (`>`, `>>`, `<`, `2>`, `2>&1`). Applets receive a `ctx` ({args, stdin, out/println, err/error, tty}) and return an exit code; `defineApplets({...})` registers them (they also appear as `/bin/<name>` links). Shell builtins (`cd`, `export`, `help`, `fsreset`, ...) live in `builtins`.
- **Interactive applets** (`vi`, `sl`, `sleep`, `yes`) take over the screen/keyboard when run standalone at the prompt; `INTERACTIVE` lists them and `runInteractive` launches them with a continuation so `vi f && echo done` works. `vi` is a modal editor (`launchVi`) supporting the common normal/insert/ex commands; `:w` writes through the persistent overlay.
- **Terminal UI**: `addLine` parses basic ANSI SGR color codes (used by `ls`/`grep` at the tty), command history (arrow keys), tab completion, Ctrl+C/Ctrl+L handling, blinking cursor

When adding a new command, add an applet via `defineApplets` (or a builtin if it must mutate shell state). New base files/directories go in `buildBaseFS()` — remember directory `children` arrays.

**Testing**: no framework in-repo, but the inline script is plain ES5-ish JS; it can be extracted (`sed -n '/^<script>$/,/^<\/script>$/p' index.html`) and run under Node with a small DOM stub to smoke-test shell behavior.

**X11 apps**: entries in `/usr/bin` with `xapp: true` open a separate HTML page (`src`) inside a draggable Motif-style window in an iframe. Optional `winW`/`winH` set the default window size. `clock` → `garden-clock.html`, `floppy` → `floppy.html`, `deerhunt` → `deerhunt.html` (a stylized arcade 3D hunting game built on Babylon.js; time of day, season and weather follow the real clock).
