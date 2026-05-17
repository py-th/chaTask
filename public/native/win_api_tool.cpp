#include <iostream>
#include <windows.h>
#include <string>
#include <codecvt> // 用于宽字符转换

// 设置控制台输出为 UTF-8，防止中文乱码导致 JSON 解析失败
void SetupConsole() {
    SetConsoleOutputCP(CP_UTF8);
}

// 获取窗口标题 (UTF-8 格式)
std::string GetWindowTitleUtf8(HWND hwnd) {
    int len = GetWindowTextLengthW(hwnd);
    if (len == 0) return "";

    std::wstring wstr(len + 1, L'\0');
    GetWindowTextW(hwnd, &wstr[0], len + 1);
    wstr.resize(len); // 去除末尾的空字符

    // 将宽字符转换为 UTF-8 字符串
    std::wstring_convert<std::codecvt_utf8<wchar_t>> converter;
    return converter.to_bytes(wstr);
}

// 简单的 JSON 字符串转义 (处理 " 和 \)
std::string EscapeJson(const std::string& s) {
    std::string result;
    for (char c : s) {
        if (c == '"') result += "\\\"";
        else if (c == '\\') result += "\\\\";
        else result += c;
    }
    return result;
}

int wmain(int argc, wchar_t* argv[]) {
    // 1. 初始化控制台编码
    SetupConsole();

    // 2. 解析命令行参数 (x, y)
    if (argc < 3) {
        std::cerr << "{\"error\": \"Missing arguments. Usage: win_api_tool.exe <x> <y>\"}" << std::endl;
        return 1;
    }

    int x = _wtoi(argv[1]);
    int y = _wtoi(argv[2]);

    POINT pt = { x, y };

    // 3. 获取鼠标下的窗口句柄
    HWND hwnd = WindowFromPoint(pt);
    if (hwnd == NULL) {
        std::cout << "{\"hwnd\": 0, \"title\": \"\", \"rect\": null}" << std::endl;
        return 0;
    }

    // 4. 获取根窗口 (防止获取到子控件)
    HWND rootHwnd = GetAncestor(hwnd, GA_ROOTOWNER);
    if (rootHwnd != NULL) {
        hwnd = rootHwnd;
    }

    // 5. 获取窗口信息
    std::string title = GetWindowTitleUtf8(hwnd);
    
    RECT rect;
    if (!GetWindowRect(hwnd, &rect)) {
        std::cout << "{\"hwnd\": " << (long long)hwnd << ", \"title\": \"" << EscapeJson(title) << "\", \"rect\": null}" << std::endl;
        return 0;
    }

    int width = rect.right - rect.left;
    int height = rect.bottom - rect.top;

    // 6. 输出 JSON 结果
    // 关键修改：使用 (long long) 强制转换，确保输出十进制数字，而不是十六进制地址
    std::cout << "{\"hwnd\":" << (long long)hwnd 
              << ",\"title\":\"" << EscapeJson(title) 
              << "\",\"rect\":{\"x\":" << rect.left 
              << ",\"y\":" << rect.top 
              << ",\"w\":" << width 
              << ",\"h\":" << height 
              << "}}" << std::endl;

    return 0;
}