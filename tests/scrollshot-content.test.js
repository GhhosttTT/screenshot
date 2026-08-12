const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.listeners = new Map();
    this.style = {};
    this.dataset = {};
    this.attributes = {};
    this.id = "";
    this.className = "";
    this.scrollTop = 0;
    this.scrollHeight = 0;
    this.clientHeight = 0;
    this._rect = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }

  set innerHTML(value) {
    this.children = [];
    if (value.includes("scrollshot-hint")) {
      const hint = new FakeElement("div");
      hint.className = "scrollshot-hint";
      this.appendChild(hint);
    }
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (!this.parentElement) {
      return;
    }
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(listener);
  }

  dispatchEvent(event) {
    event.target ||= this;
    for (const listener of this.listeners.get(event.type) || []) {
      listener(event);
    }
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === "id") {
      this.id = String(value);
    }
  }

  closest(selector) {
    if (selector.startsWith("#")) {
      let current = this;
      while (current) {
        if (current.id === selector.slice(1)) {
          return current;
        }
        current = current.parentElement;
      }
    }
    return null;
  }

  querySelector(selector) {
    const className = selector.startsWith(".") ? selector.slice(1) : selector;
    const stack = [...this.children];
    while (stack.length) {
      const element = stack.shift();
      if (String(element.className).split(/\s+/).includes(className)) {
        return element;
      }
      stack.push(...element.children);
    }
    return null;
  }

  getBoundingClientRect() {
    return this._rect;
  }
}

class FakeDocument {
  constructor() {
    this.documentElement = new FakeElement("html");
    this.body = new FakeElement("body");
    this.documentElement.appendChild(this.body);
    this.listeners = new Map();
    this.pointElements = [];
    this.allBodyElements = [];
    this.scrollingElement = {
      scrollTop: 0,
      scrollHeight: 2000
    };
  }

  createElement(tagName) {
    return new FakeElement(tagName);
  }

  getElementById(id) {
    const stack = [this.documentElement];
    while (stack.length) {
      const element = stack.shift();
      if (element.id === id) {
        return element;
      }
      stack.push(...element.children);
    }
    return null;
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(listener);
  }

  removeEventListener(type, listener) {
    this.listeners.set(
      type,
      (this.listeners.get(type) || []).filter((item) => item !== listener)
    );
  }

  dispatchEvent(event) {
    for (const listener of this.listeners.get(event.type) || []) {
      listener(event);
    }
  }

  elementsFromPoint() {
    return this.pointElements;
  }

  querySelectorAll(selector) {
    if (selector === "body *") {
      return this.allBodyElements;
    }
    return [];
  }
}

function event(type, x, y, target) {
  return {
    type,
    clientX: x,
    clientY: y,
    target,
    preventDefault() {},
    stopPropagation() {}
  };
}

function sendMessage(handler, message) {
  return new Promise((resolve) => {
    const keepAlive = handler(message, {}, resolve);
    if (!keepAlive) {
      resolve(undefined);
    }
  });
}

async function main() {
  const document = new FakeDocument();
  const window = {
    innerWidth: 1200,
    innerHeight: 800,
    devicePixelRatio: 1
  };
  const listeners = [];
  const chrome = {
    runtime: {
      onMessage: {
        addListener(listener) {
          listeners.push(listener);
        }
      }
    }
  };

  global.window = window;
  global.document = document;
  global.chrome = chrome;
  global.getComputedStyle = (element) => ({
    overflowY: element._overflowY || "visible",
    position: element._position || "static",
    display: element.style.display || "block",
    visibility: element.style.visibility || "visible",
    opacity: element.style.opacity || "1",
    zIndex: element._zIndex || element.style.zIndex || "auto"
  });

  const source = fs.readFileSync(
    path.join(__dirname, "..", "scroll", "scrollshot-content.js"),
    "utf8"
  );
  vm.runInThisContext(source, { filename: "scrollshot-content.js" });

  assert.strictEqual(listeners.length, 1, "scrollshot content script should register one message listener");
  const handler = listeners[0];

  const selectionPromise = sendMessage(handler, { type: "SCROLLSHOT_SELECT_REGION" });
  const overlay = document.getElementById("scrollshot-region-overlay");
  assert.ok(overlay, "selection overlay should be created");

  overlay.dispatchEvent(event("mousedown", 100, 120, overlay));
  document.dispatchEvent(event("mousemove", 500, 620, overlay));
  document.dispatchEvent(event("mouseup", 500, 620, overlay));

  const selected = await selectionPromise;
  assert.deepStrictEqual(selected, {
    ok: true,
    region: { x: 100, y: 120, width: 400, height: 500 }
  });

  const scroller = new FakeElement("div");
  scroller._overflowY = "auto";
  scroller.scrollTop = 240;
  scroller.scrollHeight = 1600;
  scroller.clientHeight = 500;
  scroller._rect = { left: 80, top: 100, right: 540, bottom: 660, width: 460, height: 560 };
  document.body.appendChild(scroller);
  document.pointElements = [scroller];
  const fixedWidget = new FakeElement("div");
  fixedWidget._position = "fixed";
  fixedWidget.style.visibility = "visible";
  fixedWidget.style.pointerEvents = "auto";
  fixedWidget._rect = { left: 1100, top: 320, right: 1180, bottom: 460, width: 80, height: 140 };
  document.body.appendChild(fixedWidget);

  const edgeWidget = new FakeElement("iframe");
  edgeWidget._position = "absolute";
  edgeWidget._zIndex = "2000";
  edgeWidget.style.visibility = "visible";
  edgeWidget.style.pointerEvents = "auto";
  edgeWidget._rect = { left: 1120, top: 650, right: 1200, bottom: 760, width: 80, height: 110 };
  document.body.appendChild(edgeWidget);

  document.allBodyElements = [scroller, fixedWidget, edgeWidget];

  await sendMessage(handler, {
    type: "SCROLLSHOT_MARK_MANUAL_START",
    hideFixed: true
  });
  assert.strictEqual(fixedWidget.style.visibility, "hidden");
  assert.strictEqual(fixedWidget.style.pointerEvents, "none");
  assert.strictEqual(edgeWidget.style.visibility, "hidden");
  assert.strictEqual(edgeWidget.style.pointerEvents, "none");

  const scroll = await sendMessage(handler, {
    type: "SCROLLSHOT_GET_SCROLL",
    requireRegion: true
  });

  assert.strictEqual(scroll.ok, true);
  assert.strictEqual(scroll.mode, "region-element");
  assert.strictEqual(scroll.y, 240);
  assert.strictEqual(scroll.viewportHeight, 500);
  assert.strictEqual(scroll.totalHeight, 1600);
  assert.deepStrictEqual(scroll.crop, { x: 100, y: 120, width: 400, height: 500 });
  assert.ok(scroll.scrollKey.startsWith("scrollshot-"));

  const expanded = await sendMessage(handler, {
    type: "SCROLLSHOT_EXPAND_REGION_CONTENT_WIDTH"
  });
  assert.strictEqual(expanded.ok, true);
  assert.strictEqual(expanded.region.x, 80);
  assert.strictEqual(expanded.region.width, 460);

  await sendMessage(handler, { type: "SCROLLSHOT_RESTORE" });
  assert.strictEqual(fixedWidget.style.visibility, "visible");
  assert.strictEqual(fixedWidget.style.pointerEvents, "auto");
  assert.strictEqual(edgeWidget.style.visibility, "visible");
  assert.strictEqual(edgeWidget.style.pointerEvents, "auto");
  assert.strictEqual(document.getElementById("scrollshot-region-overlay"), null);

  console.log("scrollshot content flow ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
