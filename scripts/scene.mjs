import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const chromeBin = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const root = fileURLToPath(new URL('..', import.meta.url));

function freePort(start) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(freePort(start + 1)));
    server.listen(start, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : start;
      server.close(() => resolve(port));
    });
  });
}

function waitFor(stream, pattern, timeoutMs) {
  return new Promise((resolve, reject) => {
    let text = '';
    const timer = setTimeout(() => reject(new Error(`нет строки «${pattern}»`)), timeoutMs);
    const onData = (chunk) => {
      text += chunk.toString();
      if (text.includes(pattern)) {
        clearTimeout(timer);
        stream.off('data', onData);
        resolve(text);
      }
    };
    stream.on('data', onData);
  });
}

function connect(url) {
  const ws = new WebSocket(url);
  let seq = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.method === 'Runtime.exceptionThrown') {
      const detail = msg.params.exceptionDetails;
      errors.push(detail.exception?.description || detail.text);
    }
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  const opened = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  function send(method, params = {}, timeout = 8000) {
    const id = ++seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`timeout ${method}`));
      }, timeout);
      pending.set(id, (msg) => {
        clearTimeout(timer);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression, timeout = 8000) {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    }, timeout);
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails;
      throw new Error(detail.text + ' ' + (detail.exception?.description || ''));
    }
    return result.result.value;
  }
  return { ws, opened, send, evaluate, errors };
}

const port = await freePort(5221);
const debugPort = await freePort(9335);
const profile = await mkdtemp(join(tmpdir(), 'bajaj-scene-'));
const vite = spawn('npx', ['vite', '--port', String(port), '--host', '127.0.0.1', '--strictPort'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe']
});
const chrome = spawn(chromeBin, [
  '--headless=new',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  '--window-size=1280,800',
  '--no-first-run',
  '--disable-sync',
  'about:blank'
], { stdio: ['ignore', 'pipe', 'pipe'] });

async function stop() {
  vite.kill('SIGTERM');
  chrome.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 400));
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}

try {
  await Promise.all([
    waitFor(vite.stdout, 'Local:', 20000),
    waitFor(chrome.stderr, 'DevTools listening', 20000)
  ]);
  const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((r) => r.json());
  const page = targets.find((item) => item.type === 'page');
  if (!page) throw new Error('Chrome не открыл вкладку');
  const cdp = connect(page.webSocketDebuggerUrl);
  await cdp.opened;
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/?debug=1` });

  const started = Date.now();
  let ready = false;
  while (Date.now() - started < 12000) {
    ready = await cdp.evaluate(`!!window.__bajaj && !!document.querySelector('#mm-start')`);
    if (ready) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!ready) throw new Error('окно __bajaj не появилось');

  const menu = await cdp.evaluate(`window.__bajaj.snapshot()`);
  const ride = await cdp.evaluate(`window.__bajaj.ride(1000)`, 15000);
  const frame = await cdp.evaluate(`window.__bajaj.frame()`, 15000);
  const file = join(tmpdir(), 'bajaj-scene.jpg');
  const bytes = Buffer.from(frame.slice(frame.indexOf(',') + 1), 'base64');
  await writeFile(file, bytes);
  await cdp.evaluate(`window.__bajaj.setKeys({ gas: true, right: true, left: false, brake: false })`);
  await new Promise((r) => setTimeout(r, 700));
  const wall = await cdp.evaluate(`window.__bajaj.snapshot()`);
  await cdp.evaluate(`window.__bajaj.setKeys({ gas: false, right: false })`);
  const moved = ride.trace[ride.trace.length - 1].s - ride.trace[0].s;
  console.log(JSON.stringify({
    menu: { fps: menu.fps, calls: menu.render.calls, triangles: menu.render.triangles, scene: menu.scene, errors: menu.errors },
    ride: { speed: ride.snapshot.speed, playerS: ride.snapshot.playerS, lane: ride.snapshot.lane, camera: ride.snapshot.camera, trace: ride.trace, errors: ride.snapshot.errors },
    wall: { speed: wall.speed, lane: wall.lane, playerS: wall.playerS },
    moved,
    frame: file,
    pageErrors: cdp.errors
  }, null, 2));
  const replay = await cdp.evaluate(`window.__bajaj.replayAfterMenu()`);
  await new Promise((r) => setTimeout(r, 400));
  const afterReplay = await cdp.evaluate(`window.__bajaj.exitHint()`);
  const feed = await cdp.evaluate(`window.__bajaj.feed('КОМБО ×2 · +50 ₽', 'combo', 2)`);
  const bareInside = await cdp.evaluate(`window.__bajaj.placeAtExit(true)`);
  await new Promise((r) => setTimeout(r, 300));
  const bare = await cdp.evaluate(`window.__bajaj.exitHint()`);
  const before = await cdp.evaluate(`window.__bajaj.placeAtExit('before')`);
  const armed = await cdp.evaluate(`(document.getElementById('btn-take-exit').click(), window.__bajaj.exitHint())`);
  await new Promise((r) => setTimeout(r, 300));
  const early = await cdp.evaluate(`window.__bajaj.exitHint()`);
  const inside = await cdp.evaluate(`window.__bajaj.placeAtExit(true)`);
  await new Promise((r) => setTimeout(r, 300));
  const hit = await cdp.evaluate(`window.__bajaj.exitHint()`);
  if (bare.modal || early.modal || !early.armed || !hit.modal) {
    throw new Error(`съезд: коробка без кнопки ${bare.modal}, кнопка до коробки ${early.modal}/${early.armed}, въезд ${hit.modal}`);
  }
  if (/само|автомат/i.test(`${bare.how} ${early.how}`)) {
    throw new Error(`подсказка обещает сама: ${bare.how} / ${early.how}`);
  }
  if (!bare.how.includes('Съехать') || !bare.how.includes('коробку') || !early.how.startsWith('Выбрано')) {
    throw new Error(`подсказка разошлась: ${bare.how} / ${early.how}`);
  }
  await cdp.evaluate(`window.__bajaj.placeAtExit('before')`);
  await cdp.evaluate(`document.getElementById('btn-take-exit').click()`);
  await cdp.evaluate(`window.__bajaj.setKeys({ gas: true, left: false, right: false, brake: false })`);
  let driven = null;
  let driveSnap = null;
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 250));
    driven = await cdp.evaluate(`window.__bajaj.exitHint()`);
    driveSnap = await cdp.evaluate(`window.__bajaj.snapshot()`);
    if (driven.modal) break;
  }
  await cdp.evaluate(`window.__bajaj.setKeys({ gas: false })`);
  if (!driven.modal) {
    throw new Error(`после кнопки проезд коробки не открыл меню: s=${driveSnap.playerS} lane=${driveSnap.lane} speed=${driveSnap.speed} how=${driven.how}`);
  }
  const exitFrame = await cdp.evaluate(`window.__bajaj.frame()`, 15000);
  const exitFile = join(tmpdir(), 'bajaj-exit.jpg');
  await writeFile(exitFile, Buffer.from(exitFrame.slice(exitFrame.indexOf(',') + 1), 'base64'));
  const pageShot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 70 });
  const pageFile = join(tmpdir(), 'bajaj-exit-page.jpg');
  await writeFile(pageFile, Buffer.from(pageShot.data, 'base64'));
  console.log(JSON.stringify({
    replay, afterReplay, feed, bareInside, bare, before, armed, early, inside, hit, exitFile, pageFile
  }, null, 2));
  cdp.ws.close();
} finally {
  await stop();
}
