(() => {
  const API_VERSION = "scrollshot-content-1";
  const OVERLAY_ID = "scrollshot-region-overlay";
  const STYLE_ID = "scrollshot-region-style";
  const MIN_REGION_SIZE = 50;

  if (window.__scrollshotApi?.version === API_VERSION) {
    return;
  }

  window.__scrollshotApi?.destroy?.();

  const state = {
    version: API_VERSION,
    overlay: null,
    selectionBox: null,
    region: null,
    selecting: false,
    startX: 0,
    startY: 0,
    pendingSelectResponse: null,
    hiddenElements: []
  };

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${OVERLAY_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        pointer-events: auto;
        cursor: crosshair;
        background: rgba(15, 23, 42, 0.08);
        font-family: Arial, sans-serif;
      }
      #${OVERLAY_ID}[data-hidden="true"] {
        display: none;
      }
      #${OVERLAY_ID} .scrollshot-hint {
        position: fixed;
        top: 16px;
        left: 50%;
        transform: translateX(-50%);
        padding: 8px 12px;
        border-radius: 6px;
        background: rgba(17, 24, 39, 0.92);
        color: #fff;
        font-size: 13px;
        pointer-events: none;
        user-select: none;
      }
      #${OVERLAY_ID} .scrollshot-box {
        position: fixed;
        box-sizing: border-box;
        border: 2px solid rgba(14, 165, 233, 0.95);
        background: rgba(14, 165, 233, 0.12);
        box-shadow: 0 0 0 9999px rgba(15, 23, 42, 0.16);
        pointer-events: none;
      }
      #${OVERLAY_ID} .scrollshot-size {
        position: absolute;
        right: 0;
        bottom: 100%;
        margin-bottom: 4px;
        padding: 2px 6px;
        border-radius: 4px;
        background: rgba(17, 24, 39, 0.9);
        color: #fff;
        font-size: 12px;
        white-space: nowrap;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function removeOverlay() {
    state.overlay?.remove();
    state.overlay = null;
    state.selectionBox = null;
    state.selecting = false;
  }

  function resolveSelection(payload) {
    if (state.pendingSelectResponse) {
      state.pendingSelectResponse(payload);
      state.pendingSelectResponse = null;
    }
  }

  function createOverlay() {
    ensureStyle();
    removeOverlay();

    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.innerHTML = '<div class="scrollshot-hint">Drag to select the scroll capture region</div>';
    overlay.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("mouseup", onMouseUp, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.body.appendChild(overlay);
    state.overlay = overlay;
  }

  function createBox() {
    const box = document.createElement("div");
    box.className = "scrollshot-box";
    const size = document.createElement("div");
    size.className = "scrollshot-size";
    box.appendChild(size);
    state.overlay.appendChild(box);
    state.selectionBox = box;
  }

  function normalizeRegion(x1, y1, x2, y2) {
    const left = Math.max(0, Math.min(x1, x2, window.innerWidth));
    const top = Math.max(0, Math.min(y1, y2, window.innerHeight));
    const right = Math.max(left, Math.min(Math.max(x1, x2), window.innerWidth));
    const bottom = Math.max(top, Math.min(Math.max(y1, y2), window.innerHeight));

    return {
      x: Math.round(left),
      y: Math.round(top),
      width: Math.round(right - left),
      height: Math.round(bottom - top)
    };
  }

  function renderRegion(region) {
    if (!state.selectionBox) {
      createBox();
    }
    state.selectionBox.style.left = `${region.x}px`;
    state.selectionBox.style.top = `${region.y}px`;
    state.selectionBox.style.width = `${region.width}px`;
    state.selectionBox.style.height = `${region.height}px`;
    state.selectionBox.querySelector(".scrollshot-size").textContent = `${region.width} x ${region.height}`;
  }

  function onMouseDown(event) {
    if (event.target !== state.overlay) {
      return;
    }
    state.selecting = true;
    state.startX = event.clientX;
    state.startY = event.clientY;
    renderRegion(normalizeRegion(state.startX, state.startY, state.startX, state.startY));
    event.preventDefault();
    event.stopPropagation();
  }

  function onMouseMove(event) {
    if (!state.selecting) {
      return;
    }
    const region = normalizeRegion(state.startX, state.startY, event.clientX, event.clientY);
    renderRegion(region);
    event.preventDefault();
    event.stopPropagation();
  }

  function onMouseUp(event) {
    if (!state.selecting) {
      return;
    }
    state.selecting = false;
    const region = normalizeRegion(state.startX, state.startY, event.clientX, event.clientY);

    if (region.width < MIN_REGION_SIZE || region.height < MIN_REGION_SIZE) {
      state.region = null;
      removeOverlay();
      resolveSelection({ ok: false, error: "Region is too small." });
      return;
    }

    state.region = region;
    renderRegion(region);
    state.overlay.dataset.hidden = "true";
    resolveSelection({ ok: true, region });
    event.preventDefault();
    event.stopPropagation();
  }

  function onKeyDown(event) {
    if (event.key !== "Escape") {
      return;
    }
    state.region = null;
    removeOverlay();
    resolveSelection({ ok: false, cancelled: true });
  }

  function getPageScroller() {
    return document.scrollingElement || document.documentElement;
  }

  function cropFromRegion(region) {
    const x = Math.max(0, Math.min(region.x, window.innerWidth));
    const y = Math.max(0, Math.min(region.y, window.innerHeight));
    const right = Math.max(x, Math.min(region.x + region.width, window.innerWidth));
    const bottom = Math.max(y, Math.min(region.y + region.height, window.innerHeight));

    return {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(right - x),
      height: Math.round(bottom - y)
    };
  }

  function canScrollY(element) {
    if (!element || element === document.documentElement || element === document.body) {
      return false;
    }
    const style = getComputedStyle(element);
    const overflowY = style.overflowY;
    return ["auto", "scroll", "overlay"].includes(overflowY) && element.scrollHeight > element.clientHeight + 2;
  }

  function intersectionArea(a, b) {
    const left = Math.max(a.left, b.left);
    const top = Math.max(a.top, b.top);
    const right = Math.min(a.right, b.right);
    const bottom = Math.min(a.bottom, b.bottom);
    return Math.max(0, right - left) * Math.max(0, bottom - top);
  }

  function regionRect(region) {
    return {
      left: region.x,
      top: region.y,
      right: region.x + region.width,
      bottom: region.y + region.height,
      width: region.width,
      height: region.height
    };
  }

  function findScroller(region) {
    const rect = regionRect(region);
    const pointX = Math.max(0, Math.min(window.innerWidth - 1, region.x + region.width / 2));
    const pointY = Math.max(0, Math.min(window.innerHeight - 1, region.y + region.height / 2));
    const candidates = [];

    for (const element of document.elementsFromPoint(pointX, pointY)) {
      let current = element;
      while (current && current !== document.documentElement) {
        if (canScrollY(current) && !candidates.includes(current)) {
          candidates.push(current);
        }
        current = current.parentElement;
      }
    }

    if (!candidates.length) {
      for (const element of document.querySelectorAll("body *")) {
        if (!canScrollY(element)) {
          continue;
        }
        if (intersectionArea(rect, element.getBoundingClientRect()) > 0) {
          candidates.push(element);
        }
      }
    }

    candidates.sort((a, b) => {
      const aRect = a.getBoundingClientRect();
      const bRect = b.getBoundingClientRect();
      const aScore = intersectionArea(rect, aRect) + (a.scrollTop > 0 ? 1_000_000 : 0);
      const bScore = intersectionArea(rect, bRect) + (b.scrollTop > 0 ? 1_000_000 : 0);
      return bScore - aScore;
    });

    return candidates[0] || null;
  }

  function scrollKeyFor(element) {
    if (!element) {
      return "window";
    }
    if (!element.dataset.scrollshotKey) {
      element.dataset.scrollshotKey = `scrollshot-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    return element.dataset.scrollshotKey;
  }

  function getScrollState(requireRegion) {
    const pageScroller = getPageScroller();

    if (requireRegion && !state.region) {
      return { ok: false, error: "No scrollshot region selected." };
    }

    if (state.region) {
      const crop = cropFromRegion(state.region);
      const scroller = findScroller(state.region);
      if (scroller) {
        return {
          ok: true,
          mode: "region-element",
          scrollKey: scrollKeyFor(scroller),
          y: scroller.scrollTop,
          crop,
          viewportWidth: window.innerWidth,
          viewportHeight: crop.height,
          totalHeight: scroller.scrollHeight,
          devicePixelRatio: window.devicePixelRatio || 1
        };
      }

      return {
        ok: true,
        mode: "region",
        scrollKey: "window",
        y: window.scrollY || pageScroller.scrollTop || 0,
        crop,
        viewportWidth: window.innerWidth,
        viewportHeight: crop.height,
        totalHeight: pageScroller.scrollHeight,
        devicePixelRatio: window.devicePixelRatio || 1
      };
    }

    return {
      ok: true,
      mode: "page",
      scrollKey: "window",
      y: window.scrollY || pageScroller.scrollTop || 0,
      crop: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight },
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      totalHeight: pageScroller.scrollHeight,
      devicePixelRatio: window.devicePixelRatio || 1
    };
  }

  function hideFixedElements() {
    state.hiddenElements = [];
    for (const element of document.querySelectorAll("body *")) {
      if (shouldHideFloatingElement(element)) {
        hideElementForCapture(element);
      }
    }
  }

  function shouldHideFloatingElement(element) {
    if (element.closest(`#${OVERLAY_ID}`)) {
      return false;
    }
    if (element.id === "screenshot-extension-overlay") {
      return true;
    }

    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const opacity = Number.parseFloat(style.opacity || "1");
    const isVisible =
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      opacity !== 0 &&
      rect.width > 0 &&
      rect.height > 0;

    if (!isVisible) {
      return false;
    }
    if (style.position === "fixed" || style.position === "sticky") {
      return true;
    }

    const zIndex = Number.parseInt(style.zIndex, 10);
    if (!Number.isFinite(zIndex) || zIndex < 1000) {
      return false;
    }

    const nearViewportEdge =
      rect.left <= 24 ||
      rect.top <= 24 ||
      window.innerWidth - rect.right <= 24 ||
      window.innerHeight - rect.bottom <= 24;
    const smallFloatingSurface =
      rect.width <= window.innerWidth * 0.45 &&
      rect.height <= window.innerHeight * 0.45;

    return nearViewportEdge && (smallFloatingSurface || element.tagName === "IFRAME");
  }

  function hideElementForCapture(element) {
    if (state.hiddenElements.some(([saved]) => saved === element)) {
      return;
    }
    state.hiddenElements.push([element, element.style.visibility, element.style.pointerEvents]);
    element.style.visibility = "hidden";
    element.style.pointerEvents = "none";
  }

  function restoreFixedElements() {
    for (const [element, visibility, pointerEvents] of state.hiddenElements) {
      element.style.visibility = visibility;
      element.style.pointerEvents = pointerEvents;
    }
    state.hiddenElements = [];
  }

  function destroy() {
    restoreFixedElements();
    removeOverlay();
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("mouseup", onMouseUp, true);
    document.removeEventListener("keydown", onKeyDown, true);
  }

  function handleMessage(message, sender, sendResponse) {
    if (!message?.type?.startsWith("SCROLLSHOT_")) {
      return false;
    }

    if (message.type === "SCROLLSHOT_SELECT_REGION") {
      resolveSelection({ ok: false, cancelled: true });
      createOverlay();
      state.pendingSelectResponse = sendResponse;
      return true;
    }

    if (message.type === "SCROLLSHOT_EXPAND_REGION_CONTENT_WIDTH") {
      if (state.region) {
        const scroller = findScroller(state.region);
        if (scroller) {
          const rect = scroller.getBoundingClientRect();
          const x = Math.max(0, Math.round(rect.left));
          const right = Math.min(window.innerWidth, Math.round(rect.right));
          state.region = {
            ...state.region,
            x,
            width: Math.max(0, right - x)
          };
        }
      }
      sendResponse({ ok: Boolean(state.region), region: state.region });
      return true;
    }

    if (message.type === "SCROLLSHOT_GET_SELECTED_REGION") {
      sendResponse(state.region ? { ok: true, region: state.region } : { ok: false });
      return true;
    }

    if (message.type === "SCROLLSHOT_GET_METRICS") {
      sendResponse(getScrollState(false));
      return true;
    }

    if (message.type === "SCROLLSHOT_GET_SCROLL") {
      sendResponse(getScrollState(Boolean(message.requireRegion)));
      return true;
    }

    if (message.type === "SCROLLSHOT_MARK_MANUAL_START") {
      state.overlay?.setAttribute("data-hidden", "true");
      if (message.hideFixed) {
        hideFixedElements();
      }
      sendResponse({ ok: true });
      return true;
    }

    if (message.type === "SCROLLSHOT_RESTORE") {
      restoreFixedElements();
      removeOverlay();
      sendResponse({ ok: true });
      return true;
    }

    return false;
  }

  chrome.runtime.onMessage.addListener(handleMessage);

  window.__scrollshotApi = {
    version: API_VERSION,
    destroy
  };
})();
