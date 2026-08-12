/**
 * Content Script
 * 管理遮罩层和用户交互
 */

// 避免重复注入
if (window.screenshotExtensionInjected) {
  console.log('Content script already injected');
} else {
  window.screenshotExtensionInjected = true;
  console.log('Screenshot Extension content script loaded');

  class OverlayManager {
    constructor() {
      this.overlay = null;
      this.selectionBox = null;
      this.isSelecting = false;
      this.isResizing = false;
      this.isLocked = false; // 新增：锁定状态
      this.startX = 0;
      this.startY = 0;
      this.area = null;
      this.resizeHandle = null;
      this.config = null;
    }

    async init() {
      console.log('OverlayManager initializing...');
      // 获取配置
      const response = await chrome.runtime.sendMessage({ type: 'GET_CONFIG' });
      this.config = response.config || this.getDefaultConfig();
      
      this.createOverlay();
      this.attachEventListeners();
      console.log('OverlayManager initialized successfully');
    }

    createOverlay() {
      // 创建遮罩层容器
      this.overlay = document.createElement('div');
      this.overlay.id = 'screenshot-extension-overlay';
      this.overlay.className = 'screenshot-overlay-container selecting';
      
      // 创建提示文本
      const hint = document.createElement('div');
      hint.className = 'screenshot-hint';
      hint.textContent = '拖拽鼠标选择截图区域';
      this.overlay.appendChild(hint);

      // 创建新建文件夹按钮
      const newFolderBtn = document.createElement('button');
      newFolderBtn.className = 'screenshot-new-folder-btn';
      newFolderBtn.textContent = '📁 新建文件夹';
      newFolderBtn.title = '点击后，后续截图将保存到新文件夹';
      newFolderBtn.addEventListener('click', this.createNewFolder.bind(this));
      this.overlay.appendChild(newFolderBtn);

      document.body.appendChild(this.overlay);
    }

    async createNewFolder() {
      const response = await chrome.runtime.sendMessage({ type: 'NEW_FOLDER' });
      if (response.success) {
        this.showMessage(`新文件夹已创建: ${response.folderName}`);
      }
    }

    attachEventListeners() {
      // 只在遮罩层容器上监听鼠标按下事件（用于开始新选择）
      this.overlay.addEventListener('mousedown', this.onMouseDown.bind(this));
      // 鼠标移动和释放监听整个文档
      document.addEventListener('mousemove', this.onMouseMove.bind(this));
      document.addEventListener('mouseup', this.onMouseUp.bind(this));
    }

    onMouseDown(e) {
      // 如果已锁定，不处理任何鼠标事件
      if (this.isLocked) {
        return;
      }

      // 如果点击的是调整手柄
      if (e.target.classList.contains('resize-handle')) {
        this.isResizing = true;
        this.resizeHandle = e.target.dataset.position;
        this.startX = e.clientX;
        this.startY = e.clientY;
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // 如果点击的是选择框本身（移动）
      if (e.target.classList.contains('screenshot-selection-box')) {
        // 这里可以添加移动选择框的逻辑
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // 如果点击的是提示文本或其他UI元素，不处理
      if (e.target !== this.overlay) {
        return;
      }

      // 如果已经有选择框，不处理（让点击穿透到下方）
      if (this.selectionBox) {
        return;
      }

      // 开始新的选择
      this.isSelecting = true;
      this.startX = e.clientX;
      this.startY = e.clientY;

      // 创建选择框
      this.selectionBox = document.createElement('div');
      this.selectionBox.className = 'screenshot-selection-box';
      this.selectionBox.style.left = this.startX + 'px';
      this.selectionBox.style.top = this.startY + 'px';
      this.overlay.appendChild(this.selectionBox);

      e.preventDefault();
      e.stopPropagation();
    }

    onMouseMove(e) {
      // 如果已锁定，不处理鼠标移动
      if (this.isLocked) {
        return;
      }

      if (this.isResizing) {
        this.handleResize(e);
        return;
      }

      if (!this.isSelecting || !this.selectionBox) {
        return;
      }

      const currentX = e.clientX;
      const currentY = e.clientY;

      const width = Math.abs(currentX - this.startX);
      const height = Math.abs(currentY - this.startY);
      const left = Math.min(currentX, this.startX);
      const top = Math.min(currentY, this.startY);

      this.selectionBox.style.left = left + 'px';
      this.selectionBox.style.top = top + 'px';
      this.selectionBox.style.width = width + 'px';
      this.selectionBox.style.height = height + 'px';

      // 更新尺寸显示
      this.updateDimensionLabel(width, height);
    }

    onMouseUp(e) {
      if (this.isResizing) {
        this.isResizing = false;
        this.resizeHandle = null;
        return;
      }

      if (!this.isSelecting) {
        return;
      }

      this.isSelecting = false;

      // 获取最终区域
      const rect = this.selectionBox.getBoundingClientRect();
      
      // 最小尺寸检查
      if (rect.width < 50 || rect.height < 50) {
        this.selectionBox.remove();
        this.selectionBox = null;
        this.showMessage('区域太小，请重新选择（最小 50x50 像素）');
        return;
      }

      this.area = {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };

      // 添加调整手柄
      this.addResizeHandles();

      // 更新提示文本
      const hint = this.overlay.querySelector('.screenshot-hint');
      hint.textContent = '按 Ctrl+Shift+S 截图 | Ctrl+Shift+K 锁定 | Ctrl+Shift+X 清除';

      // 选择完成后，移除 selecting 类，让点击可以穿透
      this.overlay.classList.remove('selecting');

      // 保存区域到 Background
      chrome.runtime.sendMessage({
        type: 'SAVE_AREA',
        data: this.area
      });
    }

    handleResize(e) {
      if (!this.selectionBox || !this.area) return;

      const deltaX = e.clientX - this.startX;
      const deltaY = e.clientY - this.startY;

      let newX = this.area.x;
      let newY = this.area.y;
      let newWidth = this.area.width;
      let newHeight = this.area.height;

      switch (this.resizeHandle) {
        case 'top-left':
          newX += deltaX;
          newY += deltaY;
          newWidth -= deltaX;
          newHeight -= deltaY;
          break;
        case 'top-right':
          newY += deltaY;
          newWidth += deltaX;
          newHeight -= deltaY;
          break;
        case 'bottom-left':
          newX += deltaX;
          newWidth -= deltaX;
          newHeight += deltaY;
          break;
        case 'bottom-right':
          newWidth += deltaX;
          newHeight += deltaY;
          break;
        case 'top':
          newY += deltaY;
          newHeight -= deltaY;
          break;
        case 'bottom':
          newHeight += deltaY;
          break;
        case 'left':
          newX += deltaX;
          newWidth -= deltaX;
          break;
        case 'right':
          newWidth += deltaX;
          break;
      }

      // 最小尺寸限制
      if (newWidth < 50 || newHeight < 50) {
        return;
      }

      this.area = { x: newX, y: newY, width: newWidth, height: newHeight };
      this.updateSelectionBox();
      this.startX = e.clientX;
      this.startY = e.clientY;

      // 保存更新后的区域
      chrome.runtime.sendMessage({
        type: 'SAVE_AREA',
        data: this.area
      });
    }

    updateSelectionBox() {
      this.selectionBox.style.left = this.area.x + 'px';
      this.selectionBox.style.top = this.area.y + 'px';
      this.selectionBox.style.width = this.area.width + 'px';
      this.selectionBox.style.height = this.area.height + 'px';
      this.updateDimensionLabel(this.area.width, this.area.height);
    }

    addResizeHandles() {
      const positions = [
        'top-left', 'top-right', 'bottom-left', 'bottom-right',
        'top', 'bottom', 'left', 'right'
      ];

      positions.forEach(pos => {
        const handle = document.createElement('div');
        handle.className = `resize-handle resize-handle-${pos}`;
        handle.dataset.position = pos;
        this.selectionBox.appendChild(handle);
      });
    }

    updateDimensionLabel(width, height) {
      if (!this.config.showDimensions) return;

      let label = this.selectionBox.querySelector('.dimension-label');
      if (!label) {
        label = document.createElement('div');
        label.className = 'dimension-label';
        this.selectionBox.appendChild(label);
      }
      label.textContent = `${Math.round(width)} × ${Math.round(height)}`;
    }

    show() {
      if (this.overlay) {
        this.overlay.style.display = 'block';
      }
    }

    hide() {
      if (this.overlay) {
        this.overlay.style.display = 'none';
      }
    }

    clear() {
      if (this.selectionBox) {
        this.selectionBox.remove();
        this.selectionBox = null;
      }
      this.area = null;
      this.isLocked = false; // 重置锁定状态
      
      // 恢复 selecting 类，允许重新选择
      this.overlay.classList.add('selecting');
      
      const hint = this.overlay.querySelector('.screenshot-hint');
      hint.textContent = '拖拽鼠标选择截图区域';
    }

    /**
     * 锁定/解锁遮罩层（切换调整模式）
     */
    toggleLock() {
      if (!this.selectionBox) {
        this.showMessage('请先选择截图区域');
        return;
      }

      this.isLocked = !this.isLocked;

      if (this.isLocked) {
        // 锁定模式：隐藏调整手柄，让点击穿透
        this.selectionBox.classList.add('locked');
        this.showMessage('🔒 已锁定 - 可以点击页面元素（按 Ctrl+Shift+K 解锁）');
      } else {
        // 解锁模式：显示调整手柄，可以调整
        this.selectionBox.classList.remove('locked');
        this.showMessage('🔓 已解锁 - 可以调整区域大小（按 Ctrl+Shift+K 锁定）');
      }
    }

    destroy() {
      if (this.overlay) {
        this.overlay.remove();
        this.overlay = null;
      }
      this.selectionBox = null;
      this.area = null;
    }

    showMessage(text) {
      const message = document.createElement('div');
      message.className = 'screenshot-message';
      message.textContent = text;
      document.body.appendChild(message);

      setTimeout(() => message.remove(), 5000);
    }

    flashError() {
      const flash = document.createElement('div');
      flash.className = 'screenshot-flash screenshot-flash-error';
      document.body.appendChild(flash);

      setTimeout(() => flash.remove(), 300);
    }

    getDefaultConfig() {
      return {
        savePath: 'desktop',
        imageFormat: 'png',
        imageQuality: 90,
        overlayColor: 'rgba(0, 120, 255, 0.2)',
        showDimensions: true
      };
    }
  }

  // 全局实例
  let overlayManager = null;

  // 监听来自 Background 的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Content script received message:', message.type);
    
    if (message.type === 'TOGGLE_OVERLAY') {
      if (!overlayManager) {
        console.log('Creating new OverlayManager...');
        overlayManager = new OverlayManager();
        overlayManager.init();
      } else {
        if (overlayManager.overlay.style.display === 'none') {
          console.log('Showing overlay...');
          overlayManager.show();
        } else {
          console.log('Hiding overlay...');
          overlayManager.hide();
        }
      }
      sendResponse({ success: true });
    } else if (message.type === 'CLEAR_OVERLAY') {
      if (overlayManager) {
        console.log('Clearing overlay...');
        overlayManager.clear();
      }
      sendResponse({ success: true });
    } else if (message.type === 'LOCK_OVERLAY') {
      if (overlayManager) {
        console.log('Toggling lock...');
        overlayManager.toggleLock();
      }
      sendResponse({ success: true });
    } else if (message.type === 'HIDE_OVERLAY_FOR_CAPTURE') {
      if (overlayManager && overlayManager.overlay) {
        // 隐藏整个遮罩层容器（包括按钮、提示等所有UI）
        overlayManager.overlay.style.visibility = 'hidden';
      }
      sendResponse({ success: true });
    } else if (message.type === 'SHOW_OVERLAY_AFTER_CAPTURE') {
      if (overlayManager && overlayManager.overlay) {
        // 恢复显示遮罩层容器
        overlayManager.overlay.style.visibility = 'visible';
      }
      sendResponse({ success: true });
    } else if (message.type === 'CAPTURE_SUCCESS') {
      if (overlayManager) {
        console.log('Capture success.');
        overlayManager.showMessage(`截图已保存: ${message.data.filename}`);
      }
      sendResponse({ success: true });
    } else if (message.type === 'CAPTURE_ERROR') {
      if (overlayManager) {
        console.log('Capture error, showing flash...');
        overlayManager.flashError();
        overlayManager.showMessage(message.data.error || '截图失败');
      }
      sendResponse({ success: true });
    }
  });
}
