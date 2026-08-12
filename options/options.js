/**
 * 设置页面逻辑
 */

// 默认配置
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

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig();
  await loadStats();
  attachEventListeners();
});

/**
 * 加载配置
 */
async function loadConfig() {
  const result = await chrome.storage.sync.get('config');
  const config = normalizeConfig(result.config);
  if (JSON.stringify(config) !== JSON.stringify(result.config || {})) {
    await chrome.storage.sync.set({ config });
  }

  // 填充表单
  document.getElementById('save-path').value = config.savePath || 'desktop';
  document.getElementById('image-format').value = config.imageFormat || 'png';
  document.getElementById('image-quality').value = config.imageQuality || 90;
  document.getElementById('quality-value').textContent = config.imageQuality || 90;
  
  // 解析颜色和透明度
  const color = config.overlayColor || '#0078ff';
  const opacity = config.overlayOpacity || 20;
  document.getElementById('overlay-color').value = color;
  document.getElementById('overlay-opacity').value = opacity;
  document.getElementById('opacity-value').textContent = opacity + '%';
  
  document.getElementById('show-dimensions').checked = config.showDimensions !== false;

  // 根据格式显示/隐藏质量设置
  toggleQualityGroup(config.imageFormat);
}

/**
 * 加载统计信息
 */
async function loadStats() {
  const result = await chrome.storage.local.get(['screenshotCount', 'totalScreenshots']);
  
  document.getElementById('session-screenshots').textContent = result.screenshotCount || 0;
  document.getElementById('total-screenshots').textContent = result.totalScreenshots || 0;
}

/**
 * 绑定事件监听器
 */
function attachEventListeners() {
  // 保存按钮
  document.getElementById('save-btn').addEventListener('click', saveConfig);
  
  // 重置按钮
  document.getElementById('reset-btn').addEventListener('click', resetConfig);
  
  // 重置统计
  document.getElementById('reset-stats').addEventListener('click', resetStats);
  
  // 快捷键链接
  document.getElementById('shortcuts-link').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });

  // 图片格式变化
  document.getElementById('image-format').addEventListener('change', (e) => {
    toggleQualityGroup(e.target.value);
  });

  // 质量滑块
  document.getElementById('image-quality').addEventListener('input', (e) => {
    document.getElementById('quality-value').textContent = e.target.value;
  });

  // 透明度滑块
  document.getElementById('overlay-opacity').addEventListener('input', (e) => {
    document.getElementById('opacity-value').textContent = e.target.value + '%';
  });
}

/**
 * 保存配置
 */
async function saveConfig() {
  const config = {
    savePath: document.getElementById('save-path').value,
    imageFormat: document.getElementById('image-format').value,
    imageQuality: parseInt(document.getElementById('image-quality').value),
    overlayColor: document.getElementById('overlay-color').value,
    overlayOpacity: parseInt(document.getElementById('overlay-opacity').value),
    showDimensions: document.getElementById('show-dimensions').checked
  };

  try {
    await chrome.storage.sync.set({ config });
    showStatus('设置已保存', false);
  } catch (error) {
    console.error('保存失败:', error);
    showStatus('保存失败: ' + error.message, true);
  }
}

/**
 * 重置配置
 */
async function resetConfig() {
  if (!confirm('确定要恢复默认设置吗？')) {
    return;
  }

  try {
    await chrome.storage.sync.set({ config: defaultConfig });
    await loadConfig();
    showStatus('已恢复默认设置', false);
  } catch (error) {
    console.error('重置失败:', error);
    showStatus('重置失败: ' + error.message, true);
  }
}

/**
 * 重置统计
 */
async function resetStats() {
  if (!confirm('确定要重置统计信息吗？')) {
    return;
  }

  try {
    await chrome.storage.local.set({ 
      screenshotCount: 0,
      totalScreenshots: 0
    });
    await loadStats();
    
    // 清除徽章
    chrome.action.setBadgeText({ text: '' });
    
    showStatus('统计已重置', false);
  } catch (error) {
    console.error('重置统计失败:', error);
    showStatus('重置失败: ' + error.message, true);
  }
}

/**
 * 显示/隐藏质量设置组
 */
function toggleQualityGroup(format) {
  const qualityGroup = document.getElementById('quality-group');
  if (format === 'jpeg') {
    qualityGroup.style.display = 'block';
  } else {
    qualityGroup.style.display = 'none';
  }
}

/**
 * 显示状态消息
 */
function showStatus(message, isError = false) {
  const statusEl = document.getElementById('status-message');
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
  statusEl.classList.add('show');

  setTimeout(() => {
    statusEl.classList.remove('show');
  }, 3000);
}
