# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal website for securit.se — a single-page terminal emulator that simulates a Unix shell experience. Pure static HTML/CSS/JavaScript with no build system or dependencies.

## Development

There is no build step. Edit `index.html` directly and open it in a browser to test. The site consists of two HTML files (`index.html` and `404.html`, which are identical copies) and a `CNAME` file for the custom domain.

## Deployment

Push to `main` triggers GitHub Actions (`.github/workflows/pipeline.yaml`) which copies `index.html`, `404.html`, and `CNAME` into `_site/` and deploys to GitHub Pages. No build tools are invoked — files are served as-is.

## Architecture

Everything lives in `index.html` (~444 lines):

- **CSS** is in an inline `<style>` block (dark terminal theme)
- **JavaScript** is in an inline `<script>` block containing:
  - A virtual filesystem object (~line 34) defining directories and files under `/home/guest/`
  - Command implementations (`ls`, `cat`, `cd`, `pwd`, `whoami`, `echo`, `date`, `history`, `help`, etc.)
  - A deny list for destructive commands (`rm`, `mv`, `cp`, `mkdir`, `touch`, etc.)
  - Terminal UI logic: command history (arrow keys), tab completion, Ctrl+C/Ctrl+L handling, blinking cursor

When adding new commands, add them to the command handler switch/if-chain in the JavaScript. When adding new files or directories, update the virtual filesystem object.
