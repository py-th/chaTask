// src/main/utils/screenshotService.js
const { desktopCapturer, screen, BrowserWindow } = require('electron');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile, exec } = require('child_process');

// 定义覆盖层 HTML 的路径
const OVERLAY_HTML_PATH = path.join(__dirname, '../templates/screenshot-overlay.html');
// Windows 专用工具路径
const WIN_TOOL_PATH = path.join(__dirname, '../../../public/native/win_api_tool.exe');

class ScreenshotUtils {
    constructor() {
        this.overlay = null;
        this.cachedScreenImage = null; // 全屏图 (用于局部截图)
        this.cachedWindows = [];       // 窗口列表 (用于匹配)
        this.dpr = 1;
        this.platform = os.platform();
        this.tempDir = path.join(__dirname, '../../../temp');
        if (!fs.existsSync(this.tempDir)) fs.mkdirSync(this.tempDir);
    }

    /**
     * 创建截图覆盖层窗口
     */
    createOverlay(base64Image) {
        const { x, y, width, height } = screen.getPrimaryDisplay().bounds;
        console.log('创建截图覆盖层窗口...');
        const overlay = new BrowserWindow({
            x, y, width, height,
            transparent: true,
            frame: false,
            hasShadow: false,
            skipTaskbar: true,
            alwaysOnTop: true,
            focusable: true,
            resizable: false,
            movable: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, '../../preload/index.js')
            }
        });
        overlay.setIgnoreMouseEvents(false);
        overlay.setAlwaysOnTop(true, 'screen-saver');

        overlay.loadFile(OVERLAY_HTML_PATH)
            .then(() => {
                console.log('✅ HTML加载成功');
                overlay.webContents.executeJavaScript(`
                    (function() {
                        try {
                            window.initOverlay('${base64Image}');
                            console.log('✅ 覆盖层初始化成功');
                        } catch (e) {
                            console.error('❌ 覆盖层初始化失败:', e);
                        }
                    })();
                `);
                overlay.show();
                overlay.focus();
            })
            .catch(err => {
                console.error('❌ HTML加载失败:', err);
            });

        overlay.on('closed', () => {
            this.overlay = null;
            console.log('截图覆盖层窗口已关闭');
        });

        return overlay;
    }

    /**
     * 开始双截图流程
     */
    async startDoubleScreenshot() {
        const display = screen.getPrimaryDisplay();
        const { width, height } = display.bounds;
        this.dpr = display.scaleFactor;

        console.log(`[screenshot] 开始双截图，屏幕尺寸: ${width}x${height}, DPR: ${this.dpr}`);

        try {
            // 1. 获取全屏截图 (用于局部截图和遮罩背景)
            const screenSources = await desktopCapturer.getSources({
                types: ['screen'],
                thumbnailSize: { width: width * this.dpr, height: height * this.dpr }
            });
            if (screenSources.length === 0) throw new Error('无法获取屏幕截图');
            this.cachedScreenImage = screenSources[0].thumbnail.toPNG();

            // 2. 获取所有窗口的高清缩略图 (用于后续匹配)
            this.cachedWindows = await this.getAllWindows({ width: width * 1.5, height: height * 1.5 });
            console.log(`[screenshot] 已缓存 ${this.cachedWindows.length} 个窗口的高清缩略图`);

            // 3. 创建覆盖层
            this.overlay = this.createOverlay(this.cachedScreenImage.toString('base64'));

        } catch (error) {
            console.error(`[screenshot] 启动双截图失败: ${error.message}`);
            this.closeOverlay();
        }
    }

    /**
   * 捕获截图数据（返回Buffer，供主进程调用模型识别）
   */
  async captureScreenshotData(region) {
    try {
      const physicalX = Math.round(region.x * this.dpr);
      const physicalY = Math.round(region.y * this.dpr);
      const physicalW = Math.round(region.width * this.dpr);
      const physicalH = Math.round(region.height * this.dpr);
      const centerX = physicalX + Math.floor(physicalW / 2);
      const centerY = physicalY + Math.floor(physicalH / 2);

      console.log(`[screenshot] 开始处理截图 (平台: ${this.platform})...`);
      this.closeOverlay();

      // 局部截图
      const localImageBuffer = await sharp(this.cachedScreenImage)
        .extract({ left: physicalX, top: physicalY, width: physicalW, height: physicalH })
        .png()
        .toBuffer();
      console.log('[screenshot] ✅ 局部截图完成');

      // 整窗截图
      let fullWindowBuffer = null;
      let windowName = 'Unknown';
      let isWindowCaptured = false;

      if (this.platform === 'win32') {
        const result = await this.handleWindowsScreenshot(centerX, centerY);
        if (result) {
          fullWindowBuffer = result.buffer;
          windowName = result.name;
          isWindowCaptured = true;
        }
      } else if (this.platform === 'darwin') {
        const result = await this.captureActiveWindowMac();
        if (result) {
          fullWindowBuffer = result.buffer;
          windowName = result.name;
          isWindowCaptured = true;
        }
      }

      if (!isWindowCaptured) {
        console.log('[screenshot] ⚠️ 截图不在程序窗口内，返回全屏截图');
        fullWindowBuffer = this.cachedScreenImage;
        windowName = 'FullScreen_Fallback';
      }

      return { localImageBuffer, fullWindowBuffer, region, windowName };
    } catch (error) {
      console.error(`[screenshot] ❌ 截图失败: ${error.message}`);
      this.closeOverlay();
      throw error;
    }
  }

    /**
     * 完成截图 (核心逻辑重构)
     */
    async finishScreenshot(region, mainWindow) {
        try {
            // 1. 计算坐标 (物理像素)
            const physicalX = Math.round(region.x * this.dpr);
            const physicalY = Math.round(region.y * this.dpr);
            const physicalW = Math.round(region.width * this.dpr);
            const physicalH = Math.round(region.height * this.dpr);
            const centerX = physicalX + Math.floor(physicalW / 2);
            const centerY = physicalY + Math.floor(physicalH / 2);

            console.log(`[screenshot] 开始处理截图 (平台: ${this.platform})...`);
            this.closeOverlay();

            // 2. 获取局部截图 (通用逻辑：sharp 裁剪全屏图)
            const localImage = await sharp(this.cachedScreenImage)
                .extract({ left: physicalX, top: physicalY, width: physicalW, height: physicalH })
                .png()
                .toBuffer();
            console.log('[screenshot] ✅ 局部截图完成');

            // 3. 获取整窗截图 (平台差异化逻辑)
            let fullWindowBuffer = null;
            let windowName = 'Unknown';
            let isWindowCaptured = false;

            if (this.platform === 'win32') {
                // --- Windows 策略 ---
                const result = await this.handleWindowsScreenshot(centerX, centerY);
                if (result) {
                    fullWindowBuffer = result.buffer;
                    windowName = result.name;
                    isWindowCaptured = true;
                }
            } else if (this.platform === 'darwin') {
                // --- macOS 策略 ---
                console.log('[screenshot] macOS 检测到，截取当前激活窗口...');
                const result = await this.captureActiveWindowMac();
                if (result) {
                    fullWindowBuffer = result.buffer;
                    windowName = result.name;
                    isWindowCaptured = true;
                }
            }

            // 4. 兜底逻辑：如果没有捕获到窗口
            if (!isWindowCaptured) {
                console.log('[screenshot] ⚠️ 截图不在程序窗口内，返回全屏截图');
                fullWindowBuffer = this.cachedScreenImage;
                windowName = 'FullScreen_Fallback';
            }

            // 5. 发送结果 & 测试保存打开关闭
            //this.saveImageToRoot(fullWindowBuffer, windowName);
            mainWindow.webContents.send('double-screenshot-result', {
                localImage: localImage.toString('base64'),
                fullWindowImage: fullWindowBuffer.toString('base64'),
                region: region
            });

        } catch (error) {
            console.error(`[screenshot] ❌ 截图失败: ${error.message}`);
            this.closeOverlay();
        }
    }

    // ==========================================
    // Windows 专用处理逻辑 (合并自 windowUtils)
    // ==========================================
    async handleWindowsScreenshot(centerX, centerY) {
        // 1. 调用 exe 获取所有窗口信息
        if (!fs.existsSync(WIN_TOOL_PATH)) {
            console.error(`[screenshot] ❌ 找不到原生工具: ${WIN_TOOL_PATH}`);
            return null;
        }

        return new Promise((resolve) => {
            execFile(WIN_TOOL_PATH, [centerX.toString(), centerY.toString()], async (error, stdout, stderr) => {
                if (error) {
                    console.error(`[screenshot] 执行原生工具失败: ${error.message}`);
                    return resolve(null);
                }

                let windowData;
                try {
                    windowData = JSON.parse(stdout.trim());
                } catch (e) {
                    console.error(`[screenshot] 解析 JSON 失败: ${stdout}`, e);
                    return resolve(null);
                }

                if (!windowData || windowData.hwnd === 0) {
                    console.warn(`[screenshot] ⚠️ 原生工具未找到窗口`);
                    return resolve(null);
                }

                console.log(`[screenshot] ✅ 原生工具返回目标: ${windowData.title} (HWND: ${windowData.hwnd})`);

                // 2. 日志：打印 win_api_tool 获取到的所有窗口 (模拟遍历，实际 exe 只返回点击处的，这里仅打印目标)
                // 如果需要打印所有，需要修改 exe 逻辑，这里假设只打印命中的目标作为代表
                // 注意：desktopCapturer 会返回所有窗口，我们在下面打印它

                // 3. 日志：打印 desktopCapturer 捕获的当前激活窗口
                // 注意：desktopCapturer 返回的顺序通常第一个是桌面或当前激活窗口，这里简单打印前几个
                if (this.cachedWindows.length > 0) {
                    const activeCandidate = this.cachedWindows[0];
                    console.log(`[screenshot] 🖥️ desktopCapturer 捕获的首个窗口: ${activeCandidate.name} (ID: ${activeCandidate.id})`);
                }

                // 4. 坐标修正 (防止负数)
                const rawX = windowData.rect.x;
                const rawY = windowData.rect.y;
                const safeX = Math.max(0, rawX);
                const safeY = Math.max(0, rawY);
                const safeW = Math.max(1, windowData.rect.w);
                const safeH = Math.max(1, windowData.rect.h);

                console.log(`[screenshot] 坐标修正: 原始(${rawX}, ${rawY}) -> 安全坐标(${safeX}, ${safeY})`);

                // 5. 匹配 desktopCapturer 的源
                const target = this.cachedWindows.find(source => {
                    const name = (source.name || "").toLowerCase();
                    const title = (windowData.title || "").toLowerCase();
                    if (name.includes('chatask') || name.includes('electron')) return false;
                    return name.includes(title) || title.includes(name) || name === title;
                });

                if (target) {
                    console.log(`[screenshot] ✅ 匹配成功: 使用 desktopCapturer 的缩略图 - ${target.name}`);
                    
                    // 直接使用 desktopCapturer 返回的 thumbnail (已经是高清缩略图)
                    // 注意：如果 thumbnail 是空的，回退到裁剪全屏图
                    if (target.thumbnail && !target.thumbnail.isEmpty()) {
                        return resolve({
                            name: target.name,
                            buffer: target.thumbnail.toPNG()
                        });
                    }
                }

                // 6. 如果 desktopCapturer 没匹配到，回退到裁剪全屏图 (原逻辑)
                console.log(`[screenshot] ⚠️ 未匹配到 desktopCapturer 源，回退到裁剪全屏图`);
                
                const wx = Math.round(safeX * this.dpr);
                const wy = Math.round(safeY * this.dpr);
                const ww = Math.round(safeW * this.dpr);
                const wh = Math.round(safeH * this.dpr);

                try {
                    const buffer = await sharp(this.cachedScreenImage)
                        .extract({ left: wx, top: wy, width: ww, height: wh })
                        .png()
                        .toBuffer();
                    resolve({ name: windowData.title, buffer: buffer });
                } catch (cropError) {
                    console.error(`[screenshot] ❌ 裁剪全屏图失败: ${cropError.message}`);
                    resolve(null);
                }
            });
        });
    }

    /**
     * macOS 专用：截取当前激活窗口
     */
    captureActiveWindowMac() {
        return new Promise((resolve) => {
            const tempPath = path.join(this.tempDir, 'mac_active_window.png');
            
            // 获取窗口名
            const script = `
                tell application "System Events"
                    set frontApp to first application process whose frontmost is true
                    set windowName to name of frontApp
                end tell
                return windowName
            `;

            exec(`osascript -e '${script}'`, (err, stdout) => {
                let name = 'Active Window';
                if (!err && stdout) name = stdout.trim();

                // 截图命令: -o (无阴影), -C (无光标), -w (窗口模式), -T0 (无延时)
                // 注意：-w 模式下，如果鼠标不动，通常会截取最前面的窗口
                const captureCmd = `screencapture -o -C -w -T0 ${tempPath}`;
                
                exec(captureCmd, (captureErr) => {
                    if (captureErr) {
                        console.error('[screenshot] macOS 截图命令失败:', captureErr);
                        resolve(null);
                    } else {
                        setTimeout(() => {
                            if (fs.existsSync(tempPath)) {
                                const buffer = fs.readFileSync(tempPath);
                                resolve({ name: name, buffer: buffer });
                            } else {
                                resolve(null);
                            }
                        }, 500);
                    }
                });
            });
        });
    }

    /**
     * 获取所有可见窗口
     */
    async getAllWindows(thumbnailSize = { width: 200, height: 200 }) {
        try {
            const sources = await desktopCapturer.getSources({
                types: ['window'],
                thumbnailSize: thumbnailSize
            });
            const validWindows = sources.filter(source => {
                const hasName = source.name && source.name.length > 0;
                const hasThumbnail = source.thumbnail && !source.thumbnail.isEmpty();
                return hasName && hasThumbnail;
            });
            return validWindows;
        } catch (error) {
            console.error(`[screenshot] 获取窗口列表失败: ${error.message}`);
            return [];
        }
    }

    /**
     * 保存图片到根目录
     */
    saveImageToRoot(imageBuffer, windowName) {
        try {
            const rootDir = path.join(__dirname, '../../..');
            const safeName = windowName.replace(/[\\/:*?"<>|]/g, '_');
            const timestamp = new Date().getTime();
            const fileName = `${timestamp}_${safeName}.png`;
            const filePath = path.join(rootDir, fileName);
            fs.writeFileSync(filePath, imageBuffer);
            console.log(`[screenshot] 💾 整窗截图已保存至: ${filePath}`);
        } catch (err) {
            console.error(`[screenshot] ❌ 保存图片失败: ${err.message}`);
        }
    }

    /**
     * 关闭覆盖层
     */
    closeOverlay() {
        if (this.overlay) {
            this.overlay.close();
            this.overlay = null;
        }
    }
}

module.exports = ScreenshotUtils;