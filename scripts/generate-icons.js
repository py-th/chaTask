/**
 * 根据 build/icon.ico 自动生成 macOS 所需的 build/icon.icns。
 * 仅在 Windows/Linux 开发机上准备 mac 打包资源时使用。
 */
const fs = require('fs');
const path = require('path');
const { parseIco, compileIcns } = require('icor');

const icoPath = path.join(__dirname, '..', 'build', 'icon.ico');
const icnsPath = path.join(__dirname, '..', 'build', 'icon.icns');

if (!fs.existsSync(icoPath)) {
  console.error(`[generate-icons] 找不到 ${icoPath}`);
  process.exit(1);
}

const parsed = parseIco(fs.readFileSync(icoPath));
const images = parsed.images.map((img) => ({
  size: img.width,
  data: img.data
}));

if (images.length === 0) {
  console.error('[generate-icons] icon.ico 中未解析到任何图像');
  process.exit(1);
}

const icns = compileIcns(images);
fs.writeFileSync(icnsPath, icns);
console.log(`[generate-icons] 已生成 ${icnsPath}，包含 ${images.length} 个尺寸`);
