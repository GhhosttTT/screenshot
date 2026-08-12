# GitHub 上传指南

## 📋 准备工作

你的插件已经整合完成，可以上传到 GitHub 了！

仓库地址: https://github.com/GhhosttTT/screenshot

---

## 🚀 快速上传步骤

### Step 1: 初始化 Git 仓库（如果还没有）

```bash
cd f:\pluging\ppt-content-extractor

# 初始化 Git
git init

# 添加远程仓库
git remote add origin https://github.com/GhhosttTT/screenshot.git
```

### Step 2: 创建 .gitignore 文件

```bash
# 创建 .gitignore
echo .git/ > .gitignore
echo node_modules/ >> .gitignore
echo .DS_Store >> .gitignore
echo Thumbs.db >> .gitignore
echo *.log >> .gitignore
```

### Step 3: 添加所有文件

```bash
# 添加所有文件到暂存区
git add .

# 查看状态
git status
```

### Step 4: 提交

```bash
# 首次提交
git commit -m "feat: Screenshot Pro v2.0 - 三合一专业截图工具

- 快速截图：区域选择 + 批量快速截图
- 滚动长图：手动滚动自动拼接长图
- 视频录制：标签页录制为 WebM
- 重新设计 UI：选项卡式界面
- 添加统计功能：分别统计快速截图和滚动长图次数
"
```

### Step 5: 推送到 GitHub

```bash
# 首次推送（如果仓库为空）
git branch -M main
git push -u origin main

# 或者如果仓库已存在
git pull origin main --rebase
git push origin main
```

---

## 📁 应该上传的文件

### ✅ 必须上传
- `manifest.json` - 插件配置
- `background.js` - 后台脚本
- `content.js` - 内容脚本
- `popup/` - 弹窗相关文件
- `overlay/` - 遮罩层样式
- `scroll/` - 滚动截图相关文件
- `recorder/` - 录制器相关文件
- `options/` - 设置页面
- `icons/` - 图标文件
- `README.md` - 项目说明（建议使用 README_V2.md）
- `LICENSE` - 许可证文件

### ⚠️ 可选上传
- `INTEGRATION_PLAN.md` - 整合计划文档
- `PROJECT_SUMMARY.md` - 项目总结
- `CHECKLIST.md` - 检查清单
- `INSTALL.md` - 安装指南

### ❌ 不要上传
- `.git/` - Git 元数据（自动忽略）
- `node_modules/` - 依赖包（如果有）
- 临时文件和日志

---

## 📝 建议的 README.md 内容

建议使用 `README_V2.md` 的内容作为主 README：

```bash
# 重命名文件
mv README.md README_V1_BACKUP.md
mv README_V2.md README.md
```

或者手动复制 `README_V2.md` 的内容到 `README.md`。

---

## 🎨 建议的仓库结构

```
screenshot/
├── .gitignore
├── README.md                  # 项目说明
├── LICENSE                    # MIT 许可证
├── manifest.json              # 插件配置
├── background.js              # 后台脚本
├── content.js                 # 内容脚本
│
├── popup/                     # 弹窗
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
│
├── overlay/                   # 遮罩层
│   └── overlay.css
│
├── scroll/                    # 滚动截图
│   ├── manualshot.html
│   ├── manualshot.css
│   └── manualshot.js
│
├── recorder/                  # 视频录制
│   ├── recorder.html
│   ├── recorder.css
│   └── recorder.js
│
├── options/                   # 设置页面
│   ├── options.html
│   ├── options.css
│   └── options.js
│
└── icons/                     # 图标
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## 🏷️ 建议的 Git Tags

上传后，可以创建版本标签：

```bash
# 创建 v2.0.0 标签
git tag -a v2.0.0 -m "Release Screenshot Pro v2.0.0 - 三合一专业截图工具"

# 推送标签
git push origin v2.0.0
```

---

## 📋 Commit Message 规范

建议使用以下前缀：

- `feat:` - 新功能
- `fix:` - Bug 修复
- `docs:` - 文档更新
- `style:` - 代码格式（不影响功能）
- `refactor:` - 重构
- `perf:` - 性能优化
- `test:` - 测试相关
- `chore:` - 构建过程或辅助工具的变动

**示例**:
```bash
git commit -m "feat: 添加滚动长图功能"
git commit -m "fix: 修复区域选择的坐标问题"
git commit -m "docs: 更新 README 使用说明"
```

---

## 🎉 发布 Release

在 GitHub 上创建 Release：

1. 访问 https://github.com/GhhosttTT/screenshot/releases
2. 点击 "Create a new release"
3. 选择标签 `v2.0.0`
4. 标题: `Screenshot Pro v2.0.0`
5. 描述:

```markdown
## 🎉 Screenshot Pro v2.0.0

专业截图录屏工具 - 三合一解决方案

### ✨ 新功能

- **快速截图** - 区域选择 + 批量快速截图
- **滚动长图** - 手动滚动自动拼接长图
- **视频录制** - 标签页录制为 WebM

### 🎨 界面改进

- 重新设计弹窗界面（选项卡式）
- 紫色渐变主题
- 添加统计功能

### 🐛 Bug 修复

- 修复区域选择的坐标问题（使用页面绝对坐标）
- 修复滚动监听的 bug
- 优化拼接算法的去重逻辑

### 📦 安装方法

1. 下载压缩包并解压
2. 打开 Chrome 扩展管理页面 `chrome://extensions/`
3. 启用"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择解压后的文件夹

### 📚 使用文档

详细使用说明请查看 [README.md](https://github.com/GhhosttTT/screenshot/blob/main/README.md)
```

6. 点击 "Publish release"

---

## 🔄 后续更新流程

```bash
# 1. 修改代码
# 2. 测试功能
# 3. 提交更改
git add .
git commit -m "feat: 添加新功能描述"

# 4. 推送到 GitHub
git push origin main

# 5. 如果是重要版本，创建新标签
git tag -a v2.0.1 -m "Release v2.0.1"
git push origin v2.0.1

# 6. 在 GitHub 上创建新 Release
```

---

## 💡 其他建议

### 1. 添加 LICENSE 文件

如果还没有，建议添加 MIT 许可证：

```bash
# 创建 LICENSE 文件
cat > LICENSE << EOF
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
EOF
```

### 2. 添加 GitHub Actions（可选）

如果想要自动化测试或发布，可以添加 `.github/workflows/` 目录。

### 3. 添加 Issues 模板

在 GitHub 仓库设置中可以添加 Issue 模板，方便用户报告问题。

### 4. 添加截图

在 README 中添加插件的截图会更吸引人：

- 弹窗界面截图
- 快速截图演示 GIF
- 滚动长图演示 GIF
- 录制器界面截图

---

## ✅ 上传前检查清单

- [ ] 所有文件已保存
- [ ] 功能已测试
- [ ] README.md 已更新
- [ ] manifest.json 版本号正确
- [ ] 图标文件存在且正确
- [ ] .gitignore 已创建
- [ ] LICENSE 文件已添加
- [ ] 敏感信息已移除（如 API 密钥）

---

## 🎊 完成！

上传完成后，你的插件就可以在 GitHub 上公开访问了！

别人可以通过以下方式安装：
1. 访问 https://github.com/GhhosttTT/screenshot
2. 点击 "Code" → "Download ZIP"
3. 解压并在 Chrome 中加载

Good luck! 🚀
