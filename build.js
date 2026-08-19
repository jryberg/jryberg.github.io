#!/usr/bin/env node
'use strict';

// Zero-dependency build: concatenate src/ snippets (in order) into index.html
// and 404.html (identical copies). The snippets are raw fragments of the single
// IIFE that is the whole terminal emulator; concatenation keeps its closure
// scope intact. Run `node build.js` to regenerate, `node build.js --verify`
// to fail if the committed files have drifted from the snippets, or
// `node build.js --stdout` to print the generated document.

const fs = require('fs');
const path = require('path');

const OUT_DIR = 'src';
const MANIFEST = [
  'head.html',
  'core.js',
  'shell-tokenize.js',
  'shell-expand.js',
  'shell-parse.js',
  'shell-exec.js',
  'shell-builtins.js',
  'applets-fs.js',
  'applets-text.js',
  'awk.js',
  'applets-system.js',
  'network.js',
  'ssh.js',
  'interactive.js',
  'vi.js',
  'foot.html',
];

const TARGETS = ['index.html', '404.html'];

function build() {
  return MANIFEST
    .map((f) => fs.readFileSync(path.join(OUT_DIR, f), 'utf8'))
    .join('');
}

const mode = process.argv[2];

if (mode === '--stdout') {
  process.stdout.write(build());
} else if (mode === '--verify') {
  let ok = true;
  for (const t of TARGETS) {
    const expected = fs.readFileSync(t, 'utf8');
    if (build() !== expected) {
      console.error('build.js: ' + t + ' is out of date with src/ — run `node build.js`');
      ok = false;
    }
  }
  if (!ok) process.exit(1);
  console.log('build.js: index.html and 404.html are up to date');
} else {
  const out = build();
  for (const t of TARGETS) {
    fs.writeFileSync(t, out);
    console.log('build.js: wrote ' + t);
  }
}
