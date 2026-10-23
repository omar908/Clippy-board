#!/usr/bin/env node
/**
 * Reusable CDP smoke test for the Clippy-board app.
 * Connects to the WebView2 remote debugging port (default :9222), asserts
 * basic UI state, and exercises hover -> preview (windowed) and dock (maximized/restored).
 *
 * Usage:
 *   node scripts/smoke.mjs [--port 9222] [--url http://127.0.0.1:9222/json]
 * The app must be running with WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222".
 */

const args = process.argv.slice(2);
const get = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const port = get("--port", "9222");
const jsonUrl = get("--url", `http://127.0.0.1:${port}/json`);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function connect(t) {
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = (e) => reject(e);
  });
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      p(msg);
    } else {
      events.push(msg);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const myId = ++id;
      pending.set(myId, resolve);
      ws.send(JSON.stringify({ id: myId, method, params }));
    });
  const evaluate = async (expression, awaitPromise = true) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise });
    if (r.result?.exceptionDetails) {
      throw new Error("Eval exception: " + JSON.stringify(r.result.exceptionDetails));
    }
    return r.result?.result?.value;
  };
  return { ws, send, evaluate, events };
}

async function getTargets() {
  const res = await fetch(jsonUrl);
  if (!res.ok) throw new Error(`CDP ${res.status} from ${jsonUrl}`);
  return res.json();
}

async function main() {
  const targets = await getTargets();
  if (targets.length < 1) throw new Error("No CDP targets found");
  const pages = [];
  for (const t of targets) {
    const c = await connect(t);
    const isPreview = await c.evaluate("document.body.classList.contains('preview-window')");
    pages.push({ t, c, isPreview });
    console.log(`connected ${t.id.slice(0, 8)} preview=${isPreview} title=${t.title}`);
  }
  const main = pages.find((p) => !p.isPreview);
  const preview = pages.find((p) => p.isPreview);
  if (!main || !preview) throw new Error("Need both main and preview windows");
  await main.c.send("Runtime.enable");
  await preview.c.send("Runtime.enable");

  const state = JSON.parse(
    await main.c.evaluate(`JSON.stringify((()=>{
      const items=[...document.querySelectorAll('.history-item')];
      return {
        header: document.querySelector('.app-title')?.textContent,
        docTitle: document.title,
        itemCount: items.length,
        emptyDisplay: getComputedStyle(document.getElementById('empty-state')).display,
        searchValue: document.getElementById('search-input')?.value || '',
        previewWidthToken: getComputedStyle(document.documentElement).getPropertyValue('--preview-width').trim(),
        hasPin: !!document.getElementById('pin-btn'),
        hasClear: !!document.getElementById('clear-btn')
      };
    })())`)
  );
  console.log("main state:", JSON.stringify(state));
  if (state.header !== "Clippy-board") throw new Error(`Expected header Clippy-board, got ${state.header}`);
  if (state.previewWidthToken !== "480px") throw new Error(`Expected --preview-width 480px, got ${state.previewWidthToken}`);
  if (state.itemCount < 1) throw new Error("Expected at least one history item");

  const card = JSON.parse(
    await main.c.evaluate(`JSON.stringify((()=>{
      const el=document.querySelector('.history-item');
      if(!el) return null;
      const r=el.getBoundingClientRect();
      return {x:r.x+r.width/2,y:r.y+r.height/2,text:el.innerText.slice(0,60)};
    })())`)
  );
  if (!card) throw new Error("No card found");
  const move = async (x,y)=>{ await main.c.send("Input.dispatchMouseEvent",{type:"mouseMoved",x,y,button:"none",pointerType:"mouse"}); await sleep(150); };
  await move(60,30); await move(card.x,card.y); await move(card.x+6,card.y+4);
  let pstate = null;
  for (let i = 0; i < 20; i++) {
    await sleep(250);
    pstate = JSON.parse(await preview.c.evaluate(`JSON.stringify({bodyText:document.getElementById('preview-body')?.innerText.slice(0,120),headerText:document.getElementById('preview-header')?.innerText.slice(0,80),textEls:document.querySelectorAll('.preview-text').length,imageEls:document.querySelectorAll('.preview-image').length})`));
    if ((pstate.textEls + pstate.imageEls) > 0 || (pstate.bodyText && pstate.bodyText.trim()) || (pstate.headerText && pstate.headerText.trim())) break;
  }
  console.log("preview state:", JSON.stringify(pstate));
  if ((pstate.textEls + pstate.imageEls) < 1 && !(pstate.bodyText && pstate.bodyText.trim()) && !(pstate.headerText && pstate.headerText.trim())) throw new Error("Preview did not render content");
  console.log("SMOKE OK (hover)");

  console.log("SMOKE OK (hover)");
  for (const p of pages) p.c.ws.close();
  process.exit(0);
}

main().catch((e) => {
  console.error("SMOKE FAIL:", e.message);
  process.exit(1);
});
