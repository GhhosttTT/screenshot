/**
 * 弹窗逻辑
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 加载截图计数
  await loadScreenshotCount();

  // 绑定按钮事件
  document.getElementById('activate-btn').addEventListener('click', activateOverlay);
  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('help-link').addEventListener('click', showHelp);
});

/**
 * 加载截图计数
 */
async function loadScreenshotCount() {
  const result = await chrome.storage.local.get('screenshotCount');
  const count = result.screenshotCount || 0;
  document.getElementById('screenshot-count').textContent = count;
}

/**
 * 激活遮罩层
 */
async function activateOverlay() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab || !tab.id) {
    showMessage('无法获取当前标签页');
    return;
  }

  try {
    // 注入 Content Script
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });

    // 注入 CSS
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['overlay/overlay.css']
    });

    // 发送激活消息
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_OVERLAY' });

    // 关闭弹窗
    window.close();
  } catch (error) {
    console.error('激活失败:', error);
    showMessage('激活失败: ' + error.message);
  }
}

/**
 * 打开设置页面
 */
function openSettings() {
  chrome.runtime.openOptionsPage();
  window.close();
}

/**
 * 显示帮助
 */
function showHelp(e) {
  e.preventDefault();
  
  const helpText = `
使用说明：

1. 点击"激活遮罩层"或按 Ctrl+Shift+Q
2. 在页面上拖拽鼠标选择截图区域
3. 按 Ctrl+Shift+S 截图
4. 截图自动保存到桌面的 Screenshots 文件夹

提示：
- 遮罩层不会阻止你点击页面内容
- 可以拖拽边缘调整区域大小
- 支持连续截图，无需重新选择区域
- 按 Ctrl+Shift+X 清除遮罩层
  `;

  alert(helpText);
}

/**
 * 显示消息
 */
function showMessage(text) {
  const message = document.createElement('div');
  message.style.cssText = `
    position: fixed;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 8px 16px;
    border-radius: 4px;
    font-size: 12px;
    z-index: 10000;
  `;
  message.textContent = text;
  document.body.appendChild(message);

  setTimeout(() => message.remove(), 3000);
}
