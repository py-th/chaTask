/**
 * electron-builder afterPack 钩子：用纯 JS 的 resedit 替换主程序 exe 的图标。
 * 不需要管理员权限，也不依赖 winCodeSign/7za。
 */
const fs = require('fs');
const path = require('path');
const ResEdit = require('resedit');

module.exports = async (context) => {
  // 仅处理 Windows 包
  if (context.electronPlatformName !== 'win32') {
    return;
  }

  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  const exePath = path.join(context.appOutDir, exeName);
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
