const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const net = require("net");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const repoRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(repoRoot, "scroll", "scrollshot-content.js");

class CdpWebSocket {
  constructor(url) {
    const parsed = new URL(url);
    this.host = parsed.hostname;
    this.port = Number(parsed.port);
    this.path = `${parsed.pathname}${parsed.search}`;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.nextId = 1;
    this.pending = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      const key = crypto.randomBytes(16).toString("base64");
      const request = [
        `GET ${this.path} HTTP/1.1`,
        `Host: ${this.host}:${this.port}`,
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Origin: http://${this.host}:${this.port}`,
        `Sec-WebSocket-Key: ${key}`,
        "Sec-WebSocket-Version: 13",
        "",
        ""
      ].join("\r\n");

      this.socket = net.createConnection(this.port, this.host, () => {
        this.socket.write(request);
      });
      this.socket.once("error", reject);
      this.socket.once("data", (chunk) => {
        const marker = Buffer.from("\r\n\r\n");
        const index = chunk.indexOf(marker);
        const responseHead = index === -1 ? chunk.toString("utf8") : chunk.slice(0, index).toString("utf8");
        if (index === -1 || !/^HTTP\/\d(?:\.\d)? 101\b/.test(responseHead)) {
          reject(new Error(`Chrome did not accept websocket upgrade: ${responseHead}`));
          return;
        }
        this.socket.removeListener("error", reject);
        this.buffer = chunk.slice(index + marker.length);
        this.socket.on("data", (data) => {
          this.buffer = Buffer.concat([this.buffer, data]);
          this.readFrames();
        });
        this.socket.on("error", (error) => {
          for (const { reject: rejectCall } of this.pending.values()) {
            rejectCall(error);
          }
          this.pending.clear();
        });
        this.readFrames();
        resolve();
      });
    });
  }

  send(method, params = {}, sessionId = null) {
    const id = this.nextId++;
    const message = { id, method, params };
    if (sessionId) {
      message.sessionId = sessionId;
    }
    const payload = JSON.stringify(message);
    this.writeFrame(payload);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  close() {
    this.socket?.destroy();
  }

  writeFrame(payload) {
    const data = Buffer.from(payload);
    const mask = crypto.randomBytes(4);
    let header;
    if (data.length < 126) {
      header = Buffer.from([0x81, 0x80 | data.length]);
    } else if (data.length < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(data.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(data.length), 2);
    }

    const masked = Buffer.alloc(data.length);
    for (let i = 0; i < data.length; i += 1) {
      masked[i] = data[i] ^ mask[i % 4];
    }
    this.socket.write(Buffer.concat([header, mask, masked]));
  }

  readFrames() {
    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const opcode = first & 0x0f;
      let length = this.buffer[1] & 0x7f;
      let offset = 2;

      if (length === 126) {
        if (this.buffer.length < offset + 2) return;
        length = this.buffer.readUInt16BE(offset);
        offset += 2;
      } else if (length === 127) {
        if (this.buffer.length < offset + 8) return;
        length = Number(this.buffer.readBigUInt64BE(offset));
        offset += 8;
      }

      const masked = Boolean(this.buffer[1] & 0x80);
      let mask;
      if (masked) {
        if (this.buffer.length < offset + 4) return;
        mask = this.buffer.slice(offset, offset + 4);
        offset += 4;
      }

      if (this.buffer.length < offset + length) return;
      let payload = this.buffer.slice(offset, offset + length);
      this.buffer = this.buffer.slice(offset + length);

      if (masked) {
        payload = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
      }
      if (opcode === 0x1) {
        this.handleMessage(JSON.parse(payload.toString("utf8")));
      }
    }
  }

  handleMessage(message) {
    if (!message.id || !this.pending.has(message.id)) {
      return;
    }
    const { resolve, reject } = this.pending.get(message.id);
    this.pending.delete(message.id);
    if (message.error) {
      reject(new Error(message.error.message));
    } else {
      resolve(message.result);
    }
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForExit(process, timeoutMs = 3000) {
  if (process.exitCode !== null || process.signalCode !== null) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    process.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        resolve(JSON.parse(body));
      });
    }).on("error", reject);
  });
}

async function waitForChrome(port) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      return await getJson(`http://127.0.0.1:${port}/json/version`);
    } catch {
      await wait(150);
    }
  }
  throw new Error("Timed out waiting for Chrome remote debugging endpoint.");
}

async function evaluate(cdp, expression, awaitPromise = false) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Runtime.evaluate failed");
  }
  return result.result.value;
}

async function main() {
  assert.ok(fs.existsSync(chromePath), `Chrome not found at ${chromePath}`);

  const port = 9300 + Math.floor(Math.random() * 400);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "scrollshot-browser-"));
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${port}`,
    "--remote-allow-origins=*",
    `--user-data-dir=${profile}`,
    "about:blank"
  ], { stdio: "ignore" });

  let cdp;
  try {
    const version = await waitForChrome(port);
    cdp = new CdpWebSocket(version.webSocketDebuggerUrl);
    await cdp.connect();

    const target = await cdp.send("Target.createTarget", {
      url: "about:blank"
    });
    const attached = await cdp.send("Target.attachToTarget", {
      targetId: target.targetId,
      flatten: true
    });
    const sessionId = attached.sessionId;

    const send = (method, params = {}) => cdp.send(method, params, sessionId);
    await send("Runtime.enable");
    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 1200,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false
    });

    const html = `<!doctype html>
      <style>
        body { margin: 0; }
        #scroller {
          position: absolute;
          left: 80px;
          top: 100px;
          width: 460px;
          height: 560px;
          overflow-y: auto;
          background: white;
        }
        .item { height: 80px; border-bottom: 1px solid #ccc; }
        #fixed-widget {
          position: fixed;
          right: 12px;
          top: 300px;
          width: 90px;
          height: 140px;
          z-index: 20;
          background: red;
        }
        #edge-iframe {
          position: absolute;
          right: 0;
          bottom: 24px;
          width: 90px;
          height: 110px;
          z-index: 2000;
          background: blue;
        }
      </style>
      <div id="scroller">
        ${Array.from({ length: 30 }, (_, index) => `<div class="item">slide row ${index}</div>`).join("")}
      </div>
      <div id="fixed-widget"></div>
      <iframe id="edge-iframe"></iframe>`;
    await send("Page.navigate", {
      url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
    });
    await wait(500);

    await send("Runtime.evaluate", {
      expression: `
        window.__scrollshotHandlers = [];
        window.chrome = {
          runtime: {
            onMessage: {
              addListener(fn) { window.__scrollshotHandlers.push(fn); }
            }
          }
        };
      `
    });

    const source = fs.readFileSync(scriptPath, "utf8");
    await send("Runtime.evaluate", { expression: source });
    await send("Runtime.evaluate", {
      expression: `
        window.__sendScrollshot = (message) => new Promise((resolve) => {
          const keepAlive = window.__scrollshotHandlers[0](message, {}, resolve);
          if (!keepAlive) resolve(undefined);
        });
      `
    });

    await send("Runtime.evaluate", {
      expression: `
        window.__selectionPromise = window.__sendScrollshot({ type: "SCROLLSHOT_SELECT_REGION" })
          .then((result) => { window.__selectionResult = result; });
      `
    });
    await send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: 100,
      y: 120,
      button: "left",
      clickCount: 1
    });
    await send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: 500,
      y: 620,
      button: "left"
    });
    await send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: 500,
      y: 620,
      button: "left",
      clickCount: 1
    });

    await wait(200);
    const selected = await send("Runtime.evaluate", {
      expression: "window.__selectionPromise.then(() => window.__selectionResult)",
      awaitPromise: true,
      returnByValue: true
    });
    assert.deepStrictEqual(selected.result.value, {
      ok: true,
      region: { x: 100, y: 120, width: 400, height: 500 }
    });

    const hidden = await send("Runtime.evaluate", {
      expression: `
        window.__sendScrollshot({ type: 'SCROLLSHOT_MARK_MANUAL_START', hideFixed: true })
          .then(() => ({
            fixed: getComputedStyle(document.getElementById('fixed-widget')).visibility,
            edge: getComputedStyle(document.getElementById('edge-iframe')).visibility
          }))
      `,
      awaitPromise: true,
      returnByValue: true
    });
    assert.deepStrictEqual(hidden.result.value, {
      fixed: "hidden",
      edge: "hidden"
    });

    await send("Runtime.evaluate", {
      expression: "document.getElementById('scroller').scrollTop = 240"
    });
    const scroll = await send("Runtime.evaluate", {
      expression: "window.__sendScrollshot({ type: 'SCROLLSHOT_GET_SCROLL', requireRegion: true })",
      awaitPromise: true,
      returnByValue: true
    });

    assert.strictEqual(scroll.result.value.ok, true);
    assert.strictEqual(scroll.result.value.mode, "region-element");
    assert.strictEqual(scroll.result.value.y, 240);
    assert.strictEqual(scroll.result.value.viewportHeight, 500);
    assert.ok(scroll.result.value.totalHeight > 560);
    assert.deepStrictEqual(scroll.result.value.crop, { x: 100, y: 120, width: 400, height: 500 });

    const expanded = await send("Runtime.evaluate", {
      expression: "window.__sendScrollshot({ type: 'SCROLLSHOT_EXPAND_REGION_CONTENT_WIDTH' })",
      awaitPromise: true,
      returnByValue: true
    });
    assert.strictEqual(expanded.result.value.ok, true);
    assert.deepStrictEqual(expanded.result.value.region, { x: 80, y: 120, width: 460, height: 500 });

    const restored = await send("Runtime.evaluate", {
      expression: `
        window.__sendScrollshot({ type: 'SCROLLSHOT_RESTORE' })
          .then(() => ({
            fixed: getComputedStyle(document.getElementById('fixed-widget')).visibility,
            edge: getComputedStyle(document.getElementById('edge-iframe')).visibility
          }))
      `,
      awaitPromise: true,
      returnByValue: true
    });
    assert.deepStrictEqual(restored.result.value, {
      fixed: "visible",
      edge: "visible"
    });

    console.log("scrollshot browser flow ok");
  } finally {
    cdp?.close();
    chrome.kill();
    await waitForExit(chrome);
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Could not remove temp Chrome profile: ${error.message}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
