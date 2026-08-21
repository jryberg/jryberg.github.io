#!/usr/bin/env node
'use strict';

// Convert an original DOS Lemmings install into the assets this game loads.
//
//   node tools/lemmings-extract.js <path-to-dos-lemmings> [--out assets/lemmings]
//
// Writes, for each of the 120 levels:
//   levels/<key>/map.png    1584x160 terrain, composited from the tileset
//   levels/<key>/mask.png   alpha = solid terrain, red = indestructible steel
// plus levels.json (every level's parameters) and one object sheet per tileset.
//
// Everything is read from the caller's own copy of the game. tools/level-order.json
// supplies only the play order - which stored record each of the 120 slots uses,
// and whether its parameters come from that record or from its oddtable variant.

const fs = require('fs');
const path = require('path');
const { readSections, decompress } = require('./lemmings-dat.js');
const { parseGround, loadTileset, writePNG, decodeSpecial } = require('./lemmings-gfx.js');

const LEVEL_W = 1584;
const LEVEL_H = 160;
const RANKS = ['Fun', 'Tricky', 'Taxing', 'Mayhem'];
const OBJ_EXIT = 0;
const OBJ_ENTRANCE = 1;
// the 960-wide special-level image sits at this x in the 1584-wide world -
// it spans every special level's entrance and exit exactly
const SPECIAL_X = 304;
// object trigger effects
const FX = { NONE: 0, EXIT: 1, TRAP: 4, DROWN: 5, VAPORISE: 6, ONEWAY_LEFT: 7, ONEWAY_RIGHT: 8 };

// ── level record (2048 bytes) ────────────────────────────────────────────────
// 0x00 release rate, lemmings, to save, minutes, then 8 skill counts,
// 0x18 start camera x, 0x1A graphics set, 0x1C extended set,
// 0x20 32 objects x8, 0x120 400 terrain x4, 0x760 32 steel x4, 0x7E0 name.
function parseRecord(d) {
  const u = (o) => d.readUInt16BE(o);
  const rec = {
    release: u(0), lem: u(2), save: u(4), minutes: u(6),
    skills: [8, 10, 12, 14, 16, 18, 20, 22].map(u),
    camX: u(0x18), gs: u(0x1A), extendedGs: u(0x1C),
    name: d.slice(0x7e0, 0x800).toString('latin1').trim(),
    objects: [], terrain: [], steel: []
  };
  for (let i = 0; i < 32; i++) {
    const o = 0x20 + i * 8;
    const x = d.readInt16BE(o), y = d.readInt16BE(o + 2);
    const id = u(o + 4), flags = u(o + 6);
    if (!x && !y && !id && !flags) continue;
    rec.objects.push({ id, x, y, noOverwrite: !!(flags & 0x8000), onlyOnTerrain: !!(flags & 0x4000) });
  }
  for (let i = 0; i < 400; i++) {
    const o = 0x120 + i * 4;
    const b0 = d[o], b1 = d[o + 1], b2 = d[o + 2], b3 = d[o + 3];
    if (b0 === 255 && b1 === 255 && b2 === 255 && b3 === 255) break;
    let y = (b2 << 1) | (b3 >> 7);
    if (y >= 256) y -= 512;
    rec.terrain.push({
      x: (((b0 & 0x0f) << 8) | b1) - 16,
      y: y - 4,
      id: b3 & 0x3f,
      noOverwrite: !!(b0 & 0x80),
      upsideDown: !!(b0 & 0x20),
      erase: !!(b0 & 0x10)
    });
  }
  for (let i = 0; i < 32; i++) {
    const o = 0x760 + i * 4;
    const b0 = d[o], b1 = d[o + 1], b2 = d[o + 2];
    if (!b0 && !b1 && !b2) continue;
    // x shares the terrain list's -16 origin (confirmed: it puts 94% of steel
    // pixels on solid terrain, versus 77% without the offset)
    rec.steel.push({
      x: (((b0 << 1) | (b1 >> 7)) * 4) - 16,
      y: (b1 & 0x7f) * 4,
      w: ((b2 >> 4) + 1) * 4,
      h: ((b2 & 0x0f) + 1) * 4
    });
  }
  return rec;
}

// oddtable.dat: 80 entries x 56 bytes = the same 24-byte parameter header a
// level record starts with, plus its own 32-byte name.
function parseOddTable(buf) {
  const out = [];
  for (let i = 0; i < 80; i++) {
    const o = i * 56, u = (x) => buf.readUInt16BE(o + x);
    const name = buf.slice(o + 24, o + 56).toString('latin1').trim();
    out.push(name === 'This is a non-used duplicate' ? null : {
      release: u(0), lem: u(2), save: u(4), minutes: u(6),
      skills: [8, 10, 12, 14, 16, 18, 20, 22].map(u), name
    });
  }
  return out;
}

// ── terrain compositing ──────────────────────────────────────────────────────
function buildTerrain(rec, tileset, special) {
  const rgba = Buffer.alloc(LEVEL_W * LEVEL_H * 4);
  const solid = new Uint8Array(LEVEL_W * LEVEL_H);
  // the four "special" levels replace composited terrain with one full-screen
  // painting; colour index 0 in that image is transparent, everything else solid
  if (special) {
    for (let y = 0; y < Math.min(LEVEL_H, special.h); y++) {
      for (let x = 0; x < special.w; x++) {
        const dx = SPECIAL_X + x;
        if (dx < 0 || dx >= LEVEL_W) continue;
        const s = (y * special.w + x) * 4, d = (y * LEVEL_W + dx) * 4;
        if (!special.rgba[s + 3]) continue;
        rgba[d] = special.rgba[s]; rgba[d + 1] = special.rgba[s + 1];
        rgba[d + 2] = special.rgba[s + 2]; rgba[d + 3] = 255;
        solid[y * LEVEL_W + dx] = 1;
      }
    }
  }
  for (const t of special ? [] : rec.terrain) {
    const piece = tileset.terrain[t.id];
    if (!piece) continue;
    for (let py = 0; py < piece.h; py++) {
      const sy = t.upsideDown ? piece.h - 1 - py : py;
      const dy = t.y + py;
      if (dy < 0 || dy >= LEVEL_H) continue;
      for (let px = 0; px < piece.w; px++) {
        const si = (sy * piece.w + px) * 4;
        if (piece.rgba[si + 3] === 0) continue;
        const dx = t.x + px;
        if (dx < 0 || dx >= LEVEL_W) continue;
        const di = dy * LEVEL_W + dx;
        if (t.erase) { solid[di] = 0; rgba[di * 4 + 3] = 0; continue; }
        if (t.noOverwrite && solid[di]) continue;
        rgba[di * 4] = piece.rgba[si];
        rgba[di * 4 + 1] = piece.rgba[si + 1];
        rgba[di * 4 + 2] = piece.rgba[si + 2];
        rgba[di * 4 + 3] = 255;
        solid[di] = 1;
      }
    }
  }
  // mask.png: alpha carries solidity, red carries steel
  const mask = Buffer.alloc(LEVEL_W * LEVEL_H * 4);
  for (let i = 0; i < LEVEL_W * LEVEL_H; i++) mask[i * 4 + 3] = solid[i] ? 255 : 0;
  for (const s of rec.steel) {
    for (let y = Math.max(0, s.y); y < Math.min(LEVEL_H, s.y + s.h); y++) {
      for (let x = Math.max(0, s.x); x < Math.min(LEVEL_W, s.x + s.w); x++) {
        mask[(y * LEVEL_W + x) * 4] = 255;
      }
    }
  }
  return { rgba, mask, solid };
}

// ── object sheets: every animation frame of every object, laid out in a row ──
function buildObjectSheet(tileset) {
  const objs = tileset.objects.filter(Boolean);
  const cellW = Math.max(1, ...objs.map((o) => o.w));
  const cellH = Math.max(1, ...objs.map((o) => o.h));
  const cols = Math.max(1, ...objs.map((o) => o.frames.length));
  const sheetW = cellW * cols, sheetH = cellH * objs.length;
  const rgba = Buffer.alloc(sheetW * sheetH * 4);
  const meta = [];
  objs.forEach((o, row) => {
    meta.push({
      id: o.meta.index, w: o.w, h: o.h, frames: o.frames.length,
      firstFrame: o.meta.firstFrame || 0,
      row, cellW, cellH,
      trigger: o.meta.trigger
    });
    o.frames.forEach((fr, col) => {
      for (let y = 0; y < o.h; y++) {
        const src = y * o.w * 4;
        const dst = ((row * cellH + y) * sheetW + col * cellW) * 4;
        fr.copy(rgba, dst, src, src + o.w * 4);
      }
    });
  });
  return { rgba, w: sheetW, h: sheetH, meta };
}

function main() {
  const src = process.argv[2];
  if (!src) {
    console.error('usage: node tools/lemmings-extract.js <path-to-dos-lemmings> [--out dir]');
    process.exit(1);
  }
  const oi = process.argv.indexOf('--out');
  const outDir = oi > 0 ? process.argv[oi + 1] : path.join('assets', 'lemmings');
  const file = (n) => path.join(src, n);

  const order = JSON.parse(fs.readFileSync(path.join(__dirname, 'level-order.json'), 'utf8')).order;
  const odd = parseOddTable(fs.readFileSync(file('oddtable.dat')));

  const records = [];
  for (let f = 0; f < 10; f++) {
    for (const s of readSections(fs.readFileSync(file('level00' + f + '.dat')))) {
      records.push(parseRecord(decompress(s)));
    }
  }
  console.log('read ' + records.length + ' level records, ' + odd.filter(Boolean).length + ' odd variants');

  // vgaspec0-3.dat, indexed by the level record's extendedGs field (1-4)
  const specials = {};
  for (let i = 0; i < 4; i++) {
    const f = file('vgaspec' + i + '.dat');
    if (fs.existsSync(f)) specials[i + 1] = decodeSpecial(fs.readFileSync(f));
  }

  const grounds = [], tilesets = [];
  for (let g = 0; g < 5; g++) {
    grounds[g] = parseGround(fs.readFileSync(file('ground' + g + 'o.dat')));
    tilesets[g] = loadTileset(fs.readFileSync(file('vgagr' + g + '.dat')), grounds[g]);
  }

  fs.mkdirSync(path.join(outDir, 'tilesets'), { recursive: true });
  const tilesetMeta = [];
  tilesets.forEach((ts, g) => {
    const sheet = buildObjectSheet(ts);
    fs.writeFileSync(path.join(outDir, 'tilesets', g + '-objects.png'), writePNG(sheet.w, sheet.h, sheet.rgba));
    tilesetMeta.push({ set: g, sheet: g + '-objects.png', w: sheet.w, h: sheet.h, objects: sheet.meta });
  });

  const levels = [];
  let bytes = 0, skippedSpecial = 0;
  for (const rank of RANKS) {
    order[rank].forEach(([recIdx, useOdd], i) => {
      const rec = records[recIdx];
      const params = useOdd ? odd[recIdx] : rec;
      const key = rank.toLowerCase() + String(i + 1).padStart(2, '0');
      const dir = path.join(outDir, 'levels', key);
      fs.mkdirSync(dir, { recursive: true });

      if (rec.extendedGs) skippedSpecial++;
      const { rgba, mask } = buildTerrain(rec, tilesets[rec.gs], specials[rec.extendedGs]);
      const mapPng = writePNG(LEVEL_W, LEVEL_H, rgba);
      const maskPng = writePNG(LEVEL_W, LEVEL_H, mask);
      fs.writeFileSync(path.join(dir, 'map.png'), mapPng);
      fs.writeFileSync(path.join(dir, 'mask.png'), maskPng);
      bytes += mapPng.length + maskPng.length;

      const dims = (id) => {
        const m = tilesetMeta[rec.gs].objects.find((o) => o.id === id);
        return m ? { w: m.w, h: m.h } : { w: 48, h: 25 };
      };
      const entD = dims(OBJ_ENTRANCE), exitD = dims(OBJ_EXIT);
      const entrances = rec.objects.filter((o) => o.id === OBJ_ENTRANCE);
      const exit = rec.objects.find((o) => o.id === OBJ_EXIT);
      levels.push({
        key, rank, num: i + 1, name: params.name,
        lem: params.lem, save: params.save,
        time: params.minutes * 60, release: params.release,
        skills: params.skills,
        gs: rec.gs, special: rec.extendedGs || 0,
        camX: rec.camX,
        entrances: entrances.map((o) => ({ x: o.x, y: o.y, w: entD.w, h: entD.h })),
        exit: exit ? { x: exit.x, y: exit.y, w: exitD.w, h: exitD.h } : null,
        objects: rec.objects.map((o) => ({ id: o.id, x: o.x, y: o.y, noOverwrite: o.noOverwrite, onlyOnTerrain: o.onlyOnTerrain })),
        steel: rec.steel
      });
    });
  }

  fs.writeFileSync(path.join(outDir, 'levels.json'), JSON.stringify({ tilesets: tilesetMeta, levels }, null, 1));
  console.log('wrote ' + levels.length + ' levels to ' + outDir);
  console.log('  map/mask PNGs: ' + (bytes / 1048576).toFixed(1) + ' MB');
  console.log('  levels without an exit object: ' + levels.filter((l) => !l.exit).length);
  console.log('  levels using VGASPEC art: ' + skippedSpecial);
}

if (require.main === module) main();
module.exports = { parseRecord, parseOddTable, buildTerrain };
