import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createPNG(width, height, getPixel) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth 8
  ihdr.writeUInt8(6, 9); // color type RGBA (6)
  ihdr.writeUInt8(0, 10); // compression method 0
  ihdr.writeUInt8(0, 11); // filter method 0
  ihdr.writeUInt8(0, 12); // interlace method 0
  const ihdrChunk = makeChunk('IHDR', ihdr);

  // Raw image data with 0-filter byte before each scanline
  const rowStride = width * 4 + 1;
  const rawData = Buffer.alloc(rowStride * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowStride;
    rawData[rowOffset] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x, y, width, height);
      const pixelOffset = rowOffset + 1 + x * 4;
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const compressedData = zlib.deflateSync(rawData, { level: 9 });
  const idatChunk = makeChunk('IDAT', compressedData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const length = data.length;
  const chunk = Buffer.alloc(12 + length);
  chunk.writeUInt32BE(length, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);

  const crc = crc32(chunk.subarray(4, 8 + length));
  chunk.writeUInt32BE(crc >>> 0, 8 + length);
  return chunk;
}

// CRC32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Color logic
function brandPixel(x, y, w, h, isMaskable = false) {
  const nx = (x / w) * 2 - 1;
  const ny = (y / h) * 2 - 1;
  const dist = Math.sqrt(nx * nx + ny * ny);

  // Background deep teal gradient
  const grad = (y / h);
  let r = Math.round(15 * (1 - grad) + 7 * grad);
  let g = Math.round(107 * (1 - grad) + 64 * grad);
  let b = Math.round(101 * (1 - grad) + 61 * grad);
  let a = 255;

  // Maskable doesn't round the corners, standard icon has rounded corners
  if (!isMaskable) {
    // Rounded rect check
    const cornerRadius = 0.22;
    const qx = Math.max(0, Math.abs(nx) - (1 - cornerRadius));
    const qy = Math.max(0, Math.abs(ny) - (1 - cornerRadius));
    const cornerDist = Math.sqrt(qx * qx + qy * qy);
    if (cornerDist > cornerRadius) {
      return [0, 0, 0, 0];
    }
  }

  // Draw central card/wallet emblem
  const inCardX = nx >= -0.52 && nx <= 0.52;
  const inCardY = ny >= -0.48 && ny <= 0.52;
  if (inCardX && inCardY) {
    // Card header
    if (ny < -0.28) {
      r = 15; g = 107; b = 101;
    } else {
      r = 255; g = 255; b = 255; // Card white body
    }

    // Split Gold circle emblem in center
    const circleDist = Math.sqrt(nx * nx + (ny - 0.05) * (ny - 0.05));
    if (circleDist < 0.20) {
      r = 245; g = 158; b = 11; // Gold accent #F59E0B
    }

    // 3 traveler dots at bottom
    const d1 = Math.sqrt((nx + 0.28) * (nx + 0.28) + (ny - 0.36) * (ny - 0.36));
    const d2 = Math.sqrt(nx * nx + (ny - 0.36) * (ny - 0.36));
    const d3 = Math.sqrt((nx - 0.28) * (nx - 0.28) + (ny - 0.36) * (ny - 0.36));
    if (d1 < 0.07) { r = 227; g = 154; b = 45; } // amber
    if (d2 < 0.07) { r = 45; g = 212; b = 191; } // teal
    if (d3 < 0.07) { r = 248; g = 113; b = 113; } // coral
  }

  // Top right green online/sync indicator dot
  const syncDist = Math.sqrt((nx - 0.52) * (nx - 0.52) + (ny + 0.52) * (ny + 0.52));
  if (syncDist < 0.13) {
    r = 45; g = 212; b = 191;
  }

  return [r, g, b, a];
}

const outDir = path.resolve('public');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// 1. Generate 192x192
const png192 = createPNG(192, 192, (x, y, w, h) => brandPixel(x, y, w, h, false));
fs.writeFileSync(path.join(outDir, 'pwa-192x192.png'), png192);

// 2. Generate 512x512
const png512 = createPNG(512, 512, (x, y, w, h) => brandPixel(x, y, w, h, false));
fs.writeFileSync(path.join(outDir, 'pwa-512x512.png'), png512);

// 3. Generate 512x512 maskable
const pngMaskable512 = createPNG(512, 512, (x, y, w, h) => brandPixel(x, y, w, h, true));
fs.writeFileSync(path.join(outDir, 'pwa-maskable-512x512.png'), pngMaskable512);

// 4. Generate apple-touch-icon (180x180)
const appleIcon = createPNG(180, 180, (x, y, w, h) => brandPixel(x, y, w, h, false));
fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), appleIcon);

// 5. Generate favicon (32x32)
const favicon = createPNG(32, 32, (x, y, w, h) => brandPixel(x, y, w, h, false));
fs.writeFileSync(path.join(outDir, 'favicon.ico'), favicon);

console.log('✅ Generated PWA icons in /public successfully!');
