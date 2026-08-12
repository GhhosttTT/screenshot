# Screenshot Pro - GitHub 上传脚本
# 使用方法: 在 PowerShell 中运行 .\upload-to-github.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Screenshot Pro v2.0" -ForegroundColor Green
Write-Host "  GitHub 上传助手" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. 检查是否在正确的目录
$currentPath = Get-Location
Write-Host "[1/6] 检查当前目录..." -ForegroundColor Yellow
if (!(Test-Path "manifest.json")) {
    Write-Host "错误: 未找到 manifest.json 文件" -ForegroundColor Red
    Write-Host "请确保在 ppt-content-extractor 目录中运行此脚本" -ForegroundColor Red
    exit
}
Write-Host "✓ 当前目录正确" -ForegroundColor Green
Write-Host ""

# 2. 备份旧 README（如果需要）
Write-Host "[2/6] 准备 README 文件..." -ForegroundColor Yellow
if (Test-Path "README_V2.md") {
    if (Test-Path "README.md") {
        Write-Host "备份旧 README.md 为 README_V1_BACKUP.md" -ForegroundColor Cyan
        Move-Item "README.md" "README_V1_BACKUP.md" -Force
    }
    Write-Host "使用新版本 README" -ForegroundColor Cyan
    Copy-Item "README_V2.md" "README.md" -Force
    Write-Host "✓ README 文件已更新" -ForegroundColor Green
} else {
    Write-Host "! README_V2.md 未找到，保持原有 README" -ForegroundColor Yellow
}
Write-Host ""

# 3. 创建 LICENSE 文件（如果不存在）
Write-Host "[3/6] 检查 LICENSE 文件..." -ForegroundColor Yellow
if (!(Test-Path "LICENSE")) {
    Write-Host "创建 MIT LICENSE 文件" -ForegroundColor Cyan
    $licenseContent = @"
MIT License

Copyright (c) 2024-2026 GhhosttTT

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
"@
    Set-Content -Path "LICENSE" -Value $licenseContent -Encoding UTF8
    Write-Host "✓ LICENSE 文件已创建" -ForegroundColor Green
} else {
    Write-Host "✓ LICENSE 文件已存在" -ForegroundColor Green
}
Write-Host ""

# 4. 初始化 Git（如果需要）
Write-Host "[4/6] 初始化 Git 仓库..." -ForegroundColor Yellow
if (!(Test-Path ".git")) {
    Write-Host "初始化 Git 仓库" -ForegroundColor Cyan
    git init
    Write-Host "添加远程仓库" -ForegroundColor Cyan
    git remote add origin https://github.com/GhhosttTT/screenshot.git
    Write-Host "✓ Git 仓库已初始化" -ForegroundColor Green
} else {
    Write-Host "✓ Git 仓库已存在" -ForegroundColor Green
}
Write-Host ""

# 5. 添加所有文件
Write-Host "[5/6] 添加文件到 Git..." -ForegroundColor Yellow
git add .
Write-Host "✓ 文件已添加到暂存区" -ForegroundColor Green
Write-Host ""

# 6. 显示状态
Write-Host "[6/6] 当前 Git 状态:" -ForegroundColor Yellow
git status --short
Write-Host ""

# 7. 提示用户确认
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "准备就绪！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "接下来，请手动执行以下命令完成上传:" -ForegroundColor Yellow
Write-Host ""
Write-Host "# 提交更改" -ForegroundColor Cyan
Write-Host 'git commit -m "feat: Screenshot Pro v2.0 - 三合一专业截图工具"' -ForegroundColor White
Write-Host ""
Write-Host "# 推送到 GitHub（首次）" -ForegroundColor Cyan
Write-Host "git branch -M main" -ForegroundColor White
Write-Host "git push -u origin main" -ForegroundColor White
Write-Host ""
Write-Host "# 或者如果仓库已存在" -ForegroundColor Cyan
Write-Host "git pull origin main --rebase" -ForegroundColor White
Write-Host "git push origin main" -ForegroundColor White
Write-Host ""
Write-Host "# 创建版本标签" -ForegroundColor Cyan
Write-Host 'git tag -a v2.0.0 -m "Release Screenshot Pro v2.0.0"' -ForegroundColor White
Write-Host "git push origin v2.0.0" -ForegroundColor White
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "完成后访问: https://github.com/GhhosttTT/screenshot" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
