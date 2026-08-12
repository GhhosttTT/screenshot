# Screenshot Pro - 功能整合方案

## 📋 整合概述

将 **快速截图**、**滚动长图** 和 **视频录制** 三大功能整合到一个插件中。

---

## 🎯 功能模块

### 1. 快速截图（原有功能）
- **快捷键**: `Ctrl+Shift+Q` (激活), `Ctrl+Shift+S` (截图), `Ctrl+Shift+K` (锁定), `Ctrl+Shift+X` (清除)
- **文件**: 
  - `content.js` - 区域选择和截图逻辑
  - `overlay/overlay.css` - 遮罩层样式
- **保存路径**: `PPT_Screenshots/{date-folder}/screenshot_{time}.png`

### 2. 滚动长图（新增）
- **快捷键**: `Alt+Shift+S` (开始/完成)
- **需要复制的文件**:
  - 从 `f:\pluging\` 复制以下文件到 `f:\pluging\ppt-content-extractor\`:
    - `manualshot.html` → `scroll/manualshot.html`
    - `manualshot.css` → `scroll/manualshot.css`
    - `manualshot.js` → `scroll/manualshot.js`
- **功能**: 手动滚动页面自动采样并拼接成长图

### 3. 视频录制（新增）
- **需要复制的文件**:
  - 从 `f:\pluging\` 复制以下文件到 `f:\pluging\ppt-content-extractor\`:
    - `recorder.html` → `recorder/recorder.html`
    - `recorder.css` → `recorder/recorder.css`
    - `recorder.js` → `recorder/recorder.js`
- **功能**: 录制当前标签页为 WebM 视频

---

## 📁 目标目录结构

```
ppt-content-extractor/
├── manifest.json              # ✅ 已更新 - 添加新权限和命令
├── background.js              # ⚠️ 需要更新 - 支持三大功能
├── content.js                 # ✅ 保持原样 - 快速截图
│
├── popup/                     # ✅ 已更新 - 新 UI
│   ├── popup.html            
│   ├── popup.css             
│   └── popup.js              
│
├── overlay/                   # ✅ 保持原样
│   └── overlay.css           
│
├── scroll/                    # 📂 新建目录 - 滚动长图
│   ├── manualshot.html       
│   ├── manualshot.css        
│   └── manualshot.js         
│
├── recorder/                  # 📂 新建目录 - 视频录制
│   ├── recorder.html         
│   ├── recorder.css          
│   └── recorder.js           
│
├── options/                   # ⚠️ 需要更新 - 添加新设置项
│   ├── options.html          
│   ├── options.css           
│   └── options.js            
│
└── icons/                     # ✅ 保持原样
    ├── icon16.png            
    ├── icon48.png            
    └── icon128.png           
```

---

## 🔧 待完成的步骤

### Step 1: 创建目录和复制文件 ✅
```bash
# 创建目录
mkdir ppt-content-extractor\scroll
mkdir ppt-content-extractor\recorder

# 复制滚动长图文件
copy f:\pluging\manualshot.html ppt-content-extractor\scroll\
copy f:\pluging\manualshot.css ppt-content-extractor\scroll\
copy f:\pluging\manualshot.js ppt-content-extractor\scroll\

# 复制录制器文件
copy f:\pluging\recorder.html ppt-content-extractor\recorder\
copy f:\pluging\recorder.css ppt-content-extractor\recorder\
copy f:\pluging\recorder.js ppt-content-extractor\recorder\

# 复制 content.js 中的滚动截图相关逻辑（已集成到原有 content.js）
```

### Step 2: 更新 background.js ⚠️
需要处理以下消息类型：

**快速截图**（原有）:
- `TOGGLE_OVERLAY` - 激活/停用区域选择器
- `SAVE_AREA` - 保存截图区域
- `capture-screenshot` 命令 - 快速截图
- `lock-overlay` 命令 - 锁定区域
- `clear-overlay` 命令 - 清除区域

**滚动长图**（新增）:
- `OPEN_SCROLL_CONSOLE` - 打开滚动截图控制台
- `toggle-scroll-shot` 命令 - 开始/完成滚动截图
- 需要注入滚动截图相关的 content script

**视频录制**（新增）:
- 录制器独立运行，不需要额外的 background 逻辑

### Step 3: 更新 content.js ⚠️
需要添加滚动截图相关的函数：
- `getActiveScrollState()` - 获取滚动状态
- `createRegionSelector()` - 创建区域选择器（已有，但需要增强）
- `expandRegionToContentWidth()` - 扩展到内容宽度
- 滚动监听器
- 固定元素隐藏/恢复

### Step 4: 测试清单 ⚠️

**快速截图测试**:
- [ ] Ctrl+Shift+Q 激活区域选择器
- [ ] 拖拽选择区域
- [ ] Ctrl+Shift+S 快速截图
- [ ] Ctrl+Shift+K 锁定/解锁
- [ ] Ctrl+Shift+X 清除区域
- [ ] 连续截图功能
- [ ] 统计计数正确

**滚动长图测试**:
- [ ] 打开控制台
- [ ] 选择区域（可选）
- [ ] Start 开始截图
- [ ] 手动滚动页面
- [ ] Alt+Shift+S 完成
- [ ] 图片拼接正确
- [ ] 去重功能正常

**视频录制测试**:
- [ ] 打开录制器
- [ ] 选择是否包含音频
- [ ] 开始录制
- [ ] 停止录制
- [ ] 保存为 WebM

---

## ⚙️ 配置选项（options.html）

需要添加以下新选项：

### 滚动长图设置
- 默认隐藏悬浮元素（checkbox）
- 默认使用选定区域（checkbox）
- 采样间隔（slider, 200-1000ms）
- 最小滚动距离（slider, 10-50px）

### 统计重置
- 快速截图计数重置（button）
- 滚动长图计数重置（button）

---

## 🎨 UI 设计说明

### Popup 界面
- **选项卡式设计**: 三个选项卡分别对应三大功能
- **统计信息**: 顶部显示快速截图和滚动长图的计数
- **渐变配色**: 紫色渐变主题（#667eea → #764ba2）
- **快捷键提示**: 每个功能模块都显示相关快捷键

### 控制台（滚动长图）
- 保持原有的 manualshot.html 设计
- 进度条、样本数、范围显示
- Start/Finish 按钮
- 选项：隐藏悬浮元素、使用区域

### 录制器
- 保持原有的 recorder.html 设计
- 预览画面
- 开始/停止按钮
- 计时器显示

---

## 🚀 快速执行命令

```powershell
# 1. 创建目录
New-Item -ItemType Directory -Path "f:\pluging\ppt-content-extractor\scroll" -Force
New-Item -ItemType Directory -Path "f:\pluging\ppt-content-extractor\recorder" -Force

# 2. 复制文件
Copy-Item "f:\pluging\manualshot.html" "f:\pluging\ppt-content-extractor\scroll\"
Copy-Item "f:\pluging\manualshot.css" "f:\pluging\ppt-content-extractor\scroll\"
Copy-Item "f:\pluging\manualshot.js" "f:\pluging\ppt-content-extractor\scroll\"

Copy-Item "f:\pluging\recorder.html" "f:\pluging\ppt-content-extractor\recorder\"
Copy-Item "f:\pluging\recorder.css" "f:\pluging\ppt-content-extractor\recorder\"
Copy-Item "f:\pluging\recorder.js" "f:\pluging\ppt-content-extractor\recorder\"

Copy-Item "f:\pluging\content.js" "f:\pluging\ppt-content-extractor\scroll-content.js"

# 3. 在 Chrome 中重新加载插件
# 访问 chrome://extensions/
# 点击 Screenshot Pro 的刷新按钮
```

---

## 📝 注意事项

1. **坐标系问题**: 确保区域选择使用页面绝对坐标，而不是视口坐标
2. **权限**: 已添加 `tabCapture` 权限用于视频录制
3. **文件路径**: 录制器和滚动控制台的路径需要更新为新的目录结构
4. **快捷键冲突**: 确保两个模式的快捷键不冲突（Alt+Shift+S vs Ctrl+Shift+S）
5. **统计分离**: 快速截图和滚动长图使用不同的计数器

---

## 🎉 完成后的效果

用户将拥有一个**三合一**的专业截图工具：
1. **快速截图** - 适合批量截取固定区域
2. **滚动长图** - 适合截取长页面内容
3. **视频录制** - 适合录制操作演示

所有功能通过一个统一的弹窗界面访问，体验流畅，功能强大！
