@echo off
echo ========================================
echo Screenshot Extension - 快速启动
echo ========================================
echo.
echo 正在打开测试页面和图标生成器...
echo.

REM 打开测试页面
start "" "test-page.html"

REM 等待 1 秒
timeout /t 1 /nobreak >nul

REM 打开图标生成器
start "" "icons\create-icons.html"

echo.
echo ========================================
echo 下一步操作：
echo ========================================
echo.
echo 1. 在图标生成器页面下载 3 个图标文件
echo 2. 将图标文件保存到 icons 文件夹
echo 3. 打开 Chrome 浏览器
echo 4. 访问 chrome://extensions/
echo 5. 启用"开发者模式"
echo 6. 点击"加载已解压的扩展程序"
echo 7. 选择当前文件夹
echo 8. 在测试页面上测试插件功能
echo.
echo 按任意键退出...
pause >nul
