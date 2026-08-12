const params = new URLSearchParams(location.search);
const targetTabId = Number(params.get("tabId"));
const targetWindowId = Number(params.get("windowId"));
const targetTitle = params.get("title") || "page";
const autostart = params.get("autostart") === "1";

const startButton = document.getElementById("start");
const finishButton = document.getElementById("finish");
const selectRegionButton = document.getElementById("selectRegion");
const contentWidthRegionInput = document.getElementById("contentWidthRegion");
const shotCount = document.getElementById("shotCount");
const rangeText = document.getElementById("rangeText");
const state = document.getElementById("state");
const bar = document.getElementById("bar");

// 从URL获取hideFixed参数

const sampleIntervalMs = 420;
const minScrollDelta = 24;

let running = false;
let busy = false;
let shots = [];
let pollId;
let metrics;
let lastCapturedPosition = null;
let finishing = false;
let captureMode = null;
let captureScrollKey = null;
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
    files: ["scroll/scrollshot-content.js"]
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
    image.onerror = () => reject(new Error("无法加载截图图像。"));
    image.src = src;
  });
}

function readImageStrip(image, crop, offsetYCss, heightCss, scale) {
  const width = Math.round(crop.width * scale);
  const height = Math.round(heightCss * scale);
  if (width <= 0 || height <= 0) {
    return null;
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  canvas.width = width;
  canvas.height = height;
  context.drawImage(
    image,
    Math.round(crop.x * scale),
    Math.round((crop.y + offsetYCss) * scale),
    width,
    height,
    0,
    0,
    width,
    height
  );
  return context.getImageData(0, 0, width, height).data;
}

function averagePixelDelta(a, b) {
  if (!a || !b || a.length !== b.length) {
    return Number.POSITIVE_INFINITY;
  }

  let total = 0;
  let samples = 0;
  for (let i = 0; i < a.length; i += 16) {
    total += Math.abs(a[i] - b[i]);
    total += Math.abs(a[i + 1] - b[i + 1]);
    total += Math.abs(a[i + 2] - b[i + 2]);
    samples += 3;
  }
  return total / Math.max(1, samples);
}

function detectVisualOverlap(previous, current, scale, expectedOverlapCss) {
  const previousCrop = previous.shot.crop;
  const currentCrop = current.shot.crop;
  if (!previousCrop || !currentCrop || previousCrop.width !== currentCrop.width) {
    return 0;
  }
  if (expectedOverlapCss < 12) {
    return 0;
  }

  const maxOverlap = Math.floor(Math.min(previousCrop.height, currentCrop.height, expectedOverlapCss + 160));
  const minOverlap = Math.max(12, Math.floor(expectedOverlapCss - 120));
  let bestOverlap = 0;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (let overlap = maxOverlap; overlap >= minOverlap; overlap -= 4) {
    const stripHeight = Math.min(48, overlap);
    const previousOffset = previousCrop.height - overlap;
    const previousStrip = readImageStrip(previous.image, previousCrop, previousOffset, stripHeight, scale);
    const currentStrip = readImageStrip(current.image, currentCrop, 0, stripHeight, scale);
    const delta = averagePixelDelta(previousStrip, currentStrip);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestOverlap = overlap;
    }
    if (delta <= 3) {
      break;
    }
  }

  return bestDelta <= 8 ? bestOverlap : 0;
}

async function captureCurrentViewport(force = false) {
  console.log(`[CaptureViewport] Called: running=${running}, busy=${busy}, force=${force}`);
  
  if (!running || busy) {
    console.log(`[CaptureViewport] Skipped: running=${running}, busy=${busy}`);
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
      throw new Error(scroll.error || "选区状态不可用。");
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
        throw new Error("捕获目标已变化，请重新选择区域。");
      }
      // 非强制选区模式：模式切换时给出警告，但不清空截图
      console.warn(`[ScrollShot] Continuing with mode ${captureMode}, ignoring ${mode}`);
      return;  // 跳过这次截图，等待模式恢复
    }

    const y = Math.round(scroll.y);
    const scrollKey = scroll.scrollKey || mode;
    if (!captureScrollKey) {
      captureScrollKey = scrollKey;
    } else if (captureScrollKey !== scrollKey) {
      if (requireRegion) {
        throw new Error("捕获目标已变化，请重新选择区域。");
      }
      return;
    }

    const changedEnough =
      lastCapturedPosition === null ||
      lastCapturedPosition.key !== scrollKey ||
      Math.abs(y - lastCapturedPosition.y) >= minScrollDelta;
    console.log(`[ScrollShot] Poll: key=${scrollKey}, y=${y}, last=${lastCapturedPosition?.y ?? "null"}, changed=${changedEnough}, crop=${JSON.stringify(scroll.crop)}`);
    if (!force && !changedEnough) {
      return;
    }

    const dataUrl = await chrome.tabs.captureVisibleTab(targetWindowId, { format: "png" });
    const duplicate = shots.some((shot) => shot.scrollKey === scrollKey && Math.abs(shot.y - y) < minScrollDelta);
    if (!duplicate) {
      shots.push({
        y,
        mode,
        scrollKey,
        crop: scroll.crop,
        dataUrl,
        viewportHeight: scroll.viewportHeight,
        viewportWidth: scroll.viewportWidth
      });
      shots.sort((a, b) => a.y - b.y);
      lastCapturedPosition = { key: scrollKey, y };
      console.log(`[ScrollShot] Captured shot #${shots.length}: key=${scrollKey}, scrollY=${y}, mode=${mode}, crop=`, scroll.crop);
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
    setState(`正在采样${modeLabel === "page" ? "整页" : "选区"}。继续滚动，完成后按 Alt+Shift+S。`);
  }
}

async function stitchManualShots() {
  if (shots.length === 0) {
    throw new Error("还没有采集到截图。");
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
  let previousDrawn = null;

  for (let i = 0; i < sorted.length; i++) {
    const shot = sorted[i];
    const image = await loadImage(shot.dataUrl);
    const crop = shot.crop || { x: 0, y: 0, width: shot.viewportWidth, height: shot.viewportHeight };
    
    // crop在页面中的绝对位置
    const cropPageTop = shot.y + crop.y;
    const cropPageBottom = cropPageTop + crop.height;
    
    // 计算需要绘制的部分（避免重叠）
    const expectedOverlap = Math.max(0, coveredPageBottom - cropPageTop);
    const visualOverlap = previousDrawn
      ? detectVisualOverlap(previousDrawn, { shot, image }, scale, expectedOverlap)
      : 0;
    const overlapCss = Math.max(expectedOverlap, visualOverlap);
    const drawPageTop = cropPageTop + overlapCss;
    const destPageTop = visualOverlap > expectedOverlap
      ? coveredPageBottom
      : Math.max(coveredPageBottom, cropPageTop);
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
    const destY = Math.round((destPageTop - firstCropPageY) * scale);

    console.log(`[Stitch] Shot ${i}: pageY=${shot.y}, crop=(${crop.x},${crop.y},${crop.width}x${crop.height}), expectedOverlap=${expectedOverlap}, visualOverlap=${visualOverlap}, draw from ${drawPageTop} to ${drawPageBottom}, dest=${destY}`);

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
    
    coveredPageBottom = Math.max(coveredPageBottom, destPageTop + drawHeight);
    previousDrawn = { shot, image };
  }

  const finalCssHeight = Math.max(1, Math.round(coveredPageBottom - firstCropPageY));
  let outputCanvas = canvas;
  if (finalCssHeight < outputCssHeight) {
    outputCanvas = document.createElement("canvas");
    outputCanvas.width = canvas.width;
    outputCanvas.height = Math.round(finalCssHeight * scale);
    outputCanvas.getContext("2d").drawImage(
      canvas,
      0,
      0,
      outputCanvas.width,
      outputCanvas.height,
      0,
      0,
      outputCanvas.width,
      outputCanvas.height
    );
  }

  console.log(`[Stitch] Complete. Final canvas: ${outputCanvas.width} x ${outputCanvas.height}`);

  return new Promise((resolve, reject) => {
    outputCanvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("无法生成输出图片。"));
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
    throw new Error("选区已失效，请重新选择区域。");
  }
  
  // 如果有选区，保存选区高度到metrics中
  if (selected?.ok && selected.region) {
    const initialScroll = await sendToTarget({
      type: "SCROLLSHOT_GET_SCROLL",
      requireRegion: true
    });
    if (initialScroll?.ok) {
      metrics = { ...metrics, ...initialScroll };
    }
    metrics.selectedRegionHeight = selected.region.height;
    console.log(`[StartSession] Selected region: width=${selected.region.width}, height=${selected.region.height}`);
    console.log(`[StartSession] Capture target: mode=${metrics.mode || "unknown"}, viewportHeight=${metrics.viewportHeight}, totalHeight=${metrics.totalHeight}`);
    
    // 警告：如果选区高度小于视口高度，一次截图就能完成
    if (metrics.totalHeight <= metrics.viewportHeight) {
      console.log(`[StartSession] Capture target height (${metrics.totalHeight}px) fits in the selected viewport (${metrics.viewportHeight}px). One shot is enough unless the content changes.`);
    }
  }
  await sendToTarget({
    type: "SCROLLSHOT_MARK_MANUAL_START",
    hideFixed: true
  });

  shots = [];
  lastCapturedPosition = null;
  captureMode = null;
  captureScrollKey = null;
  running = true;
  finishing = false;
  startButton.disabled = true;
  finishButton.disabled = false;
  selectRegionButton.disabled = true;
  
  console.log(`[StartSession] ========== SESSION STARTED ==========`);
  console.log(`[StartSession] hasRegion=${hasRegion}, requireRegion=${requireRegion}`);
  console.log(`[StartSession] sampleIntervalMs=${sampleIntervalMs}`);
  contentWidthRegionInput.disabled = true;
  setState(`正在采样${hasRegion ? "选区" : "整页"}。滚动页面后按 Alt+Shift+S 完成。`);
  await focusTargetTab();
  
  console.log(`[StartSession] Taking first screenshot...`);
  await captureCurrentViewport(true);
  
  console.log(`[StartSession] Starting polling with interval ${sampleIntervalMs}ms`);
  pollId = setInterval(() => {
    console.log(`[Poll] Timer tick, running=${running}, busy=${busy}`);
    captureOrStop(false);
  }, sampleIntervalMs);
  
  console.log(`[StartSession] PollId=${pollId}, running=${running}`);
  
  // 添加页面滚动监听（用于调试）
  window.addEventListener('message', (e) => {
    if (e.data?.type === 'PAGE_SCROLLED') {
      console.log(`[StartSession] Received scroll event from page: scrollY=${e.data.scrollY}`);
    }
  });
}

async function finishSession() {
  console.log(`[FinishSession] Called: running=${running}, finishing=${finishing}`);
  
  if (!running || finishing) {
    console.log(`[FinishSession] Aborted: running=${running}, finishing=${finishing}`);
    return;
  }
  finishing = true;
  console.log(`[FinishSession] Clearing interval ${pollId}`);
  clearInterval(pollId);
  pollId = undefined;
  
  console.log(`[FinishSession] Taking final screenshot...`);
  await captureCurrentViewport(true);
  
  running = false;
  startButton.disabled = true;
  finishButton.disabled = true;
  
  console.log(`[FinishSession] Total shots collected: ${shots.length}`);
  setState("正在拼接并移除重叠内容。");

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
    hasRegion = false;
    requireRegion = false;
    setState("已保存。可以继续选择区域，或直接开始下一张。");
    setProgress(100);
    startButton.disabled = false;
    finishButton.disabled = true;
    selectRegionButton.disabled = false;
    contentWidthRegionInput.disabled = false;
  } catch (error) {
    await sendToTarget({ type: "SCROLLSHOT_RESTORE" }).catch(() => {});
    setState(error.message || "滚动截图失败。");
    startButton.disabled = false;
    selectRegionButton.disabled = false;
    contentWidthRegionInput.disabled = false;
  } finally {
    finishing = false;
  }
}

startButton.addEventListener("click", () => {
  startSession().catch((error) => {
    setState(error.message || "无法开始滚动截图。");
    startButton.disabled = false;
    finishButton.disabled = true;
    contentWidthRegionInput.disabled = false;
  });
});

selectRegionButton.addEventListener("click", async () => {
  try {
    await ensureContentScript();
    setState("请在页面中拖拽框选区域。");
    selectRegionButton.disabled = true;
    await focusTargetTab();
    const response = await sendToTarget({ type: "SCROLLSHOT_SELECT_REGION" });
    if (response?.ok && contentWidthRegionInput.checked) {
      await sendToTarget({ type: "SCROLLSHOT_EXPAND_REGION_CONTENT_WIDTH" });
    }
    hasRegion = Boolean(response?.ok);
    requireRegion = hasRegion;
    if (hasRegion) {
      console.log('[ManualShot] Region selected:', response.region);
      setState(`已选择区域${contentWidthRegionInput.checked ? "，宽度已扩展到滚动容器" : ""}。点击开始后滚动页面。`);
    } else {
      setState(response?.error || "Region selection cancelled.");
    }
  } catch (error) {
    setState(error.message || "无法选择区域。");
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
    setState(error.message || "无法开始滚动截图。");
  });
}
