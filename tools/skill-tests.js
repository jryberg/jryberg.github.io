#!/usr/bin/env node
'use strict';

// Behavioural tests for the Lemmings skill physics.
//
//   node tools/skill-tests.js [--verbose]
//
// Runs lemmings.html's script under a DOM stub, builds synthetic worlds and
// steps individual lemmings, asserting what the terrain and the lemming do.
// This exists because structural checks (does the level load, does it have an
// exit) pass happily while behaviour is wrong - two real defects shipped past
// them: every lemming spawning from one hatch on multi-entrance levels, and a
// bomber crater too shallow to break a thin floor.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ── DOM stub ─────────────────────────────────────────────────────────────────
function makeContext2D() {
  const noop = () => {};
  return new Proxy({
    canvas: null,
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    measureText: () => ({ width: 0 })
  }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return noop;                       // every drawing call is a no-op
    },
    set(target, prop, value) { target[prop] = value; return true; }
  });
}

function makeCanvas() {
  const c = { width: 0, height: 0, style: {}, addEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 480 }) };
  c.getContext = () => makeContext2D();
  return c;
}

function makeSandbox() {
  const store = {};
  const win = {
    innerWidth: 1280, innerHeight: 800,
    addEventListener() {}, removeEventListener() {},
    devicePixelRatio: 1
    // deliberately no `fetch` here: the audio loader is gated on window.fetch,
    // so leaving it undefined keeps sound out of the tests
  };
  const sandbox = {
    window: win,
    document: {
      getElementById: () => makeCanvas(),
      createElement: (tag) => (tag === 'canvas' ? makeCanvas() : { style: {}, addEventListener() {} }),
      addEventListener() {}
    },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    },
    Image: function () { this.width = 0; this.height = 0; },
    performance: { now: () => 0 },
    requestAnimationFrame: () => 0,
    // the catalogue fetch resolves to nothing; tests build their own worlds
    fetch: () => Promise.reject(new Error('no network in tests')),
    console
  };
  sandbox.window.document = sandbox.document;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  return sandbox;
}

function loadGame() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'lemmings.html'), 'utf8');
  const m = html.match(/<script>\n([\s\S]*?)\n<\/script>/);
  if (!m) throw new Error('could not find the game script in lemmings.html');
  const sandbox = makeSandbox();
  vm.createContext(sandbox);
  vm.runInContext(m[1], sandbox, { filename: 'lemmings.html' });
  const T = sandbox.window.__lemmingsTest;
  if (!T) throw new Error('lemmings.html did not expose window.__lemmingsTest');
  return T;
}

// ── assertions ───────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const verbose = process.argv.includes('--verbose');
const failures = [];

function check(name, got, want, note) {
  const ok = String(got) === String(want);
  if (ok) { passed++; if (verbose) console.log('  ok   ' + name + '  (' + got + ')'); }
  else { failed++; failures.push({ name, got, want, note }); console.log('  FAIL ' + name + ': got ' + got + ', want ' + want + (note ? '  [' + note + ']' : '')); }
}
function section(title) { console.log('\n' + title); }

// world helpers
const flat = (groundY) => (x, y) => (y >= groundY ? 1 : 0);
const T = loadGame();

// Lemmings spawn falling, exactly as they drop from a hatch, and the game
// refuses work skills to anything airborne. Tests therefore have to let one
// land before assigning - the first version of this harness did not, and every
// skill test failed for that reason alone.
//
// Spawn clear of the ground rather than on it: a lemming created exactly on the
// surface row is pushed 1px into the terrain by the faller's step-then-test
// order, which is not a state normal play ever produces.
const SPAWN_HEIGHT = 8;
function drop(x, groundY, dir) {
  const l = T.lem(x, groundY - SPAWN_HEIGHT, dir);
  for (let i = 0; i < 40 && l.state !== 'walk'; i++) T.step(l, 1);
  return l;
}

// ── walking ──────────────────────────────────────────────────────────────────
section('walker');
{
  T.world(200, 160, flat(100));
  const l = drop(50, 100, 1);
  T.step(l, 10);
  check('walks 1px per tick', Math.round(l.x) - 50, 10);
  check('stays on the surface', Math.round(l.y), 100);
  check('stays walking', l.state, 'walk');
}
{
  // a 3px step up: the original walker hops rises of 1-6px
  T.world(200, 160, (x, y) => (x >= 80 ? (y >= 97 ? 1 : 0) : (y >= 100 ? 1 : 0)));
  const l = drop(60, 100, 1);
  T.step(l, 30);
  check('steps up a 3px rise', Math.round(l.y), 97);
  check('keeps going right', Math.round(l.x) > 80, true);
}
{
  // a 10px wall is too tall to climb without the skill: turn around
  T.world(200, 160, (x, y) => (x >= 80 && x < 90 ? (y >= 90 ? 1 : 0) : (y >= 100 ? 1 : 0)));
  const l = drop(60, 100, 1);
  T.step(l, 40);
  check('turns at a tall wall', l.dir, -1);
}
{
  // ground stops at x=80: walking off the edge starts a fall
  T.world(200, 160, (x, y) => (x < 80 && y >= 100 ? 1 : 0));
  const l = drop(60, 100, 1);
  T.step(l, 40);
  check('falls off a ledge', l.state, 'fall');
}

// ── falling ──────────────────────────────────────────────────────────────────
section('faller / floater');
{
  T.world(200, 160, flat(150));
  const l = T.lem(50, 40, 1);
  l.state = 'fall'; l.stateT = 0; l.fallFrom = 40;
  T.step(l, 5);
  check('falls 2px per tick', Math.round(l.y) - 40, 10);
}
{
  // 100px of fall is well past the 65px fatal distance
  T.world(200, 160, flat(150));
  const l = T.lem(50, 40, 1);
  l.state = 'fall'; l.stateT = 0; l.fallFrom = 40;
  T.step(l, 120);
  check('a long fall is fatal', l.state, 'splat');
  check('and the lemming is dead', l.dead, true);
}
{
  T.world(200, 160, flat(150));
  const l = T.lem(50, 40, 1);
  T.assign(l, 1);                       // floater
  l.state = 'fall'; l.stateT = 0; l.fallFrom = 40;
  T.step(l, 200);
  check('a floater survives the same fall', l.dead, false);
  check('and lands walking', l.state, 'walk');
}
{
  // the chute opens after 16px of freefall, then descent slows to 1px/tick
  T.world(200, 160, () => 0);
  const l = T.lem(50, 10, 1);
  T.assign(l, 1);
  l.state = 'fall'; l.stateT = 0; l.fallFrom = 10;
  T.step(l, 8);
  check('freefalls 16px before the chute', Math.round(l.y) - 10, 16);
  const atOpen = Math.round(l.y);
  T.step(l, 4);
  check('hangs while the chute opens', Math.round(l.y) - atOpen, 0);
  const afterOpen = Math.round(l.y);
  T.step(l, 10);
  check('then sails at 1px per tick', Math.round(l.y) - afterOpen, 10);
}

// ── climber ──────────────────────────────────────────────────────────────────
section('climber');
{
  // a 40px wall with open air above it
  T.world(200, 160, (x, y) => (x >= 80 ? (y >= 60 ? 1 : 0) : (y >= 100 ? 1 : 0)));
  const l = drop(60, 100, 1);
  T.assign(l, 0);                       // climber
  T.step(l, 20);
  check('starts climbing the wall', l.state === 'climb' || l.state === 'ledge', true);
  T.step(l, 80);
  check('ends up on top of the wall', Math.round(l.y) <= 62, true, 'y=' + Math.round(l.y));
  check('and is walking again', l.state, 'walk');
}

// ── blocker ──────────────────────────────────────────────────────────────────
section('blocker');
{
  T.world(200, 160, flat(100));
  const b = drop(100, 100, 1);
  T.assign(b, 3);                       // blocker
  const w = drop(90, 100, 1);
  T.step(b, 1);
  for (let i = 0; i < 12; i++) { T.step(w, 1); T.step(b, 1); }
  check('blocker holds position', Math.round(b.x), 100);
  check('and turns an oncoming walker', w.dir, -1);
}

// ── builder ──────────────────────────────────────────────────────────────────
section('builder');
{
  T.world(300, 160, flat(100));
  const l = drop(50, 100, 1);
  T.assign(l, 4);                       // builder
  const startX = Math.round(l.x), startY = Math.round(l.y);
  T.step(l, 16 * 13);
  check('lays at most 12 bricks', T.bricks().length, 12);
  check('each brick steps 2px along', Math.round(l.x) - startX, 24);
  check('and 1px up', startY - Math.round(l.y), 12);
  check('then shrugs (out of bricks)', l.state === 'nosteps' || l.state === 'walk', true);
}

// ── diggers ──────────────────────────────────────────────────────────────────
section('digger (vertical)');
{
  T.world(200, 160, flat(100));
  const l = drop(50, 100, 1);
  T.assign(l, 7);                       // digger
  T.step(l, 40);
  check('digs downward', Math.round(l.y) > 100, true, 'y=' + Math.round(l.y));
  check('clears the shaft above it', T.solidAt(50, 102), false);
}

section('basher (horizontal)');
{
  // a thick wall, with the lemming already up against it - the bash window
  // reaches 8px ahead, so a basher started further back just walks over and
  // turns around at a wall it cannot climb
  T.world(300, 160, (x, y) => (y >= 100 ? 1 : (x >= 60 && x < 120 ? 1 : 0)));
  const l = drop(58, 100, 1);
  T.assign(l, 5);                       // basher
  const startX = Math.round(l.x);
  T.step(l, 60);
  check('advances into the wall', Math.round(l.x) > startX, true, 'x=' + Math.round(l.x));
  check('and clears terrain ahead', T.solidAt(62, 94), false);
}
{
  // nothing to bash: revert to walking immediately, carving nothing
  T.world(200, 160, flat(100));
  const l = drop(50, 100, 1);
  T.assign(l, 5);
  T.step(l, 1);
  check('refuses to bash open air', l.state, 'walk');
}

section('miner (diagonal)');
{
  T.world(300, 160, (x, y) => (y >= 100 ? 1 : 0));
  const l = drop(50, 100, 1);
  T.assign(l, 6);                       // miner
  T.step(l, 60);
  check('moves along', Math.round(l.x) > 50, true, 'x=' + Math.round(l.x));
  check('and downward', Math.round(l.y) > 100, true, 'y=' + Math.round(l.y));
}

// ── bomber ───────────────────────────────────────────────────────────────────
section('bomber');
{
  T.world(200, 160, (x, y) => (y >= 60 ? 1 : 0));
  const l = T.lem(100, 100, 1);
  T.explode(l);
  // the reference mask: 16 wide x 22 tall anchored at the sprite's top-left
  let wrong = 0, cleared = 0;
  for (let j = 0; j < 22; j++) {
    const off = j >= 15 ? Math.max(j - 17, 0) : 15 - 2 * j;
    for (let i = 0; i < 16; i++) {
      const inMask = i >= off && i < 16 - off;
      const x = 100 - 8 + i, y = 100 - 16 + j;
      if (y < 60) continue;                       // was empty before the blast
      const isSolid = T.solidAt(x, y);
      if (inMask) { if (isSolid) wrong++; else cleared++; }
      else if (!isSolid) wrong++;
    }
  }
  check('crater matches the reference mask exactly', wrong, 0);
  check('and actually removed terrain', cleared > 100, true, cleared + ' px');
}
{
  // the real-world case: one bomber must break a thin floor clean through
  T.world(200, 160, (x, y) => (y >= 100 && y < 103 ? 1 : 0));
  const l = T.lem(100, 100, 1);
  T.explode(l);
  let holeCols = 0;
  for (let x = 96; x < 104; x++) {
    let blocked = false;
    for (let y = 100; y < 103; y++) if (T.solidAt(x, y)) blocked = true;
    if (!blocked) holeCols++;
  }
  check('one bomber breaks a 3px floor', holeCols, 8);
}

// ── steel ────────────────────────────────────────────────────────────────────
section('steel is indestructible');
{
  const steelFloor = (x, y) => (y >= 100 ? 3 : 0);
  const cases = [
    ['digger', 7, 40],
    ['basher', 5, 60],
    ['miner', 6, 60]
  ];
  for (const [name, skill, ticks] of cases) {
    T.world(200, 160, steelFloor);
    const l = drop(50, 100, 1);
    T.assign(l, skill);
    T.step(l, ticks);
    let removed = 0;
    for (let y = 100; y < 120; y++) for (let x = 30; x < 90; x++) if (!T.solidAt(x, y)) removed++;
    check(name + ' cannot cut steel', removed, 0);
  }
  T.world(200, 160, steelFloor);
  const b = T.lem(100, 100, 1);
  T.explode(b);
  let removed = 0;
  for (let y = 100; y < 120; y++) for (let x = 80; x < 120; x++) if (!T.solidAt(x, y)) removed++;
  check('bomber cannot cut steel', removed, 0);
}

// ── summary ──────────────────────────────────────────────────────────────────
console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) {
  console.log('\nfailures:');
  failures.forEach((f) => console.log('  ' + f.name + ': got ' + f.got + ', want ' + f.want));
}
process.exit(failed ? 1 : 0);
