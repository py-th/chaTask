# ChaTask

一款基于 Electron + Vue 3 + SQLite + ONNX 的桌面任务管理应用，主要特点是截图抓取各种主流 IM 应用的消息生成桌面任务便签，支持普通便签和时间轴便签、支持创建任务、联系人管理、重复提醒等功能。
针对微信、QQ、企业微信、钉钉、飞书等主流IM聊天软件场景开发。解决日常办公、沟通中，想将聊天信息快速提取文字，并将其转成待办任务事项而开发，项目集成轻量化OCR识别和YOLO训练模型智能化提取头像和文本的能力，精准提取纯文本内容，支持实时复制、本地保存、批量识别，跨平台适配Windows/Mac/Linux主流电脑系统。

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
- [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) - OCR 文字识别

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

## 截图识别模型训练

- **环境搭建**：安装 Anaconda + 创建虚拟环境 + 安装 PyTorch + 安装 YOLOv8 库（ultralytics、labelImg、opencv-python）
- **收集并标注数据集**：收集IM各种截图后，打开 LabelImg 对数据集标注，把标注结果存放到指定文件夹里（每张图片会生成一个同名的 `.txt` 文件，里面就是 YOLO 格式的标注信息）
- **整理数据集**：为了让 YOLO 能识别你的数据集，必须按照特定的文件夹结构来组织。请严格遵循以下结构：

```bash
my_dataset/                # 项目根目录，名字任意
├── images/                # 存放所有图片
│   ├── train/             # 训练用图片
│   └── val/               # 验证用图片
└── labels/                # 存放所有标注 (.txt) 文件
    ├── train/             # 训练用标注 (与 train/ 里的图片对应)
    └── val/               # 验证用标注 (与 val/ 里的图片对应)
	
# 将至少 80% 的图片和标注放入 `train` 文件夹，剩下的放入 `val` 文件夹
```
- **训练与导出模型**：打开终端，确保当前在 `my_dataset` 所在的目录。激活 `yolo` 环境，然后输入以下命令

```bash
yolo task=detect mode=train model=yolov8n.pt data=D:/chat_dataset/dataset.yaml epochs=100 imgsz=640 batch=16
    
- `model=yolov8n.pt`：使用轻量级的 nano 模型开始训练。   
- `epochs=100`：让模型对整个数据集学习 100 遍。
- `imgsz=640`：将图片统一缩放为 640x640 像素输入模型。   
- `batch=16`：一次处理 16 张图片。
```
训练完成后，在项目根目录下会生成一个 `runs/detect/train/weights/` 文件夹，里面就是训练好的模型 `best.pt`。将它导出为 ONNX 格式

```bash
yolo mode=export model=runs/detect/train/weights/best.pt format=onnx
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

本项目基于 MIT License 开源，可免费学习、使用、二次修改，商用请保留开源声明。

## 支持

如果本项目对你有帮助，欢迎 Star ⭐ 支持一下，持续更新优化更多实用功能！
