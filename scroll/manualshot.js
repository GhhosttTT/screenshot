const params = new URLSearchParams(location.search);
const targetTabId = Number(params.get("tabId"));
const targetWindowId = Number(params.get("windowId"));
const targetTitle = params.get("title") || "page";
const autostart = params.get("autostart") === "1";

const startButton = document.getElementById("start");
const finishButton = document.getElementById("finish");
const selectRegionButton = document.getElementById("selectRegion");
const hideFixedInput = document.getElementById("hideFixed");
const contentWidthRegionInput = document.getElementById("contentWidthRegion");
const shotCount = document.getElementById("shotCount");
const rangeText = document.getElementById("rangeText");
const state = document.getElementById("state");
const bar = document.getElementById("bar");

const sampleIntervalMs = 420;
const minScrollDelta = 24;

let running = false;
let busy = false;
let shots = [];
let pollId;
let metrics;
let lastCapturedY = null;
let finishing = false;
let captureMode = null;
let modeLabel = "page";
let hasRegion = false;
let requireRegion = false;

function setState(text) {
  state.textContent = text;
}

function setProgress(value) {
  bar.style.width = `${Math.max(0, Math.min(100, value))}%`;
}

function filenameFromTitle(title) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeTitle = title
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60) || "page";
  return `manual-scrollshot-${safeTitle}-${stamp}.png`;
}

async function ensureContentScript() {
  await chrome.scripting.executeScript({
    target: { tabId: targetTabId },
    files: ["content.js"]
  });
}

function sendToTarget(payload) {
  return chrome.tabs.sendMessage(targetTabId, payload);
}

async function focusTargetTab() {
  await chrome.tabs.update(targetTabId, { active: true });
  await chrome.windows.update(targetWindowId, { focused: true });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load captured image."));
    image.src = src;
  });
}

async function captureCurrentViewport(force = false) {
  if (!running || busy) {
    return;
  }
  busy = true;
  try {
    const scroll = await sendToTarget({
      type: "SCROLLSHOT_GET_SCROLL",
      requireRegion
    });
    if (!scroll) {
      return;
    }
    if (scroll.ok === false) {
      throw new Error(scroll.error || "Selected region is not active.");
    }
    metrics = { ...metrics, ...scroll };

    const mode = scroll.mode || "page";
    if (requireRegion && !mode.startsWith("region")) {
      throw new Error("Capture switched away from the selected region.");
    }

    // 锁定模式：第一次截图后不再允许模式切换
    if (!captureMode) {
      captureMode = mode;
      console.log(`[ScrollShot] Locked capture mode: ${mode}`);
    } else if (captureMode !== mode) {
      console.warn(`[ScrollShot] Mode changed from ${captureMode} to ${mode}`);
      if (requireRegion) {
        throw new Error("Capture target changed. Select the region again and retry.");
      }
      // 非强制选区模式：模式切换时给出警告，但不清空截图
      console.warn(`[ScrollShot] Continuing with mode ${captureMode}, ignoring ${mode}`);
      return;  // 跳过这次截图，等待模式恢复
    }

    const y = Math.round(scroll.y);
    const changedEnough = lastCapturedY === null || Math.abs(y - lastCapturedY) >= minScrollDelta;
    
    console.log(`[ScrollShot] Poll: y=${y}, lastY=${lastCapturedY}, changed=${changedEnough}, crop=${JSON.stringify(scroll.crop)}`);
    
    if (!force && !changedEnough) {
      return;
    }

    const dataUrl = await chrome.tabs.captureVisibleTab(targetWindowId, { format: "png" });
    const duplicate = shots.some((shot) => Math.abs(shot.y - y) < minScrollDelta);
    if (!duplicate) {
      shots.push({
        y,
        mode,
        crop: scroll.crop,
        dataUrl,
        viewportHeight: scroll.viewportHeight,
        viewportWidth: scroll.viewportWidth
      });
      shots.sort((a, b) => a.y - b.y);
      lastCapturedY = y;
      console.log(`[ScrollShot] Captured at y=${y}, mode=${mode}, total shots=${shots.length}`);
      updateReadout();
    }
  } finally {
    busy = false;
  }
}

async function captureOrStop(force = false) {
  try {
    await captureCurrentViewport(force);
  } catch (error) {
    clearInterval(pollId);
    pollId = undefined;
    running = false;
    startButton.disabled = false;
    finishButton.disabled = true;
    selectRegionButton.disabled = false;
    hideFixedInput.disabled = false;
    contentWidthRegionInput.disabled = false;
    setState(error.message || "Capture stopped.");
    await sendToTarget({ type: "SCROLLSHOT_RESTORE" }).catch(() => {});
  }
}

function updateReadout() {
  shotCount.textContent = String(shots.length);
  if (!shots.length) {
    rangeText.textContent = "0 px";
    setProgress(0);
    return;
  }
  const first = shots[0];
  const last = shots[shots.length - 1];
  const covered = Math.round(last.y + last.viewportHeight - first.y);
  rangeText.textContent = `${covered} px`;
  modeLabel = last.mode?.startsWith("region") ? "selected region" : last.mode === "element" ? "element" : "page";
  if (metrics?.totalHeight) {
    setProgress((covered / metrics.totalHeight) * 100);
  }
  if (running) {
    setState(`Capturing ${modeLabel}. Keep scrolling, then press Alt+Shift+S to finish.`);
  }
}

async function stitchManualShots() {
  if (shots.length === 0) {
    throw new Error("No screenshots were captured.");
  }

  const scale = metrics.devicePixelRatio || 1;
  const sorted = [...shots].sort((a, b) => a.y - b.y);
  
  // 使用第一个截图的crop区域确定输出宽度
  const firstCrop = sorted[0].crop || { x: 0, y: 0, width: sorted[0].viewportWidth, height: sorted[0].viewportHeight };
  const outputCssWidth = Math.round(firstCrop.width);
  
  // 计算输出高度：基于实际截取的crop区域，而不是整个视口
  const firstY = sorted[0].y;
  const last = sorted[sorted.length - 1];
  
  // 如果是区域模式，需要计算区域的总高度
  let outputCssHeight;
  if (sorted[0].mode?.startsWith('region')) {
    // 区域模式：计算从第一个crop顶部到最后一个crop底部的高度
    const firstCropTop = sorted[0].y + (sorted[0].crop?.y || 0);
    const lastCropBottom = last.y + (last.crop?.y || 0) + (last.crop?.height || last.viewportHeight);
    outputCssHeight = Math.round(lastCropBottom - firstCropTop);
  } else {
    // 页面模式：使用整个视口高度
    outputCssHeight = Math.round(last.y + last.viewportHeight - firstY);
  }

  const maxPixels = 268_000_000;
  const pixelEstimate = outputCssWidth * outputCssHeight * scale * scale;
  if (pixelEstimate > maxPixels) {
    throw new Error("The stitched image would exceed browser canvas limits. Capture a shorter range.");
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  canvas.width = Math.round(outputCssWidth * scale);
  canvas.height = Math.round(outputCssHeight * scale);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  // 追踪已覆盖的区域（使用crop坐标系）
  let coveredBottom = sorted[0].mode?.startsWith('region') 
    ? sorted[0].y + (sorted[0].crop?.y || 0)
    : firstY;
  
  const outputStartY = coveredBottom;

  for (const shot of sorted) {
    const image = await loadImage(shot.dataUrl);
    const crop = shot.crop || { x: 0, y: 0, width: shot.viewportWidth, height: shot.viewportHeight };
    
    // 计算crop区域在页面中的实际位置
    const cropTop = shot.y + crop.y;
    const cropBottom = cropTop + crop.height;
    
    // 计算需要绘制的部分
    const drawStart = Math.max(coveredBottom, cropTop);
    const drawEnd = cropBottom;
    const drawHeight = drawEnd - drawStart;
    
    if (drawHeight <= 0) {
      continue;
    }

    // 计算源图像的裁剪区域
    const cropOffsetY = drawStart - cropTop; // crop区域内的偏移
    const sourceX = Math.round(crop.x * scale);
    const sourceY = Math.round((crop.y + cropOffsetY) * scale);
    const sourceWidth = Math.min(Math.round(crop.width * scale), image.width - sourceX);
    const sourceHeight = Math.min(
      Math.round(drawHeight * scale),
      image.height - sourceY
    );
    
    // 计算目标位置
    const destX = 0;
    const destY = Math.round((drawStart - outputStartY) * scale);

    // 绘制到canvas
    if (sourceWidth > 0 && sourceHeight > 0 && destY >= 0 && destY + sourceHeight <= canvas.height) {
      context.drawImage(
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        destX,
        destY,
        sourceWidth,
        sourceHeight
      );
      
      console.log(`[Stitch] Drew shot at y=${shot.y}, crop=${JSON.stringify(crop)}, dest=${destY}, height=${sourceHeight}`);
    }
    
    coveredBottom = Math.max(coveredBottom, cropBottom);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Could not create output image."));
      }
    }, "image/png");
  });
}

async function startSession() {
  if (running) {
    return;
  }
  await ensureContentScript();
  metrics = await sendToTarget({ type: "SCROLLSHOT_GET_METRICS" });
  const selected = await sendToTarget({ type: "SCROLLSHOT_GET_SELECTED_REGION" });
  requireRegion = hasRegion;
  if (requireRegion && !selected?.ok) {
    throw new Error("The selected region is gone. Click Select Region again.");
  }
  await sendToTarget({
    type: "SCROLLSHOT_MARK_MANUAL_START",
    hideFixed: hideFixedInput.checked
  });

  shots = [];
  lastCapturedY = null;
  captureMode = null;
  running = true;
  finishing = false;
  startButton.disabled = true;
  finishButton.disabled = false;
  selectRegionButton.disabled = true;
  hideFixedInput.disabled = true;
  contentWidthRegionInput.disabled = true;
  setState(`Capturing ${hasRegion ? "selected region" : "page"}. Scroll manually, then press Alt+Shift+S to finish.`);
  await focusTargetTab();
  await captureCurrentViewport(true);
  pollId = setInterval(() => captureOrStop(false), sampleIntervalMs);
}

async function finishSession() {
  if (!running || finishing) {
    return;
  }
  finishing = true;
  clearInterval(pollId);
  pollId = undefined;
  await captureCurrentViewport(true);
  running = false;
  startButton.disabled = true;
  finishButton.disabled = true;
  setState("Stitching and removing overlaps.");

  try {
    const blob = await stitchManualShots();
    const url = URL.createObjectURL(blob);
    await chrome.downloads.download({
      url,
      filename: filenameFromTitle(targetTitle),
      saveAs: true
    });
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    await sendToTarget({ type: "SCROLLSHOT_RESTORE" });
    setState("Saved. You can close this window.");
    setProgress(100);
  } catch (error) {
    await sendToTarget({ type: "SCROLLSHOT_RESTORE" }).catch(() => {});
    setState(error.message || "Manual screenshot failed.");
    startButton.disabled = false;
    selectRegionButton.disabled = false;
    hideFixedInput.disabled = false;
    contentWidthRegionInput.disabled = false;
  } finally {
    await chrome.runtime.sendMessage({ type: "SCROLLSHOT_CLOSED" }).catch(() => {});
  }
}

startButton.addEventListener("click", () => {
  startSession().catch((error) => {
    setState(error.message || "Could not start manual capture.");
    startButton.disabled = false;
    finishButton.disabled = true;
    hideFixedInput.disabled = false;
    contentWidthRegionInput.disabled = false;
  });
});

selectRegionButton.addEventListener("click", async () => {
  try {
    await ensureContentScript();
    setState("Drag a rectangle on the page.");
    selectRegionButton.disabled = true;
    await focusTargetTab();
    const response = await sendToTarget({ type: "SCROLLSHOT_SELECT_REGION" });
    if (response?.ok && contentWidthRegionInput.checked) {
      await sendToTarget({ type: "SCROLLSHOT_EXPAND_REGION_CONTENT_WIDTH" });
    }
    hasRegion = Boolean(response?.ok);
    requireRegion = hasRegion;
    setState(
      hasRegion
        ? `Region selected${contentWidthRegionInput.checked ? " with content width" : ""}. Click Start, then scroll.`
        : "Region selection cancelled."
    );
  } catch (error) {
    setState(error.message || "Could not select region.");
  } finally {
    selectRegionButton.disabled = false;
  }
});

finishButton.addEventListener("click", () => {
  finishSession();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "SCROLLSHOT_FINISH") {
    if (running) {
      finishSession();
    } else {
      startSession();
    }
  }
});

chrome.windows.getCurrent().then((win) => {
  chrome.runtime.sendMessage({
    type: "SCROLLSHOT_OPENED",
    windowId: win.id,
    tabId: targetTabId
  });
});

window.addEventListener("beforeunload", () => {
  if (running) {
    sendToTarget({ type: "SCROLLSHOT_RESTORE" }).catch(() => {});
  }
  chrome.runtime.sendMessage({ type: "SCROLLSHOT_CLOSED" }).catch(() => {});
});

if (autostart) {
  startSession().catch((error) => {
    setState(error.message || "Could not start manual capture.");
  });
}
