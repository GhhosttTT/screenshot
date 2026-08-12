/**
 * Popup Script - 閲嶆柊璁捐鐗?
 * 绠＄悊涓夊ぇ鍔熻兘锛氬揩閫熸埅鍥俱€佹粴鍔ㄩ暱鍥俱€佽棰戝綍鍒?
 */

// DOM 鍏冪礌
const quickCountEl = document.getElementById('quick-count');
const scrollCountEl = document.getElementById('scroll-count');
const activateRegionBtn = document.getElementById('activate-region-btn');
const openScrollConsoleBtn = document.getElementById('open-scroll-console-btn');
const openRecorderBtn = document.getElementById('open-recorder-btn');
const settingsBtn = document.getElementById('settings-btn');
const helpBtn = document.getElementById('help-btn');
const recordAudioCheckbox = document.getElementById('record-audio');

// 閫夐」鍗″垏鎹?
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const targetTab = btn.dataset.tab;
    
    // 绉婚櫎鎵€鏈夋縺娲荤姸鎬?
    tabBtns.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    
    // 婵€娲诲綋鍓嶉€夐」鍗?
    btn.classList.add('active');
    document.getElementById(`tab-${targetTab}`).classList.add('active');
  });
});

// 鍔犺浇缁熻鏁版嵁
async function loadStats() {
  try {
    const result = await chrome.storage.local.get(['quickScreenshotCount', 'scrollScreenshotCount']);
    quickCountEl.textContent = result.quickScreenshotCount || 0;
    scrollCountEl.textContent = result.scrollScreenshotCount || 0;
  } catch (error) {
    console.error('鍔犺浇缁熻鏁版嵁澶辫触:', error);
  }
}

// 鑾峰彇褰撳墠婵€娲荤殑鏍囩椤?
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

// 蹇€熸埅鍥?- 婵€娲诲尯鍩熼€夋嫨鍣?
activateRegionBtn.addEventListener('click', async () => {
  try {
    const tab = await getActiveTab();
    
    // 鍙戦€佹秷鎭粰 background 婵€娲诲尯鍩熼€夋嫨鍣?
    await chrome.runtime.sendMessage({
      type: 'TOGGLE_OVERLAY',
      tabId: tab.id
    });
    
    window.close();
  } catch (error) {
    alert(error.message || 'Could not activate region selector.');
  }
});

// 婊氬姩闀垮浘 - 鎵撳紑鎺у埗鍙?
openScrollConsoleBtn.addEventListener('click', async () => {
  try {
    const tab = await getActiveTab();
    
    // 鍙戦€佹秷鎭粰 background 鎵撳紑婊氬姩鎴浘鎺у埗鍙?
    await chrome.runtime.sendMessage({
      type: 'OPEN_SCROLL_CONSOLE',
      tabId: tab.id,
      windowId: tab.windowId,
      title: tab.title || 'page'
    });
    
    window.close();
  } catch (error) {
    alert(error.message || 'Could not open scroll capture console.');
  }
});

// 瑙嗛褰曞埗 - 鎵撳紑褰曞埗鍣?
openRecorderBtn.addEventListener('click', async () => {
  try {
    const tab = await getActiveTab();
    const includeAudio = recordAudioCheckbox.checked;
    
    // 鑾峰彇濯掍綋娴?ID
    const streamId = await chrome.tabCapture.getMediaStreamId({ 
      targetTabId: tab.id 
    });
    
    // 鎵撳紑褰曞埗鍣ㄧ獥鍙?
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
    alert(error.message || 'Could not open recorder.');
  }
});

// 璁剧疆鎸夐挳
settingsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

// 甯姪鎸夐挳
helpBtn.addEventListener('click', () => {
  const helpText = `
Screenshot Pro - 浣跨敤甯姪

銆愬揩閫熸埅鍥炬ā寮忋€?
1. 鎸?Ctrl+Shift+Q 婵€娲诲尯鍩熼€夋嫨鍣?
2. 鎷栨嫿榧犳爣閫夋嫨鎴浘鍖哄煙
3. 鎸?Ctrl+Shift+S 蹇€熸埅鍥?
4. 鎸?Ctrl+Shift+K 閿佸畾鍖哄煙锛堝彲鐐瑰嚮涓嬫柟鍏冪礌锛?
5. 鎸?Ctrl+Shift+X 娓呴櫎鍖哄煙

銆愭粴鍔ㄩ暱鍥炬ā寮忋€?
1. 鐐瑰嚮"鎵撳紑婊氬姩鎴浘鎺у埗鍙?
2. 鍙€夛細妗嗛€夊尯鍩?
3. 鐐瑰嚮 Start锛屾墜鍔ㄦ粴鍔ㄩ〉闈?
4. 鎸?Alt+Shift+S 瀹屾垚骞舵嫾鎺ラ暱鍥?

銆愯棰戝綍鍒舵ā寮忋€?
1. 鐐瑰嚮"鎵撳紑褰曞埗鎺у埗鍙?
2. 鐐瑰嚮寮€濮嬪綍鍒?
3. 鎿嶄綔椤甸潰
4. 鐐瑰嚮鍋滄骞朵繚瀛樹负 WebM

鎻愮ず锛?
- 蹇€熸埅鍥句繚瀛樺埌 PPT_Screenshots 鏂囦欢澶?
- 婊氬姩闀垮浘浼氳嚜鍔ㄥ幓閲嶅拰鎷兼帴
- 褰曞睆鍙敮鎸佹櫘閫氱綉椤碉紝涓嶆敮鎸佸彈淇濇姢椤甸潰
  `;

  alert(helpText);
});

// 鍒濆鍖?
loadStats();

// 鐩戝惉鏉ヨ嚜 background 鐨勭粺璁℃洿鏂?
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'STATS_UPDATED') {
    loadStats();
  }
});
