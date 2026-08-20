/**
 * 手动打包辅助脚本：把主进程运行所需的源码模块复制到 electron-vite 构建输出目录。
 * 该脚本只使用 Node 内置 fs/path，不依赖 PowerShell，方便在 Windows 命令行手动执行。
 */
const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..')
const outRoot = path.join(projectRoot, 'out')

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

/**
 * 递归复制目录或文件
 * @param {string} src 源路径
 * @param {string} dest 目标路径
 * @param {(srcPath: string) => boolean} [filter] 返回 false 则跳过该条目
 */
function copy(src, dest, filter) {
  if (filter && !filter(src)) {
    return
  }
  const stat = fs.statSync(src)
  if (stat.isDirectory()) {
    ensureDir(dest)
    for (const entry of fs.readdirSync(src)) {
      copy(path.join(src, entry), path.join(dest, entry), filter)
    }
  } else {
    ensureDir(path.dirname(dest))
    fs.copyFileSync(src, dest)
  }
}

// 1. 复制主进程子模块（除了入口 index.js，它由 electron-vite 生成）
const mainSrc = path.join(projectRoot, 'src', 'main')
const mainOut = path.join(outRoot, 'main')
ensureDir(mainOut)
copy(mainSrc, mainOut, (srcPath) => {
  // 跳过源码入口，保留 electron-vite 生成的 out/main/index.js
  if (path.basename(srcPath) === 'index.js' && path.dirname(srcPath) === mainSrc) {
    return false
  }
  return true
})

// 2. 复制数据库层与共享模块（主进程通过相对路径引用）
copy(path.join(projectRoot, 'src', 'database'), path.join(outRoot, 'database'))
copy(path.join(projectRoot, 'src', 'shared'), path.join(outRoot, 'shared'))

// 3. 预留运行时临时目录
ensureDir(path.join(outRoot, 'temp'))

console.log('[copy-main-files] 主进程依赖模块已复制到 out/ 目录')
