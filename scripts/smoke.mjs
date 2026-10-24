#!/usr/bin/env node
/**
 * CDP smoke test for the Clippy-board app.
 *
 * Connects to the WebView2 remote debugging port (default :9222), asserts the
 * basic UI state, then exercises hover -> preview content.
 *
 * The app must be launched by scripts/run-smoke.ps1 (or manually against a
 * fresh instance) with:
 *   WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222
 *
 * Usage:
 *   node scripts/smoke.mjs [--port 9222] [--url http://127.0.0.1:9222/json]
 */

const args = process.argv.slice(2);
const get = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const port = get("--port", "9222");
const jsonUrl = get("--url", `http://127.0.0.1:${port}/json`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const resolve = pending.get(msg.id);
      pending.delete(msg.id);
      resolve(msg);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const myId = ++id;
      pending.set(myId, resolve);
      ws.send(JSON.stringify({ id: myId, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.result?.exceptionDetails) {
      throw new Error(
        "Eval exception: " + JSON.stringify(r.result.exceptionDetails),
      );
    }
    return r.result?.result?.value;
  };
  return { ws, send, evaluate };
}

/** Wait until both webviews exist and can report their role. */
async function connectPages(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    let pages = [];
    try {
      const res = await fetch(jsonUrl);
      if (!res.ok) throw new Error(`CDP ${res.status} from ${jsonUrl}`);
      const targets = (await res.json()).filter((t) => t.type === "page");
      for (const target of targets) {
        let conn;
        try {
          conn = await connect(target);
          const isPreview = await conn.evaluate(
            "!!document.body && document.body.classList.contains('preview-window')",
          );
          pages.push({ target, conn, isPreview });
        } catch (e) {
          conn?.ws.close();
        }
      }
      const main = pages.find((p) => !p.isPreview);
      const preview = pages.find((p) => p.isPreview);
      if (main && preview) return { pages, main, preview };
      lastError = new Error(
        `found ${pages.length} page(s), need one main and one preview`,
      );
      for (const p of pages) p.conn.ws.close();
    } catch (e) {
      lastError = e;
      for (const p of pages) p.conn.ws.close();
    }
    await sleep(500);
  }

  throw new Error(
    `Timed out waiting for main + preview CDP targets${
      lastError ? `: ${lastError.message}` : ""
    }`,
  );
}

/** Invoke a Tauri command from the page. */
function invoke(conn, command, payload = {}) {
  return conn.evaluate(`(async () => {
    const tauri = window.__TAURI_INTERNALS__ ?? window.__TAURI__?.core;
    if (!tauri) throw new Error("Tauri IPC bridge not available");
    return tauri.invoke(${JSON.stringify(command)}, ${JSON.stringify(payload)});
  })()`);
}

async function main() {
  const { pages, main, preview } = await connectPages();
  for (const p of pages) {
    console.log(
      `connected ${p.target.id.slice(0, 8)} preview=${p.isPreview} title=${p.target.title}`,
    );
  }
  await main.conn.send("Runtime.enable");
  await preview.conn.send("Runtime.enable");

  // The app starts hidden in the tray. Pin it (so focus loss during the test
  // cannot auto-hide it) and show it, exactly like the tray toggle would.
  await invoke(main.conn, "set_pinned", { pinned: true });
  await invoke(main.conn, "show_window");
  await sleep(800);

  // History loads asynchronously; wait for the first render.
  let itemCount = 0;
  for (let i = 0; i < 60; i++) {
    itemCount = await main.conn.evaluate(
      "document.querySelectorAll('.history-item').length",
    );
    if (itemCount > 0) break;
    await sleep(250);
  }

  const state = JSON.parse(
    await main.conn.evaluate(`JSON.stringify((() => {
      const items = [...document.querySelectorAll('.history-item')];
      return {
        header: document.querySelector('.app-title')?.textContent,
        docTitle: document.title,
        itemCount: items.length,
        emptyDisplay: getComputedStyle(document.getElementById('empty-state')).display,
        searchValue: document.getElementById('search-input')?.value || '',
        previewWidthToken: getComputedStyle(document.documentElement)
          .getPropertyValue('--preview-width').trim(),
        dockOpen: document.getElementById('preview-panel')?.classList.contains('open') || false,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        hasPin: !!document.getElementById('pin-btn'),
        hasClear: !!document.getElementById('clear-btn'),
      };
    })())`),
  );
  console.log("main state:", JSON.stringify(state));
  if (state.header !== "Clippy-board") {
    throw new Error(`Expected header Clippy-board, got ${state.header}`);
  }
  if (state.docTitle !== "Clippy-board") {
    throw new Error(`Expected document title Clippy-board, got ${state.docTitle}`);
  }
  if (state.previewWidthToken !== "480px") {
    throw new Error(
      `Expected --preview-width 480px, got ${state.previewWidthToken}`,
    );
  }
  if (state.itemCount < 1) throw new Error("Expected at least one history item");
  if (state.emptyDisplay !== "none") {
    throw new Error(`Expected empty state hidden, got display=${state.emptyDisplay}`);
  }

  // Prefer the deterministic seeded card, fall back to the first one.
  const card = JSON.parse(
    await main.conn.evaluate(`JSON.stringify((() => {
      const el =
        document.querySelector('.history-item[data-id="smoke-text-long"]') ||
        document.querySelector('.history-item');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: r.x + r.width / 2,
        y: r.y + r.height / 2,
        id: el.dataset.id,
        text: el.innerText.slice(0, 60),
      };
    })())`),
  );
  if (!card) throw new Error("No card found");

  const sendKey = async (key) => {
    await main.conn.send("Input.dispatchKeyEvent", { type: "keyDown", key });
    await main.conn.send("Input.dispatchKeyEvent", { type: "keyUp", key });
    await sleep(200);
  };

  // Test tab cycling with Left/Right (exercises filter buttons + keyboard path)
  await main.conn.evaluate(`(() => {
    const tabs = [...document.querySelectorAll('.filter-tab')];
    tabs.forEach(t => t.classList.remove('active'));
    tabs.find(t => t.dataset.filter === 'all')?.classList.add('active');
  })()`);
  await sleep(200);
  
  await main.conn.evaluate(`document.body.focus()`);
  await sendKey("ArrowRight");
  await sleep(200);
  
  const tabState = JSON.parse(
    await main.conn.evaluate(`JSON.stringify((() => {
      const tabs = [...document.querySelectorAll('.filter-tab')];
      const active = tabs.find(t => t.classList.contains('active'));
      return { active: active?.dataset.filter, count: tabs.length };
    })())`),
  );
  console.log("tab state after ArrowRight:", JSON.stringify(tabState));
  if (!tabState.active) throw new Error("Expected an active filter tab after ArrowRight");
  
  await sendKey("ArrowLeft");
  await sleep(200);
  const tabState2 = JSON.parse(
    await main.conn.evaluate(`JSON.stringify((() => {
      const tabs = [...document.querySelectorAll('.filter-tab')];
      const active = tabs.find(t => t.classList.contains('active'));
      return { active: active?.dataset.filter };
    })())`),
  );
  console.log("tab state after ArrowLeft:", JSON.stringify(tabState2));
  if (!tabState2.active) throw new Error("Expected an active filter tab after ArrowLeft");

  // Reset to 'all' filter
  await main.conn.evaluate(`(() => {
    const tabs = [...document.querySelectorAll('.filter-tab')];
    tabs.forEach(t => t.classList.remove('active'));
    tabs.find(t => t.dataset.filter === 'all')?.classList.add('active');
  })()`);
  await sleep(300);

  // List navigation with Home/End/PageDown
  await main.conn.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: 60,
    y: 30,
    button: "none",
    pointerType: "mouse",
  });
  await sleep(100);
  await main.conn.evaluate(`document.body.focus()`);
  await sendKey("Home");
  await sendKey("PageDown");
  await sendKey("End");
  await sleep(200);
  const navState = JSON.parse(
    await main.conn.evaluate(`JSON.stringify((() => {
      const sel = document.querySelector('.history-item.selected');
      return { selectedId: sel?.dataset.id || null, count: document.querySelectorAll('.history-item').length };
    })())`),
  );
  console.log("nav state after Home/PageDown/End:", JSON.stringify(navState));
  if (!navState.selectedId) throw new Error("Expected a selected item after keyboard navigation");

  // Move mouse to trigger preview on the card
  const move = async (x, y) => {
    await main.conn.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x,
      y,
      button: "none",
      pointerType: "mouse",
    });
    await sleep(150);
  };
  await move(60, 30);
  await move(card.x, card.y);
  await move(card.x + 6, card.y + 4);

  let pstate = null;
  let dockState = null;
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    pstate = JSON.parse(
      await preview.conn.evaluate(`JSON.stringify({
        bodyText: document.getElementById('preview-body')?.innerText.slice(0, 120),
        headerText: document.getElementById('preview-header')?.innerText.slice(0, 80),
        textEls: document.querySelectorAll('.preview-text').length,
        imageEls: document.querySelectorAll('.preview-image').length,
      })`),
    );
    dockState = JSON.parse(
      await main.conn.evaluate(`JSON.stringify({
        open: document.getElementById('preview-panel')?.classList.contains('open') || false,
        bodyText: document.getElementById('preview-body')?.innerText.slice(0, 120),
        headerText: document.getElementById('preview-header')?.innerText.slice(0, 80),
        textEls: document.querySelectorAll('#preview-panel .preview-text').length,
        imageEls: document.querySelectorAll('#preview-panel .preview-image').length,
      })`),
    );
    const windowed =
      pstate.textEls + pstate.imageEls > 0 ||
      !!pstate.bodyText?.trim() ||
      !!pstate.headerText?.trim();
    const docked =
      dockState.open &&
      (dockState.textEls + dockState.imageEls > 0 ||
        !!dockState.bodyText?.trim() ||
        !!dockState.headerText?.trim());
    if (windowed || docked) break;
  }
  console.log("preview window state:", JSON.stringify(pstate));
  console.log("main dock state:", JSON.stringify(dockState));

  const windowed =
    pstate.textEls + pstate.imageEls > 0 ||
    !!pstate.bodyText?.trim() ||
    !!pstate.headerText?.trim();
  const docked =
    dockState.open &&
    (dockState.textEls + dockState.imageEls > 0 ||
      !!dockState.bodyText?.trim() ||
      !!dockState.headerText?.trim());
  if (!windowed && !docked) {
    throw new Error(
      "Preview did not render content in the separate window or the docked panel",
    );
  }

  // When the deterministic fixture is present, make sure the synthetic hover
  // actually drove the preview rather than leaving stale content behind.
  if (card.id === "smoke-text-long") {
    const body = docked ? dockState.bodyText : pstate.bodyText;
    if (!body || !body.includes("Clippy-board smoke-test")) {
      throw new Error(
        `Preview shows content from a different item: ${JSON.stringify(body)}`,
      );
    }
  }

  console.log(docked ? "SMOKE OK (docked preview)" : "SMOKE OK (window preview)");
  for (const p of pages) p.conn.ws.close();
  process.exit(0);
}

main().catch((e) => {
  console.error("SMOKE FAIL:", e.message);
  process.exit(1);
});
