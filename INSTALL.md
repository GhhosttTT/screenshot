# 安装指南

## 快速开始

### 步骤 1: 生成图标

1. 在浏览器中打开 `icons/create-icons.html`
2. 点击三个"下载"按钮，分别下载：
   - icon16.png
   - icon48.png
   - icon128.png
3. 将下载的图标文件放到 `icons/` 文件夹中

### 步骤 2: 加载插件到 Chrome

1. 打开 Chrome 浏览器
2. 在地址栏输入 `chrome://extensions/` 并回车
3. 在右上角启用"**开发者模式**"
4. 点击左上角的"**加载已解压的扩展程序**"按钮
5. 选择项目文件夹：`e:\study\ppt-content-extractor`
6. 点击"选择文件夹"

### 步骤 3: 验证安装

安装成功后，你应该看到：
- ✅ 扩展列表中出现 "Screenshot Extension"
- ✅ 浏览器工具栏出现插件图标（蓝色相机图标）
- ✅ 状态显示为"已启用"

## 使用插件

### 第一次使用

1. 打开任意网页（例如：https://www.baidu.com）
2. 点击工具栏的插件图标
3. 在弹窗中点击"**激活遮罩层**"按钮
4. 在页面上拖拽鼠标选择一个矩形区域
5. 按 `Ctrl+Shift+S` 截图
6. 检查桌面是否生成了 `Screenshots_日期` 文件夹

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Shift+A` | 激活/停用遮罩层 |
| `Ctrl+Shift+S` | 截图 |
| `Ctrl+Shift+C` | 清除遮罩层 |

## 常见问题

### Q1: 插件图标不显示？

**解决方法**：
1. 检查插件是否已启用
2. 点击工具栏右侧的拼图图标
3. 找到 "Screenshot Extension" 并点击图钉图标固定到工具栏

### Q2: 快捷键不起作用？

**解决方法**：
1. 访问 `chrome://extensions/shortcuts`
2. 找到 "Screenshot Extension"
3. 检查快捷键是否与其他扩展冲突
4. 如有冲突，点击编辑按钮修改快捷键

### Q3: 截图是空白的？

**可能原因**：
- Chrome 内部页面（如 chrome://、chrome-extension:// 等）不允许截图
- 某些网站禁止截图（如 Netflix）

**解决方法**：
- 在普通网页上使用（如新闻网站、博客等）

### Q4: 找不到截图文件？

**检查位置**：
- 默认保存在桌面的 `Screenshots_YYYY-MM-DD` 文件夹
- 例如：`C:\Users\你的用户名\Desktop\Screenshots_2024-01-15\`

**修改保存位置**：
1. 右键点击插件图标
2. 选择"选项"
3. 在"保存路径"中选择"下载文件夹"

### Q5: 遮罩层挡住了页面内容？

**说明**：
- 遮罩层使用了 `pointer-events: none` 技术
- 你可以直接点击遮罩层下方的页面元素
- 遮罩层不会阻止任何页面交互

## 调试技巧

### 查看 Background Script 日志

1. 访问 `chrome://extensions/`
2. 找到 "Screenshot Extension"
3. 点击"Service Worker"链接
4. 在打开的开发者工具中查看日志

### 查看 Content Script 日志

1. 在网页上按 `F12` 打开开发者工具
2. 切换到 "Console" 标签
3. 查看是否有错误信息

### 重新加载插件

修改代码后：
1. 访问 `chrome://extensions/`
2. 找到 "Screenshot Extension"
3. 点击"重新加载"按钮（圆形箭头图标）

## 卸载插件

1. 访问 `chrome://extensions/`
2. 找到 "Screenshot Extension"
3. 点击"移除"按钮
4. 确认删除

## 更新插件

1. 修改代码
2. 访问 `chrome://extensions/`
3. 点击"重新加载"按钮
4. 测试新功能

## 打包发布

### 创建 ZIP 包

```bash
# Windows PowerShell
cd e:\study\ppt-content-extractor
Compress-Archive -Path * -DestinationPath screenshot-extension.zip
```

### 上传到 Chrome Web Store

1. 访问 [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. 点击"新增项目"
3. 上传 ZIP 文件
4. 填写商店信息
5. 提交审核

## 技术支持

如遇到问题：
1. 查看浏览器控制台错误信息
2. 检查 manifest.json 配置
3. 确认所有文件路径正确
4. 重新加载插件

## 下一步

- 阅读 [README.md](README.md) 了解详细功能
- 查看 [design-new.md](.kiro/specs/ppt-content-extractor/design-new.md) 了解技术架构
- 自定义设置以适应你的工作流程
