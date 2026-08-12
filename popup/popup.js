/**
 * Popup Script - 重新设计版
 * 管理三大功能：快速截图、滚动长图、视频录制
 */

// DOM 元素
const quickCountEl = document.getElementById('quick-count');
const scrollCountEl = document.getElementById('scroll-count');
const activateRegionBtn = document.getElementById('activate-region-btn');
const openScrollConsoleBtn = document.getElementById('open-scroll-console-btn');
const openRecorderBtn = document.getElementById('open-recorder-btn');
const settingsBtn = document.getElementById('settings-btn');
const helpBtn = document.getElementById('help-btn');
const hideFixedCheckbox = document.getElementById('hide-fixed');
const recordAudioCheckbox = document.getElementById('record-audio');

// 选项卡切换
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const targetTab = btn.dataset.tab;
    
    // 移除所有激活状态
    tabBtns.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    
    // 激活当前选项卡
    btn.classList.add('active');
    document.getElementById(`tab-${targetTab}`).classList.add('active');
  });
});

// 加载统计数据
async function loadStats() {
  try {
    const result = await chrome.storage.local.get(['quickScreenshotCount', 'scrollScreenshotCount']);
    quickCountEl.textContent = result.quickScreenshotCount || 0;
    scrollCountEl.textContent = result.scrollScreenshotCount || 0;
  } catch (error) {
    console.error('加载统计数据失败:', error);
  }
}

// 获取当前激活的标签页
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error('No active tab found.');
  }
  if (!/^https?:|^file:/.test(tab.url || '')) {
    throw new Error('This page cannot be captured. Please use on a normal webpage.');
  }
  return tab;
}

// 快速截图 - 激活区域选择器
activateRegionBtn.addEventListener('click', async () => {
  try {
    const tab = await getActiveTab();
    
    // 发送消息给 background 激活区域选择器
    await chrome.runtime.sendMessage({
      type: 'TOGGLE_OVERLAY',
      tabId: tab.id
    });
    
    window.close();
  } catch (error) {
    alert(error.message || '无法激活区域选择器');
  }
});

// 滚动长图 - 打开控制台
openScrollConsoleBtn.addEventListener('click', async () => {
  try {
    const tab = await getActiveTab();
    const hideFixed = hideFixedCheckbox.checked;
    
    // 发送消息给 background 打开滚动截图控制台
    await chrome.runtime.sendMessage({
      type: 'OPEN_SCROLL_CONSOLE',
      tabId: tab.id,
      windowId: tab.windowId,
      title: tab.title || 'page',
      hideFixed: hideFixed,
      useRegion: false  // 总是从控制台内选择区域
    });
    
    window.close();
  } catch (error) {
    alert(error.message || '无法打开滚动截图控制台');
  }
});

// 视频录制 - 打开录制器
openRecorderBtn.addEventListener('click', async () => {
  try {
    const tab = await getActiveTab();
    const includeAudio = recordAudioCheckbox.checked;
    
    // 获取媒体流 ID
    const streamId = await chrome.tabCapture.getMediaStreamId({ 
      targetTabId: tab.id 
    });
    
    // 打开录制器窗口
    const url = chrome.runtime.getURL(
      `recorder/recorder.html?streamId=${encodeURIComponent(streamId)}&audio=${includeAudio ? '1' : '0'}`
    );
    
    await chrome.windows.create({
      url,
      type: 'popup',
      width: 430,
      height: 520
    });
    
    window.close();
  } catch (error) {
    alert(error.message || '无法打开录制器');
  }
});

// 设置按钮
settingsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

// 帮助按钮
helpBtn.addEventListener('click', () => {
  const helpText = `
Screenshot Pro - 使用帮助

【快速截图模式】
1. 按 Ctrl+Shift+Q 激活区域选择器
2. 拖拽鼠标选择截图区域
3. 按 Ctrl+Shift+S 快速截图
4. 按 Ctrl+Shift+K 锁定区域（可点击下方元素）
5. 按 Ctrl+Shift+X 清除区域

【滚动长图模式】
1. 点击"打开滚动截图控制台"
2. 可选：框选区域
3. 点击 Start，手动滚动页面
4. 按 Alt+Shift+S 完成并拼接长图

【视频录制模式】
1. 点击"打开录制控制台"
2. 点击开始录制
3. 操作页面
4. 点击停止并保存为 WebM

提示：
- 快速截图保存到 PPT_Screenshots 文件夹
- 滚动长图会自动去重和拼接
- 录屏只支持普通网页，不支持受保护页面
  `;

  alert(helpText);
});

// 初始化
loadStats();

// 监听来自 background 的统计更新
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'STATS_UPDATED') {
    loadStats();
  }
});
