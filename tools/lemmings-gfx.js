'use strict';

// Graphics-set reader for DOS Lemmings.
//
// GROUNDxO.DAT is uncompressed and always 1056 bytes:
//   0    16 object entries   x 28 bytes = 448
//   448  64 terrain entries  x  8 bytes = 512
//   960  palette block                  =  96
//
// VGAGRx.DAT holds two compressed sections: [0] terrain bitmaps, [1] object
// bitmaps. Every image is planar - 3 colour bitplanes (so 8 colours, matching
// the 8-entry palette groups) followed by a 1-bit transparency plane, each
// plane being width*height/8 bytes. The terrain entries' image/mask offsets
// chain exactly, which is what confirms the layout.

const zlib = require('zlib');
const { readSections, decompress } = require('./lemmings-dat.js');

const GROUND_TERRAIN_OFF = 448;
const GROUND_PALETTE_OFF = 960;

function parseGround(buf) {
  if (buf.length !== 1056) throw new Error('unexpected GROUNDxO size ' + buf.length);

  // Object entry layout, decoded and cross-checked against all five tilesets:
  //   3        frame count            2      first animation frame
  //   4, 5     width, height          6-7    per-frame size (planeSize*5)
  //   14-15    trigger x              16-17  trigger y      } in 4-pixel units
  //   18, 19   trigger w, h           20     trigger effect }
  //   21-22    image location (objects are NOT stored in index order)
  // What confirms it: exactly one effect-1 (exit) object per set with its
  // trigger a 4x8 strip at the object's centre-base, water always 64 wide with
  // a trigger spanning all 64, and one-way left/right always a matched pair.
  const objects = [];
  for (let i = 0; i < 16; i++) {
    const o = i * 28;
    const width = buf[o + 4], height = buf[o + 5];
    const frameCount = buf[o + 3];
    const frameSize = buf.readUInt16LE(o + 6);
    // byte 21 (LE) is the image location: it is the only field whose values
    // tile the object section exactly, with no gaps or overlaps
    const imageLoc = buf.readUInt16LE(o + 21);
    objects.push({
      index: i,
      animFlags: buf.readUInt16LE(o),
      startFrame: buf[o + 2],
      frameCount,
      width,
      height,
      frameSize,
      maskOffset: buf.readUInt16LE(o + 8),
      imageLoc,
      firstFrame: buf[o + 2],
      trigger: {
        x: buf.readUInt16LE(o + 14) * 4,
        y: buf.readUInt16LE(o + 16) * 4,
        w: buf[o + 18] * 4,
        h: buf[o + 19] * 4,
        effect: buf[o + 20]
      },
      raw: buf.slice(o, o + 28).toString('hex')
    });
  }

  const terrain = [];
  for (let i = 0; i < 64; i++) {
    const o = GROUND_TERRAIN_OFF + i * 8;
    terrain.push({
      index: i,
      width: buf[o],
      height: buf[o + 1],
      imageLoc: buf.readUInt16LE(o + 2),
      maskLoc: buf.readUInt16LE(o + 4),
      vgaLoc: buf.readUInt16LE(o + 6)
    });
  }

  // 8 EGA custom, 8 EGA standard, 8 EGA preview, then three 8x3 VGA groups
  const p = GROUND_PALETTE_OFF;
  const vga = (base) => {
    const out = [];
    for (let i = 0; i < 8; i++) {
      const o = base + i * 3;
      // 6-bit DAC values scaled to 8 bits
      out.push([(buf[o] << 2) | (buf[o] >> 4),
                (buf[o + 1] << 2) | (buf[o + 1] >> 4),
                (buf[o + 2] << 2) | (buf[o + 2] >> 4)]);
    }
    return out;
  };
  return {
    objects,
    terrain,
    paletteCustom: vga(p + 24),
    paletteStandard: vga(p + 48),
    palettePreview: vga(p + 72)
  };
}

// Decode one planar image: `colourPlanes` bitplanes then a transparency plane.
// Terrain uses 3 colour planes (8 colours); objects use 4 (16 colours). The
// GROUNDxO metadata proves it - for every object, the per-frame size is
// planeSize*5 and the mask sits at planeSize*4.
function decodePlanar(data, offset, width, height, palette, colourPlanes) {
  const planes = colourPlanes || 3;
  const planeSize = (width * height) >> 3;
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const byte = i >> 3, bit = 7 - (i & 7);
    let ci = 0;
    for (let pl = 0; pl < planes; pl++) {
      ci |= ((data[offset + pl * planeSize + byte] >> bit) & 1) << pl;
    }
    const opaque = (data[offset + planes * planeSize + byte] >> bit) & 1;
    const c = palette[ci] || [0, 0, 0];
    rgba[i * 4] = c[0];
    rgba[i * 4 + 1] = c[1];
    rgba[i * 4 + 2] = c[2];
    rgba[i * 4 + 3] = opaque ? 255 : 0;
  }
  return rgba;
}

function loadTileset(vgagrBuf, ground) {
  const secs = readSections(vgagrBuf).map(decompress);
  const terrainData = secs[0];
  const objectData = secs[1];

  const terrain = ground.terrain.map((t) =>
    (t.width && t.height)
      ? { w: t.width, h: t.height, rgba: decodePlanar(terrainData, t.imageLoc, t.width, t.height, ground.paletteCustom) }
      : null);

  // objects are 16-colour: 4 bitplanes then the mask, so one frame spans
  // planeSize*5. Their palette runs the second VGA group first and the
  // terrain group second - checked against the known-good trapdoor art, which
  // only matches in this order.
  const objPalette = ground.paletteStandard.concat(ground.paletteCustom);
  const objects = ground.objects.map((o) => {
    if (!o.width || !o.height) return null;
    const frames = [];
    const planeSize = (o.width * o.height) >> 3;
    const stride = planeSize * 5;
    const count = Math.max(1, o.frameCount || 1);
    for (let f = 0; f < count; f++) {
      const off = o.imageLoc + f * stride;
      if (off + stride > objectData.length) break;
      frames.push(decodePlanar(objectData, off, o.width, o.height, objPalette, 4));
    }
    return { meta: o, w: o.width, h: o.height, frames };
  });

  return { terrain, objects };
}

// ── minimal PNG writer (RGBA, no filtering) ──────────────────────────────────
function writePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      CRC_TABLE[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

// ── VGASPEC: the four "special" levels' full-screen art ─────────────────────
// One DAT section decompresses to a 40-byte header (palette) followed by a
// second RLE layer: 0x80 ends a section, n < 0x80 copies n+1 literal bytes,
// n > 0x80 repeats the next byte 257-n times. That expands to exactly 57600
// bytes for every one of the four files - 4 sections of 960x40 pixels at 3
// bitplanes - which is what confirms the format.
const SPEC_W = 960, SPEC_SECTION_H = 40, SPEC_SECTIONS = 4;

function decodeSpecial(datBuf) {
  const payload = decompress(readSections(datBuf)[0]);

  const palette = [];
  for (let i = 0; i < 8; i++) {
    const o = 8 + i * 3;   // 8 bytes of EGA data, then the 8 VGA entries
    palette.push([(payload[o] << 2) | (payload[o] >> 4),
                  (payload[o + 1] << 2) | (payload[o + 1] >> 4),
                  (payload[o + 2] << 2) | (payload[o + 2] >> 4)]);
  }

  const planes = [];
  let p = 40;
  while (p < payload.length && planes.length < SPEC_SECTIONS * 14400) {
    const n = payload[p++];
    if (n === 0x80) continue;                       // section terminator
    if (n < 0x80) { for (let i = 0; i <= n; i++) planes.push(payload[p++]); }
    else { const c = 257 - n, v = payload[p++]; for (let i = 0; i < c; i++) planes.push(v); }
  }

  const height = SPEC_SECTION_H * SPEC_SECTIONS;
  const rgba = Buffer.alloc(SPEC_W * height * 4);
  const planeSize = (SPEC_W * SPEC_SECTION_H) >> 3;
  for (let sec = 0; sec < SPEC_SECTIONS; sec++) {
    const base = sec * planeSize * 3;
    for (let i = 0; i < SPEC_W * SPEC_SECTION_H; i++) {
      const byte = i >> 3, bit = 7 - (i & 7);
      let ci = 0;
      for (let pl = 0; pl < 3; pl++) ci |= ((planes[base + pl * planeSize + byte] >> bit) & 1) << pl;
      const x = i % SPEC_W, y = sec * SPEC_SECTION_H + (i / SPEC_W) | 0;
      const d = (y * SPEC_W + x) * 4;
      const c = palette[ci];
      rgba[d] = c[0]; rgba[d + 1] = c[1]; rgba[d + 2] = c[2];
      rgba[d + 3] = ci === 0 ? 0 : 255;   // colour 0 is transparent
    }
  }
  return { w: SPEC_W, h: height, rgba };
}

module.exports = { parseGround, loadTileset, decodePlanar, writePNG, decodeSpecial };
