'use strict';

// Reader for the DOS Lemmings container format (DMA Design / Psygnosis).
//
// A .DAT file is a sequence of independently compressed sections. Each section
// starts with a 10-byte header:
//
//   0     bits used in the first byte of the compressed stream
//   1     checksum (XOR of every compressed byte)
//   2-3   unused
//   4-5   decompressed size, big-endian
//   6-7   unused
//   8-9   compressed size including this header, big-endian
//
// The payload is a bit stream that is decoded *backwards* - last byte first,
// least significant bit first - writing the output buffer back to front. Every
// opcode either copies literal bytes out of the stream or repeats a run that
// was already written (to its right, since we are moving leftwards).

function readSections(buf) {
  const out = [];
  let p = 0;
  while (p + 10 <= buf.length) {
    const bitsInFirstByte = buf[p];
    const checksum = buf[p + 1];
    const decompressedSize = buf.readUInt16BE(p + 4);
    const compressedSize = buf.readUInt16BE(p + 8);
    if (compressedSize < 10 || p + compressedSize > buf.length) break;
    out.push({
      offset: p,
      bitsInFirstByte,
      checksum,
      decompressedSize,
      data: buf.slice(p + 10, p + compressedSize)
    });
    p += compressedSize;
  }
  if (p !== buf.length) {
    throw new Error('section walk ended at ' + p + ' of ' + buf.length);
  }
  return out;
}

function decompress(section) {
  const src = section.data;
  const out = Buffer.alloc(section.decompressedSize);
  let outPos = out.length;

  let pos = src.length - 1;
  let bitBuf = src[pos];
  let bitCount = section.bitsInFirstByte;

  function getBit() {
    if (bitCount === 0) {
      pos--;
      if (pos < 0) throw new Error('bit stream underrun');
      bitBuf = src[pos];
      bitCount = 8;
    }
    const bit = bitBuf & 1;
    bitBuf >>= 1;
    bitCount--;
    return bit;
  }

  function getBits(n) {
    let v = 0;
    for (let i = 0; i < n; i++) v = (v << 1) | getBit();
    return v;
  }

  function copyLiteral(n) {
    for (let i = 0; i < n; i++) {
      if (outPos <= 0) throw new Error('output overrun (literal)');
      out[--outPos] = getBits(8);
    }
  }

  function copyRun(n, offset) {
    for (let i = 0; i < n; i++) {
      if (outPos <= 0) throw new Error('output overrun (run)');
      out[outPos - 1] = out[outPos - 1 + offset];
      outPos--;
    }
  }

  while (outPos > 0) {
    if (getBit()) {
      switch (getBits(2)) {
        case 0: copyRun(3, getBits(9) + 1); break;
        case 1: copyRun(4, getBits(10) + 1); break;
        case 2: copyRun(getBits(8) + 1, getBits(12) + 1); break;
        case 3: copyLiteral(getBits(8) + 9); break;
      }
    } else if (getBit()) {
      copyRun(2, getBits(8) + 1);
    } else {
      copyLiteral(getBits(3) + 1);
    }
  }
  return out;
}

function readDat(buf) {
  return readSections(buf).map(decompress);
}

module.exports = { readSections, decompress, readDat };
