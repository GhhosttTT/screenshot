const params = new URLSearchParams(location.search);
const targetTabId = Number(params.get("tabId"));
const targetWindowId = Number(params.get("windowId"));
const targetTitle = params.get("title") || "page";
const autostart = params.get("autostart") === "1";

const startButton = document.getElementById("start");
const finishButton = document.getElementById("finish");
const selectRegionButton = document.getElementById("selectRegion");
const shotCount = document.getElementById("shotCount");
const rangeText = document.getElementById("rangeText");
const state = document.getElementById("state");
const bar = document.getElementById("bar");

// 从URL获取hideFixed参数
const hideFixedFromUrl = params.get("hideFixed") === "1";

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
      console.log(`[ScrollShot] Captured shot #${shots.length}: scrollY=${y}, mode=${mode}, crop=`, scroll.crop);
      updateReadout();
    } else {
      console.log(`[ScrollShot] Skipped duplicate at y=${y}`);
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
  
  let covered;
  let totalHeight;
  
  if (first.mode === "region" && first.crop && last.crop) {
    // 区域模式：计算crop区域覆盖的页面范围
    // crop.y 是视口坐标，shot.y 是页面滚动位置
    // 所以 crop 在页面中的位置 = shot.y + crop.y
    
    const firstCropPageTop = first.y + first.crop.y;
    const firstCropPageBottom = firstCropPageTop + first.crop.height;
    
    const lastCropPageTop = last.y + last.crop.y;
    const lastCropPageBottom = lastCropPageTop + last.crop.height;
    
    // 已覆盖范围：从第一个crop顶部到最后一个crop底部
    covered = Math.round(lastCropPageBottom - firstCropPageTop);
    
    // 总高度：选区的总高度
    totalHeight = metrics?.selectedRegionHeight || covered;
    
    console.log(`[UpdateReadout] Region: first(${firstCropPageTop}-${firstCropPageBottom}), last(${lastCropPageTop}-${lastCropPageBottom}), covered=${covered}, total=${totalHeight}`);
  } else {
    // 页面模式：使用整个视口高度
    covered = Math.round(last.y + last.viewportHeight - first.y);
    totalHeight = metrics?.totalHeight || covered;
  }
  
  rangeText.textContent = `${covered} px`;
  modeLabel = last.mode?.startsWith("region") ? "selected region" : last.mode === "element" ? "element" : "page";
  
  // 计算进度
  if (totalHeight > 0) {
    const progress = Math.min(100, (covered / totalHeight) * 100);
    setProgress(progress);
    console.log(`[UpdateReadout] Progress: ${progress.toFixed(1)}% (${covered}/${totalHeight})`);
  }
  
  if (running) {
    setState(`Capturing ${modeLabel}. Keep scrolling, then press Alt+Shift+S to finish.`);
  }
}

async function stitchManualShots() {
  if (shots.length === 0) {
    throw new Error("No screenshots were captured.");
  }

  console.log(`[Stitch] Starting with ${shots.length} shots`);

  const scale = metrics.devicePixelRatio || 1;
  const sorted = [...shots].sort((a, b) => a.y - b.y);
  
  // 使用第一个截图的crop区域确定输出宽度
  const firstCrop = sorted[0].crop || { x: 0, y: 0, width: sorted[0].viewportWidth, height: sorted[0].viewportHeight };
  const outputCssWidth = Math.round(firstCrop.width);
  
  console.log(`[Stitch] Output width: ${outputCssWidth}px`);
  
  // 计算输出高度：从第一个截图的crop顶部到最后一个截图的crop底部
  const firstShot = sorted[0];
  const lastShot = sorted[sorted.length - 1];
  
  // 第一个crop在页面中的绝对位置
  const firstCropPageY = firstShot.y + firstCrop.y;
  // 最后一个crop在页面中的绝对位置  
  const lastCrop = lastShot.crop || { x: 0, y: 0, width: lastShot.viewportWidth, height: lastShot.viewportHeight };
  const lastCropPageY = lastShot.y + lastCrop.y;
  const lastCropPageBottom = lastCropPageY + lastCrop.height;
  
  const outputCssHeight = Math.round(lastCropPageBottom - firstCropPageY);
  
  console.log(`[Stitch] First crop Y: ${firstCropPageY}, Last crop bottom: ${lastCropPageBottom}, Output height: ${outputCssHeight}px`);

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

  console.log(`[Stitch] Canvas size: ${canvas.width} x ${canvas.height} (CSS: ${outputCssWidth} x ${outputCssHeight})`);

  // 追踪已覆盖到的页面位置（页面绝对坐标）
  let coveredPageBottom = firstCropPageY;

  for (let i = 0; i < sorted.length; i++) {
    const shot = sorted[i];
    const image = await loadImage(shot.dataUrl);
    const crop = shot.crop || { x: 0, y: 0, width: shot.viewportWidth, height: shot.viewportHeight };
    
    // crop在页面中的绝对位置
    const cropPageTop = shot.y + crop.y;
    const cropPageBottom = cropPageTop + crop.height;
    
    // 计算需要绘制的部分（避免重叠）
    const drawPageTop = Math.max(coveredPageBottom, cropPageTop);
    const drawPageBottom = cropPageBottom;
    const drawHeight = drawPageBottom - drawPageTop;
    
    if (drawHeight <= 0) {
      console.log(`[Stitch] Shot ${i}: skipped (already covered)`);
      continue;
    }

    // 计算在crop内的偏移量
    const offsetInCrop = drawPageTop - cropPageTop;
    
    // 源图像的裁剪区域（像素坐标）
    const sourceX = Math.round(crop.x * scale);
    const sourceY = Math.round((crop.y + offsetInCrop) * scale);
    const sourceWidth = Math.round(crop.width * scale);
    const sourceHeight = Math.round(drawHeight * scale);
    
    // 目标位置（相对于输出canvas的顶部）
    const destX = 0;
    const destY = Math.round((drawPageTop - firstCropPageY) * scale);

    console.log(`[Stitch] Shot ${i}: pageY=${shot.y}, crop=(${crop.x},${crop.y},${crop.width}x${crop.height}), draw from ${drawPageTop} to ${drawPageBottom}, dest=${destY}`);

    // 绘制到canvas
    if (sourceWidth > 0 && sourceHeight > 0 && sourceX >= 0 && sourceY >= 0 && sourceX + sourceWidth <= image.width && sourceY + sourceHeight <= image.height) {
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
    } else {
      console.warn(`[Stitch] Shot ${i}: invalid source region, skipping`);
    }
    
    coveredPageBottom = Math.max(coveredPageBottom, cropPageBottom);
  }

  console.log(`[Stitch] Complete. Final canvas: ${canvas.width} x ${canvas.height}`);

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
  
  // 如果有选区，保存选区高度到metrics中
  if (selected?.ok && selected.region) {
    metrics.selectedRegionHeight = selected.region.height;
    console.log(`[StartSession] Selected region: width=${selected.region.width}, height=${selected.region.height}`);
    console.log(`[StartSession] Viewport: width=${metrics.viewportWidth}, height=${metrics.viewportHeight}`);
    
    // 警告：如果选区高度小于视口高度，一次截图就能完成
    if (selected.region.height <= metrics.viewportHeight) {
      console.warn(`[StartSession] Selected region height (${selected.region.height}px) is less than viewport height (${metrics.viewportHeight}px). Single shot will capture the entire region.`);
    }
  }
  await sendToTarget({
    type: "SCROLLSHOT_MARK_MANUAL_START",
    hideFixed: hideFixedFromUrl
  });

  shots = [];
  lastCapturedY = null;
  captureMode = null;
  running = true;
  finishing = false;
  startButton.disabled = true;
  finishButton.disabled = false;
  selectRegionButton.disabled = true;
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
  } finally {
    await chrome.runtime.sendMessage({ type: "SCROLLSHOT_CLOSED" }).catch(() => {});
  }
}

startButton.addEventListener("click", () => {
  startSession().catch((error) => {
    setState(error.message || "Could not start manual capture.");
    startButton.disabled = false;
    finishButton.disabled = true;
  });
});

selectRegionButton.addEventListener("click", async () => {
  try {
    await ensureContentScript();
    setState("Drag a rectangle on the page to select the area.");
    selectRegionButton.disabled = true;
    await focusTargetTab();
    const response = await sendToTarget({ type: "SCROLLSHOT_SELECT_REGION" });
    hasRegion = Boolean(response?.ok);
    requireRegion = hasRegion;
    if (hasRegion) {
      console.log('[ManualShot] Region selected:', response.region);
      setState("Region selected. Click Start, then scroll manually.");
    } else {
      setState(response?.error || "Region selection cancelled.");
    }
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
