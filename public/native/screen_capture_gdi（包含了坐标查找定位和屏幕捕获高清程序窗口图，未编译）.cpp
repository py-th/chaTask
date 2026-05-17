#include <iostream>
#include <windows.h>
#include <string>
#include <codecvt>
#include <sstream>
#include <vector>
#include <shlwapi.h> // 需要链接 Shlwapi.lib
#include <gdiplus.h> // 需要链接 Gdiplus.lib

#pragma comment(lib, "Shlwapi.lib")
#pragma comment(lib, "Gdiplus.lib")
#pragma comment(lib, "User32.lib")
#pragma comment(lib, "Gdi32.lib")

using namespace Gdiplus;

// --- 工具函数：宽字符转换 ---
std::string WStringToUtf8(const std::wstring& wstr) {
    if (wstr.empty()) return "";
    int size_needed = WideCharToMultiByte(CP_UTF8, 0, &wstr[0], (int)wstr.size(), NULL, 0, NULL, NULL);
    std::string strTo(size_needed, 0);
    WideCharToMultiByte(CP_UTF8, 0, &wstr[0], (int)wstr.size(), &strTo[0], size_needed, NULL, NULL);
    return strTo;
}

std::wstring Utf8ToWString(const std::string& str) {
    if (str.empty()) return L"";
    int size_needed = MultiByteToWideChar(CP_UTF8, 0, &str[0], (int)str.size(), NULL, 0);
    std::wstring wstrTo(size_needed, 0);
    MultiByteToWideChar(CP_UTF8, 0, &str[0], (int)str.size(), &wstrTo[0], size_needed);
    return wstrTo;
}

// --- 工具函数：JSON 转义 ---
std::string EscapeJson(const std::string& s) {
    std::string result;
    for (char c : s) {
        if (c == '"') result += "\\\"";
        else if (c == '\\') result += "\\\\";
        else result += c;
    }
    return result;
}

// --- 核心功能：获取窗口信息 (原有逻辑) ---
void GetWindowInfoLogic(int x, int y) {
    POINT pt = { x, y };
    HWND hwnd = WindowFromPoint(pt);
    if (hwnd == NULL) {
        std::cout << "{\"hwnd\": 0, \"title\": \"\", \"rect\": null}" << std::endl;
        return;
    }
    
    // 获取根窗口
    HWND rootHwnd = GetAncestor(hwnd, GA_ROOTOWNER);
    if (rootHwnd != NULL) hwnd = rootHwnd;

    // 获取标题
    int len = GetWindowTextLengthW(hwnd);
    std::wstring wstr(len + 1, L'\0');
    GetWindowTextW(hwnd, &wstr[0], len + 1);
    wstr.resize(len);
    std::string title = WStringToUtf8(wstr);

    // 获取坐标
    RECT rect;
    if (!GetWindowRect(hwnd, &rect)) {
        std::cout << "{\"hwnd\": " << (long long)hwnd << ", \"title\": \"" << EscapeJson(title) << "\", \"rect\": null}" << std::endl;
        return;
    }

    int width = rect.right - rect.left;
    int height = rect.bottom - rect.top;

    std::cout << "{\"hwnd\":" << (long long)hwnd 
              << ",\"title\":\"" << EscapeJson(title) 
              << "\",\"rect\":{\"x\":" << rect.left 
              << ",\"y\":" << rect.top 
              << ",\"w\":" << width 
              << ",\"h\":" << height << "}}" << std::endl;
}

// --- 核心功能：PrintWindow 截图 (新增逻辑) ---
int CaptureWindowLogic(HWND targetHwnd) {
    // 1. 初始化 GDI+
    GdiplusStartupInput gdiplusStartupInput;
    ULONG_PTR gdiplusToken;
    GdiplusStartup(&gdiplusToken, &gdiplusStartupInput, NULL);

    // 2. 获取窗口尺寸
    RECT rect;
    if (!GetWindowRect(targetHwnd, &rect)) {
        GdiplusShutdown(gdiplusToken);
        return 1;
    }
    int width = rect.right - rect.left;
    int height = rect.bottom - rect.top;

    if (width <= 0 || height <= 0) {
        GdiplusShutdown(gdiplusToken);
        return 1;
    }

    // 3. 创建兼容 DC 和 Bitmap
    HDC hdcWindow = GetDC(targetHwnd);
    HDC hdcMemDC = CreateCompatibleDC(hdcWindow);
    HBITMAP hBitmap = CreateCompatibleBitmap(hdcWindow, width, height);
    SelectObject(hdcMemDC, hBitmap);

    // 4. 调用 PrintWindow (关键步骤)
    // PW_RENDERFULLCONTENT 标志可以确保即使窗口最小化也能截取内容 (Win8.1+)
    BOOL bRet = PrintWindow(targetHwnd, hdcMemDC, PW_RENDERFULLCONTENT);
    
    // 如果 PrintWindow 失败，尝试用 BitBlt 作为备选（虽然会有遮挡问题，但比黑屏好）
    if (!bRet) {
         BitBlt(hdcMemDC, 0, 0, width, height, hdcWindow, 0, 0, SRCCOPY);
    }

    // 5. 保存为 PNG 到临时文件
    // 生成临时文件路径
    wchar_t tempPath[MAX_PATH];
    wchar_t tempFile[MAX_PATH];
    GetTempPathW(MAX_PATH, tempPath);
    GetTempFileNameW(tempPath, L"cap", 0, tempFile);
    // 修改扩展名为 .png
    std::wstring pngPath = std::wstring(tempFile) + L".png";

    CLSID pngClsid;
    // 获取 PNG 编码器的 CLSID
    UINT num = 0, size = 0;
    GetImageEncodersSize(&num, &size);
    if(size == 0) {
         GdiplusShutdown(gdiplusToken);
         return 1;
    }
    ImageCodecInfo* pImageCodecInfo = (ImageCodecInfo*)(malloc(size));
    if(pImageCodecInfo == NULL) {
         GdiplusShutdown(gdiplusToken);
         return 1;
    }
    GetImageEncoders(num, size, pImageCodecInfo);
    for(UINT j = 0; j < num; ++j) {
        if(wcscmp(pImageCodecInfo[j].MimeType, L"image/png") == 0) {
            pngClsid = pImageCodecInfo[j].Clsid;
            break;
        }
    }
    free(pImageCodecInfo);

    // 保存
    Bitmap bitmap(hBitmap, NULL);
    Status status = bitmap.Save(pngPath.c_str(), &pngClsid, NULL);

    // 6. 清理资源
    DeleteObject(hBitmap);
    DeleteDC(hdcMemDC);
    ReleaseDC(targetHwnd, hdcWindow);
    GdiplusShutdown(gdiplusToken);

    if (status == Ok) {
        // 输出 JSON 包含文件路径
        std::string utf8Path = WStringToUtf8(pngPath);
        std::cout << "{\"success\": true, \"path\": \"" << EscapeJson(utf8Path) << "\", \"hwnd\": " << (long long)targetHwnd << "}" << std::endl;
        return 0;
    } else {
        std::cout << "{\"success\": false, \"error\": \"Save failed\"}" << std::endl;
        return 1;
    }
}

// --- 主函数 ---
int wmain(int argc, wchar_t* argv[]) {
    // 设置控制台输出为 UTF-8
    SetConsoleOutputCP(CP_UTF8);

    // 逻辑分支判断
    if (argc == 3) {
        // 模式 1: 获取窗口信息 (原有逻辑)
        // 用法: win_api_tool.exe <x> <y>
        int x = _wtoi(argv[1]);
        int y = _wtoi(argv[2]);
        GetWindowInfoLogic(x, y);
    } 
    else if (argc == 2) {
        // 模式 2: 截图 (新逻辑)
        // 用法: win_api_tool.exe <hwnd>
        // 注意：Node.js 传入的可能是字符串形式的数字
        long long hwndVal = _wtoi64(argv[1]);
        HWND targetHwnd = (HWND)hwndVal;
        
        if (targetHwnd == NULL) {
             std::cout << "{\"success\": false, \"error\": \"Invalid HWND\"}" << std::endl;
             return 1;
        }
        
        return CaptureWindowLogic(targetHwnd);
    }
    else {
        std::cerr << "{\"error\": \"Invalid arguments. Usage: <x> <y> OR <hwnd>\"}" << std::endl;
        return 1;
    }

    return 0;
}