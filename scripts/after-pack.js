/**
 * electron-builder afterPack 钩子：用纯 JS 的 resedit 替换主程序 exe 的图标。
 * 不需要管理员权限，也不依赖 winCodeSign/7za。
 */
const fs = require('fs');
const path = require('path');
const ResEdit = require('resedit');

function removeDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    return true;
  }
  return false;
}

function removeMatchingDirs(root, pattern) {
  if (!fs.existsSync(root)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(root)) {
    if (pattern(entry)) {
      removeDir(path.join(root, entry));
      count++;
    }
  }
  return count;
}

module.exports = async (context) => {
  // 仅处理 Windows 包
  if (context.electronPlatformName !== 'win32') {
    return;
  }

  const appOutDir = context.appOutDir;
  const unpackedNodeModules = path.join(appOutDir, 'resources', 'app.asar.unpacked', 'node_modules');

  // 1. 删除 Electron 自带的多语言文件，只保留中文和英文
  const localesDir = path.join(appOutDir, 'locales');
  if (fs.existsSync(localesDir)) {
    const keep = new Set(['zh-CN.pak', 'en-US.pak']);
    let removed = 0;
    for (const file of fs.readdirSync(localesDir)) {
      if (!keep.has(file)) {
        fs.rmSync(path.join(localesDir, file), { force: true });
        removed++;
      }
    }
    if (removed > 0) {
      console.log(`[after-pack] 已删除 ${removed} 个多余的语言包文件`);
    }
  }

  // 2. 删除 onnxruntime-node 里非 Windows 平台的预编译二进制
  const onnxDirs = [
    path.join(unpackedNodeModules, 'onnxruntime-node', 'bin', 'napi-v6', 'linux'),
    path.join(unpackedNodeModules, 'onnxruntime-node', 'bin', 'napi-v6', 'darwin'),
    path.join(unpackedNodeModules, '@repeato', 'ocr', 'node_modules', 'onnxruntime-node', 'bin', 'napi-v6', 'linux'),
    path.join(unpackedNodeModules, '@repeato', 'ocr', 'node_modules', 'onnxruntime-node', 'bin', 'napi-v6', 'darwin')
  ];
  for (const dir of onnxDirs) {
    if (removeDir(dir)) {
      console.log(`[after-pack] 已删除非 Windows 运行时: ${dir}`);
    }
  }

  // 3. 删除 better-sqlite3 的源码/编译依赖（运行时只需要 build/Release 下的 .node）
  const sqliteDirs = [
    path.join(unpackedNodeModules, 'better-sqlite3', 'deps'),
    path.join(unpackedNodeModules, 'better-sqlite3', 'src')
  ];
  for (const dir of sqliteDirs) {
    if (removeDir(dir)) {
      console.log(`[after-pack] 已删除 better-sqlite3 源码/依赖目录: ${dir}`);
    }
  }

  // 4. 删除 @repeato/ocr 内可能残留的 node_modules（被 overrides 合并后通常不存在，但保险起见）
  const repeatoOnnxDir = path.join(unpackedNodeModules, '@repeato', 'ocr', 'node_modules', 'onnxruntime-node');
  if (removeDir(repeatoOnnxDir)) {
    console.log(`[after-pack] 已删除 @repeato/ocr 内嵌 onnxruntime-node: ${repeatoOnnxDir}`);
  }

  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  const exePath = path.join(appOutDir, exeName);
  const iconPath = path.join(context.packager.projectDir, 'build', 'icon.ico');

  if (!fs.existsSync(iconPath)) {
    console.warn('[after-pack] 找不到 build/icon.ico，跳过 EXE 图标替换');
    return;
  }

  if (!fs.existsSync(exePath)) {
    console.warn(`[after-pack] 找不到 ${exePath}，跳过 EXE 图标替换`);
    return;
  }

  // 读取并解析 exe
  const data = fs.readFileSync(exePath);
  const exe = ResEdit.NtExecutable.from(data, { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(exe);

  // 读取图标文件
  const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(iconPath));

  // 查找现有的图标组并全部替换，确保资源管理器各视图尺寸都使用新图标
  const iconGroups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  if (iconGroups.length === 0) {
    console.warn('[after-pack] EXE 中未找到图标组，跳过替换');
    return;
  }

  for (const group of iconGroups) {
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
      res.entries,
      group.id,
      1033, // en-US
      iconFile.icons.map((icon) => icon.data)
    );
  }

  // 写回 exe
  res.outputResource(exe);
  const newBuffer = Buffer.from(exe.generate());
  fs.writeFileSync(exePath, newBuffer);

  console.log(`[after-pack] 已替换 EXE 图标: ${exePath}`);
};
