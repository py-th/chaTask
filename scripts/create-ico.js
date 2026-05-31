const fs = require('fs');
const path = require('path');

const sizes = [16, 32, 48, 128, 256];
const pngFiles = sizes.map(s => `build/icon_${s}.png`);

const images = pngFiles.map(f => {
  const buf = fs.readFileSync(f);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { buf, width, height };
});

const numImages = images.length;
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(numImages, 4);

let offset = 6 + numImages * 16;
const dirEntries = [];
const imageData = [];

for (const img of images) {
  const entry = Buffer.alloc(16);
  const w = img.width >= 256 ? 0 : img.width;
  const h = img.height >= 256 ? 0 : img.height;
  entry.writeUInt8(w, 0);
  entry.writeUInt8(h, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(img.buf.length, 8);
  entry.writeUInt32LE(offset, 12);
  dirEntries.push(entry);
  imageData.push(img.buf);
  offset += img.buf.length;
}

const icoData = Buffer.concat([header, ...dirEntries, ...imageData]);
fs.writeFileSync('build/icon.ico', icoData);
console.log('Created build/icon.ico successfully!');
