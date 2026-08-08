# ChaTask

一款基于 Electron + Vue 3 的桌面任务管理应用，支持桌面便签、截图识别创建任务、联系人管理、重复提醒等功能。

## 功能特性

- **多视图任务管理**：列表、看板、四象限、日历、时间轴等多种任务视图
- **桌面便签**：支持普通便签和时间轴便签，可贴边隐藏、折叠、置顶
- **截图识别**：通过快捷键截图，利用 OCR / YOLO 自动识别任务内容、发送者和日期
- **联系人管理**：维护联系人信息，自动匹配截图中的发送者
- **提醒系统**：支持单次提醒、重复提醒、延时提醒和弹窗提醒
- **主题切换**：浅色 / 深色 / 跟随系统
- **系统托盘**：最小化到托盘，支持全局快捷键
- **开机自启动**：可设置随系统启动

## 技术栈

- [Electron](https://www.electronjs.org/) - 跨平台桌面应用框架
- [Vue 3](https://vuejs.org/) - 前端框架
- [Vite](https://vitejs.dev/) / [electron-vite](https://electron-vite.org/) - 构建工具
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) - 本地 SQLite 数据库
- [ONNX Runtime](https://onnxruntime.ai/) - 本地模型推理
- [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) / Tesseract - OCR 文字识别

## 开发环境

- Node.js 18+
- Windows 10/11（当前主要支持平台）

## 安装与运行

```bash
# 克隆仓库
git clone https://github.com/py-th/chaTask.git
cd chaTask

# 安装依赖
npm install

# 开发模式
npm run dev
```

## 构建打包

```bash
# Windows 安装包
npm run build:win

# macOS 安装包（需 macOS 环境）
npm run build:mac

# Linux 安装包
npm run build:linux
```

打包输出目录为 `release/${version}`。

## 项目结构

```
chaTask/
├── build/                  # 应用图标资源
├── public/
│   ├── models/             # ONNX 模型文件
│   ├── native/             # 原生 C++ 工具源码与编译产物
│   └── resource/           # 图片、音频等静态资源
├── scripts/                # 构建辅助脚本
├── src/
│   ├── database/           # SQLite 数据库与数据仓库
│   ├── main/               # Electron 主进程
│   │   ├── ipc/            # IPC 通信处理
│   │   ├── menus/          # 原生菜单
│   │   ├── services/       # 业务服务
│   │   ├── templates/      # 窗口 HTML 模板
│   │   ├── utils/          # 工具函数
│   │   └── windows/        # 窗口管理
│   ├── preload/            # 预加载脚本
│   ├── renderer/           # 渲染进程（Vue 前端）
│   └── shared/             # 主/渲染进程共享代码
├── .gitignore
├── electron-builder.json5  # 打包配置
├── electron.vite.config.js # Vite 配置
└── package.json
```

## 原生工具编译

`public/native/` 目录下的 `win_api_tool.exe` 由 C++ 源码编译生成。若源码有更新，可按 `public/native/编译命令.txt` 中的命令重新编译。

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl + Alt + S` | 截图识别创建任务 |
| `Ctrl + Shift + A` | 显示/激活主窗口 |

快捷键可在设置中自定义。

## 许可证

ISC
