/**
 * Background Service Worker
 * 处理快捷键命令、截图和下载
 */

// 存储活动标签页的状态
const tabStates = new Map();

// 当前会话的文件夹名称
let currentSessionFolder = null;

// 滚动截图会话管理
let activeScrollSession = null;

const defaultConfig = {
  savePath: 'desktop',
  imageFormat: 'png',
  imageQuality: 90,
  overlayColor: '#0078ff',
  overlayOpacity: 20,
  showDimensions: true
};

function normalizeConfig(config = {}) {
  const normalized = { ...defaultConfig, ...config };
  const rgbaMatch = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([.\d]+))?\s*\)$/i.exec(normalized.overlayColor || '');
  if (rgbaMatch) {
    const [, r, g, b, a] = rgbaMatch;
    normalized.overlayColor = `#${[r, g, b]
      .map((value) => Math.max(0, Math.min(255, Number(value))).toString(16).padStart(2, '0'))
      .join('')}`;
    if (a !== undefined && !config.overlayOpacity) {
      normalized.overlayOpacity = Math.round(Math.max(0, Math.min(1, Number(a))) * 100);
    }
  }
  if (!/^#[0-9a-f]{6}$/i.test(normalized.overlayColor)) {
    normalized.overlayColor = defaultConfig.overlayColor;
  }
  return normalized;
}

// 监听插件安装
chrome.runtime.onInstalled.addListener(() => {
  console.log('Screenshot Extension 已安装');
  
  // 初始化默认配置
  chrome.storage.sync.get('config', (result) => {
    if (!result.config) {
      const defaultConfig = {
        savePath: 'desktop',
        imageFormat: 'png',
        imageQuality: 90,
        overlayColor: '#0078ff',
        overlayOpacity: 20,
        showDimensions: true
      };
      chrome.storage.sync.set({ config: defaultConfig });
    }
  });
});

// 监听快捷键命令
chrome.commands.onCommand.addListener(async (command) => {
  console.log('快捷键触发:', command);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab || !tab.id) return;

  switch (command) {
    case 'toggle-overlay':
      console.log('执行: toggle-overlay');
      await toggleOverlay(tab.id);
      break;
    case 'capture-screenshot':
      console.log('执行: capture-screenshot');
      await captureScreenshot(tab.id);
      break;
    case 'clear-overlay':
      console.log('执行: clear-overlay');
      await clearOverlay(tab.id);
      break;
    case 'lock-overlay':
      console.log('执行: lock-overlay');
      await lockOverlay(tab.id);
      break;
    case 'toggle-scroll-shot':
      console.log('执行: toggle-scroll-shot');
      await toggleScrollShot(tab);
      break;
  }
});

// 监听来自 Content Script 和 Popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 快速截图相关
  if (message.type === 'SAVE_AREA') {
    // 保存截图区域
    if (sender.tab && sender.tab.id) {
      chrome.storage.local.set({ [`area_${sender.tab.id}`]: message.data });
      tabStates.set(sender.tab.id, { hasArea: true });
    }
    sendResponse({ success: true });
  } else if (message.type === 'GET_CONFIG') {
    // 获取配置
    chrome.storage.sync.get('config', (result) => {
      const config = normalizeConfig(result.config);
      if (JSON.stringify(config) !== JSON.stringify(result.config || {})) {
        chrome.storage.sync.set({ config });
      }
      sendResponse({ config });
    });
    return true; // 保持消息通道开放
  } else if (message.type === 'CAPTURE_COMPLETE') {
    // 截图完成，显示通知
    showNotification('截图成功', `已保存到 ${message.data.path}`);
    sendResponse({ success: true });
  } else if (message.type === 'NEW_FOLDER') {
    // 创建新文件夹
    currentSessionFolder = generateSessionFolderName();
    sendResponse({ success: true, folderName: currentSessionFolder });
  } else if (message.type === 'GET_CURRENT_FOLDER') {
    // 获取当前文件夹名称
    sendResponse({ folderName: currentSessionFolder });
  }
  // Popup 请求相关
  else if (message.type === 'TOGGLE_OVERLAY') {
    // Popup 请求激活区域选择器
    toggleOverlay(message.tabId).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  } else if (message.type === 'OPEN_SCROLL_CONSOLE') {
    // Popup 请求打开滚动截图控制台
    openScrollConsole(message).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
  // 滚动截图会话管理
  else if (message.type === 'SCROLLSHOT_OPENED') {
    activeScrollSession = {
      windowId: message.windowId,
      tabId: message.tabId
    };
    sendResponse({ ok: true });
    return true;
  } else if (message.type === 'SCROLLSHOT_CLOSED') {
    activeScrollSession = null;
    sendResponse({ ok: true });
    return true;
  }
});

/**
 * 切换遮罩层显示/隐藏
 */
async function toggleOverlay(tabId) {
  try {
    // 先尝试发送消息，如果失败说明 content script 未注入
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'TOGGLE_OVERLAY' });
      console.log('遮罩层切换成功');
      return;
    } catch (msgError) {
      console.log('Content script 未注入，开始注入...');
    }

    // 注入 CSS
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['overlay/overlay.css']
    });
    console.log('CSS 注入成功');

    // 注入 Content Script
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
    console.log('Content script 注入成功');

    // 等待一小段时间确保脚本加载完成
    await new Promise(resolve => setTimeout(resolve, 100));

    // 发送切换消息
    await chrome.tabs.sendMessage(tabId, { type: 'TOGGLE_OVERLAY' });
    console.log('遮罩层激活成功');
  } catch (error) {
    console.error('切换遮罩层失败:', error);
    // 显示错误通知
    showNotification('激活失败', `无法在此页面使用截图功能: ${error.message}`);
  }
}

/**
 * 清除遮罩层
 */
async function clearOverlay(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'CLEAR_OVERLAY' });
    tabStates.delete(tabId);
    chrome.storage.local.remove(`area_${tabId}`);
  } catch (error) {
    console.error('清除遮罩层失败:', error);
  }
}

/**
 * 锁定/解锁遮罩层（切换调整模式）
 */
async function lockOverlay(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'LOCK_OVERLAY' });
  } catch (error) {
    console.error('锁定遮罩层失败:', error);
  }
}

/**
 * 截取屏幕截图
 */
async function captureScreenshot(tabId) {
  try {
    // 检查是否有保存的区域
    const result = await chrome.storage.local.get(`area_${tabId}`);
    const area = result[`area_${tabId}`];

    if (!area) {
      // 发送错误消息到 Content Script
      await chrome.tabs.sendMessage(tabId, { 
        type: 'CAPTURE_ERROR',
        data: { error: '请先选择截图区域（按 Ctrl+Shift+Q 激活遮罩层）' }
      });
      return;
    }

    // 发送消息让 content script 临时隐藏遮罩层
    await chrome.tabs.sendMessage(tabId, { type: 'HIDE_OVERLAY_FOR_CAPTURE' });
    
    // 等待更长时间确保遮罩层已完全隐藏并且浏览器已重绘
    await new Promise(resolve => setTimeout(resolve, 200));

    // 获取配置
    const configResult = await chrome.storage.sync.get('config');
    const config = configResult.config || {};
    const format = config.imageFormat || 'png';

    // 截取可见标签页
    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: format === 'png' ? 'png' : 'jpeg',
      quality: format === 'jpeg' ? (config.imageQuality || 90) : undefined
    });

    // 恢复遮罩层显示
    await chrome.tabs.sendMessage(tabId, { type: 'SHOW_OVERLAY_AFTER_CAPTURE' });

    // 裁剪图片
    const croppedBlob = await cropImage(dataUrl, area, format);

    // 生成文件名
    const filename = generateFilename(format);

    // 下载文件
    await downloadImage(croppedBlob, filename);

    // 增加截图计数
    await incrementScreenshotCount();

    // 发送成功消息到 Content Script
    await chrome.tabs.sendMessage(tabId, { 
      type: 'CAPTURE_SUCCESS',
      data: { filename }
    });

  } catch (error) {
    console.error('截图失败:', error);
    
    // 发送错误消息到 Content Script
    try {
      await chrome.tabs.sendMessage(tabId, { 
        type: 'CAPTURE_ERROR',
        data: { error: `截图失败: ${error.message}` }
      });
    } catch (msgError) {
      console.error('发送错误消息失败:', msgError);
    }
  }
}

/**
 * 裁剪图片
 */
async function cropImage(dataUrl, area, format) {
  return new Promise((resolve, reject) => {
    // 将 base64 转换为 Blob
    fetch(dataUrl)
      .then(res => res.blob())
      .then(blob => {
        // 使用 createImageBitmap 代替 Image
        return createImageBitmap(blob);
      })
      .then(imageBitmap => {
        const canvas = new OffscreenCanvas(area.width, area.height);
        const ctx = canvas.getContext('2d');
        
        ctx.drawImage(
          imageBitmap,
          area.x, area.y, area.width, area.height,
          0, 0, area.width, area.height
        );

        return canvas.convertToBlob({ 
          type: `image/${format}`,
          quality: format === 'jpeg' ? 0.9 : undefined
        });
      })
      .then(resolve)
      .catch(reject);
  });
}

/**
 * 生成文件名
 */
function generateFilename(format) {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  // 如果有当前会话文件夹，使用它；否则使用日期文件夹
  const folderName = currentSessionFolder || generateDateFolderName();
  
  // 添加固定前缀，方便识别和遍历
  const filename = `screenshot_${hours}${minutes}${seconds}.${format}`;
  
  // 使用固定的根文件夹名称
  return `PPT_Screenshots/${folderName}/${filename}`;
}

/**
 * 生成日期文件夹名称
 */
function generateDateFolderName() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  
  return `Screenshots_${year}-${month}-${day}`;
}

/**
 * 生成会话文件夹名称
 */
function generateSessionFolderName() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  return `Screenshots_${year}${month}${day}_${hours}${minutes}${seconds}`;
}

/**
 * 下载图片
 */
async function downloadImage(blob, filename) {
  // 将 Blob 转换为 base64 data URL
  const reader = new FileReader();
  
  return new Promise((resolve, reject) => {
    reader.onloadend = async () => {
      try {
        const dataUrl = reader.result;
        
        await chrome.downloads.download({
          url: dataUrl,
          filename: filename,
          saveAs: false
        });
        
        resolve();
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * 增加截图计数
 */
async function incrementScreenshotCount() {
  const result = await chrome.storage.local.get('quickScreenshotCount');
  const count = (result.quickScreenshotCount || 0) + 1;
  await chrome.storage.local.set({ quickScreenshotCount: count });
  
  // 更新徽章
  chrome.action.setBadgeText({ text: String(count) });
  chrome.action.setBadgeBackgroundColor({ color: '#667eea' });
  
  // 通知 popup 更新统计
  chrome.runtime.sendMessage({ type: 'STATS_UPDATED' }).catch(() => {});
}

/**
 * 增加滚动截图计数
 */
async function incrementScrollScreenshotCount() {
  const result = await chrome.storage.local.get('scrollScreenshotCount');
  const count = (result.scrollScreenshotCount || 0) + 1;
  await chrome.storage.local.set({ scrollScreenshotCount: count });
  
  // 通知 popup 更新统计
  chrome.runtime.sendMessage({ type: 'STATS_UPDATED' }).catch(() => {});
}

/**
 * 打开滚动截图控制台
 */
async function openScrollConsole(params) {
  const { tabId, windowId, title, autostart } = params;
  
  const url = chrome.runtime.getURL(
    `scroll/manualshot.html?tabId=${tabId}&windowId=${windowId}&title=${encodeURIComponent(title || 'page')}${autostart ? '&autostart=1' : ''}`
  );
  
  const win = await chrome.windows.create({
    url,
    type: 'popup',
    width: 410,
    height: 540
  });
  
  activeScrollSession = { windowId: win.id, tabId };
}

/**
 * 快捷键触发滚动截图
 */
async function toggleScrollShot(tab) {
  if (activeScrollSession?.windowId) {
    // 如果控制台已打开，发送完成消息
    chrome.runtime.sendMessage({ type: 'SCROLLSHOT_FINISH' }).catch(() => {});
    return;
  }
  
  // 如果控制台未打开，打开控制台并自动开始
  if (tab && tab.id) {
    await openScrollConsole({
      tabId: tab.id,
      windowId: tab.windowId,
      title: tab.title || 'page',
      autostart: true
    });
  }
}

/**
 * 显示通知
 */
function showNotification(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: title,
    message: message
  });
}
