import {
  createInitialState,
  DIRECTIONS,
  SNAKE_FORMS,
  setDirection,
  tick,
  fireProjectile,
} from './snakeLogic.mjs';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const config = {
  rows: 20,
  cols: 20,
  baseTickMs: 120,
};

const formPalette = {
  'grass-snake':  { snakeA: '#4a8b49', snakeB: '#6ead63', head: '#2b5a2f' },
  'garter-snake': { snakeA: '#356d2d', snakeB: '#4f8b44', head: '#1f421c' },
  'rat-snake':    { snakeA: '#3c4732', snakeB: '#5f6a51', head: '#242c20' },
  'sand-boa':     { snakeA: '#a67f57', snakeB: '#c79a6a', head: '#734f33' },
  'viper':        { snakeA: '#4c7d2b', snakeB: '#6ea543', head: '#2a4e19' },
  'king-cobra':   { snakeA: '#1f5b45', snakeB: '#2f7d60', head: '#12362a' },
  'winged-dragon':{ snakeA: '#44586e', snakeB: '#6b8398', head: '#253747' },
};

const powerUpStyle = {
  SLOW:   { color: '#3498db', bg: '#1a4f72', label: 'S' },
  BONUS:  { color: '#f1c40f', bg: '#6e5300', label: '★' },
  SPEED:  { color: '#2ecc71', bg: '#145a32', label: '»' },
  SHIELD: { color: '#9b59b6', bg: '#4a235a', label: '◈' },
  SHRINK: { color: '#e67e22', bg: '#6e2c00', label: '↕' },
  WRAP:   { color: '#1abc9c', bg: '#0b4e3f', label: '∞' },
};

let state = createInitialState({ rows: config.rows, cols: config.cols });
let mode = 'start';
let lastTickAt = performance.now();
let tickCarryMs = 0;
let rngState = 1337;
let automationMode = false;

const hudButtons = [
  { id: 'pause',   label: 'Pause',   x: 484, y: 14, w: 74,  h: 28 },
  { id: 'restart', label: 'Restart', x: 568, y: 14, w: 90,  h: 28 },
];

function seededRandom() {
  rngState = (rngState * 1664525 + 1013904223) >>> 0;
  return rngState / 4294967296;
}

function getCellSize() {
  return Math.min(canvas.width / config.cols, canvas.height / config.rows);
}

function getEffectLabel() {
  const parts = [];
  if (state.effects.wrapTicks  > 0) parts.push(`wrap:${state.effects.wrapTicks}`);
  if (state.effects.slowTicks  > 0) parts.push(`slow:${state.effects.slowTicks}`);
  if (state.effects.speedTicks > 0) parts.push(`speed:${state.effects.speedTicks}`);
  if (state.effects.shieldHits > 0) parts.push(`shield:${state.effects.shieldHits}`);
  return parts.length > 0 ? parts.join('  ') : 'none';
}

function getActiveTickMs() {
  if (state.effects.slowTicks  > 0) return config.baseTickMs * 2;
  if (state.effects.speedTicks > 0) return Math.max(60, Math.floor(config.baseTickMs * 0.7));
  return config.baseTickMs;
}

function resetGame() {
  rngState = 1337;
  state = createInitialState({ rows: config.rows, cols: config.cols, rng: seededRandom });
  mode = 'running';
  tickCarryMs = 0;
}

function pauseToggle() {
  if (mode === 'running') mode = 'paused';
  else if (mode === 'paused') mode = 'running';
}

function applyDirection(name) {
  const dir = DIRECTIONS[name];
  if (!dir || mode === 'start' || mode === 'game-over') return;
  state = setDirection(state, dir);
}

function stepSimulation(ms) {
  if (mode !== 'running') return;
  tickCarryMs += ms;
  const stepMs = getActiveTickMs();
  while (tickCarryMs >= stepMs && mode === 'running') {
    tickCarryMs -= stepMs;
    state = tick(state, seededRandom);
    if (state.gameOver) {
      mode = 'game-over';
      break;
    }
  }
}

// ─── Drawing helpers ────────────────────────────────────────────────────────

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
  g.addColorStop(0, '#111e13');
  g.addColorStop(1, '#0a130b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cell = getCellSize();
  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.lineWidth = 1;
  for (let r = 0; r <= config.rows; r += 1) {
    const y = Math.round(r * cell) + 0.5;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }
  for (let c = 0; c <= config.cols; c += 1) {
    const x = Math.round(c * cell) + 0.5;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }

  // Teal border glow when wrap is active
  if (state.effects?.wrapTicks > 0) {
    ctx.strokeStyle = `rgba(26,188,156,${0.4 + 0.3 * Math.sin(performance.now() * 0.006)})`;
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
    ctx.lineWidth = 1;
  }
}

function drawFood(now) {
  if (!state.food) return;
  const cell = getCellSize();
  const fx = state.food.col * cell + cell / 2;
  const fy = state.food.row * cell + cell / 2;
  const pulse = 0.92 + 0.08 * Math.sin(now * 0.004);
  const radius = cell * 0.36 * pulse;

  // Outer glow
  const glow = ctx.createRadialGradient(fx, fy, 0, fx, fy, radius * 2.2);
  glow.addColorStop(0, 'rgba(231,76,60,0.28)');
  glow.addColorStop(1, 'rgba(231,76,60,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(fx, fy, radius * 2.2, 0, Math.PI * 2); ctx.fill();

  // Body
  const grad = ctx.createRadialGradient(fx - radius * 0.3, fy - radius * 0.3, radius * 0.05, fx, fy, radius);
  grad.addColorStop(0, '#ff6b5b');
  grad.addColorStop(1, '#8e1a10');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(fx, fy, radius, 0, Math.PI * 2); ctx.fill();

  // Shine
  ctx.fillStyle = 'rgba(255,255,255,0.42)';
  ctx.beginPath(); ctx.arc(fx - radius * 0.28, fy - radius * 0.3, radius * 0.22, 0, Math.PI * 2); ctx.fill();
}

function drawPowerUp(now) {
  if (!state.powerUp) return;
  const cell = getCellSize();
  const px = state.powerUp.col * cell + cell / 2;
  const py = state.powerUp.row * cell + cell / 2;
  const pulse = 0.88 + 0.12 * Math.sin(now * 0.005);
  const size = cell * 0.38 * pulse;

  const style = powerUpStyle[state.powerUp.type] || { color: '#ecf0f1', bg: '#333', label: '?' };

  ctx.shadowColor = style.color;
  ctx.shadowBlur = 14 * pulse;

  const grad = ctx.createRadialGradient(px - size * 0.2, py - size * 0.2, size * 0.05, px, py, size);
  grad.addColorStop(0, style.color);
  grad.addColorStop(1, style.bg);
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(px, py, size, 0, Math.PI * 2); ctx.fill();

  ctx.shadowBlur = 0;

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.floor(size * 1.05)}px "Avenir Next", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(style.label, px, py + 1);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

function drawSnake() {
  if (!state.snake.length) return;
  const cell = getCellSize();
  const palette = formPalette[state.form?.slug] || formPalette['grass-snake'];
  const r = Math.max(2, cell * 0.18);
  const pad = 1.5;

  // Body (tail → neck)
  for (let i = state.snake.length - 1; i >= 1; i -= 1) {
    const seg = state.snake[i];
    const x = seg.col * cell + pad;
    const y = seg.row * cell + pad;
    const w = cell - pad * 2;
    const h = cell - pad * 2;

    const cA = i % 2 === 0 ? palette.snakeA : palette.snakeB;
    const cB = i % 2 === 0 ? palette.snakeB : palette.snakeA;
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, cA); g.addColorStop(1, cB);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
  }

  // Head
  const head = state.snake[0];
  const hx = head.col * cell + pad;
  const hy = head.row * cell + pad;
  const hw = cell - pad * 2;
  const hh = cell - pad * 2;

  const hg = ctx.createLinearGradient(hx, hy, hx + hw, hy + hh);
  hg.addColorStop(0, palette.head);
  hg.addColorStop(1, palette.snakeA);
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.roundRect(hx, hy, hw, hh, r); ctx.fill();

  // Eyes
  const eyeR = Math.max(1.5, cell * 0.09);
  const eo = cell * 0.22;
  const ef = cell * 0.18;
  const hcx = head.col * cell + cell / 2;
  const hcy = head.row * cell + cell / 2;
  const dir = state.direction;

  let e1, e2;
  if      (dir.col ===  1) { e1 = { x: hcx + ef, y: hcy - eo }; e2 = { x: hcx + ef, y: hcy + eo }; }
  else if (dir.col === -1) { e1 = { x: hcx - ef, y: hcy - eo }; e2 = { x: hcx - ef, y: hcy + eo }; }
  else if (dir.row === -1) { e1 = { x: hcx - eo, y: hcy - ef }; e2 = { x: hcx + eo, y: hcy - ef }; }
  else                     { e1 = { x: hcx - eo, y: hcy + ef }; e2 = { x: hcx + eo, y: hcy + ef }; }

  ctx.fillStyle = '#e8f5e9';
  for (const e of [e1, e2]) { ctx.beginPath(); ctx.arc(e.x, e.y, eyeR, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#090d09';
  for (const e of [e1, e2]) { ctx.beginPath(); ctx.arc(e.x, e.y, eyeR * 0.52, 0, Math.PI * 2); ctx.fill(); }
}

function drawProjectiles(now) {
  const cell = getCellSize();
  for (const proj of (state.projectiles || [])) {
    const px = proj.col * cell + cell / 2;
    const py = proj.row * cell + cell / 2;
    const radius = Math.max(2, cell * 0.16);
    const alpha = Math.min(1, proj.ttl / 8);

    ctx.globalAlpha = alpha;
    ctx.shadowColor = '#f9ca24';
    ctx.shadowBlur = 14;

    const grad = ctx.createRadialGradient(px, py, 0, px, py, radius);
    grad.addColorStop(0,   '#ffffff');
    grad.addColorStop(0.4, '#f9ca24');
    grad.addColorStop(1,   '#e67e22');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(px, py, radius, 0, Math.PI * 2); ctx.fill();

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
}

function drawHud() {
  ctx.fillStyle = 'rgba(5,14,7,0.88)';
  ctx.fillRect(0, 0, canvas.width, 58);

  ctx.fillStyle = '#d4edda';
  ctx.font = '15px "Avenir Next","Trebuchet MS",sans-serif';
  const form = state.form?.name || SNAKE_FORMS[0].name;
  ctx.fillText(`Score ${state.score}   Level ${state.level}   ${form}`, 14, 22);
  ctx.fillText(`Effect  ${getEffectLabel()}   Mode ${mode}   [F] fullscreen  [Z] shoot`, 14, 44);

  for (const button of hudButtons) {
    const active = button.id === 'pause' && mode === 'paused';
    ctx.fillStyle = active ? 'rgba(145,207,155,0.95)' : 'rgba(230,244,231,0.9)';
    ctx.fillRect(button.x, button.y, button.w, button.h);
    ctx.strokeStyle = 'rgba(10,28,14,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(button.x + 0.5, button.y + 0.5, button.w - 1, button.h - 1);
    ctx.fillStyle = '#0f2413';
    ctx.font = '14px "Avenir Next","Trebuchet MS",sans-serif';
    ctx.fillText(button.label, button.x + 10, button.y + 19);
  }
}

function drawOverlay() {
  if (mode === 'running') return;

  ctx.fillStyle = 'rgba(5,14,7,0.72)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#e8f5e9';
  ctx.textAlign = 'center';

  if (mode === 'start') {
    ctx.font = 'bold 44px "Avenir Next","Trebuchet MS",sans-serif';
    ctx.fillText('Snake Evolution', canvas.width / 2, canvas.height * 0.36);
    ctx.font = '19px "Avenir Next","Trebuchet MS",sans-serif';
    ctx.fillStyle = '#a5d6a7';
    ctx.fillText('Arrow keys or WASD to move', canvas.width / 2, canvas.height * 0.47);
    ctx.fillText('Space to pause  ·  R restart  ·  F fullscreen  ·  Z shoot', canvas.width / 2, canvas.height * 0.53);
    ctx.fillStyle = '#e8f5e9';
    ctx.font = 'bold 22px "Avenir Next","Trebuchet MS",sans-serif';
    ctx.fillText('Press Enter to start', canvas.width / 2, canvas.height * 0.63);
  } else if (mode === 'paused') {
    ctx.font = 'bold 40px "Avenir Next","Trebuchet MS",sans-serif';
    ctx.fillText('Paused', canvas.width / 2, canvas.height * 0.5);
  } else if (mode === 'game-over') {
    ctx.font = 'bold 40px "Avenir Next","Trebuchet MS",sans-serif';
    ctx.fillText('Game Over', canvas.width / 2, canvas.height * 0.44);
    ctx.font = '24px "Avenir Next","Trebuchet MS",sans-serif';
    ctx.fillStyle = '#a5d6a7';
    ctx.fillText(`Final Score  ${state.score}`, canvas.width / 2, canvas.height * 0.53);
    ctx.fillStyle = '#e8f5e9';
    ctx.fillText('Press Enter or R to restart', canvas.width / 2, canvas.height * 0.61);
  }

  ctx.textAlign = 'start';
}

function render(now = performance.now()) {
  drawBackground(now);
  drawFood(now);
  drawPowerUp(now);
  drawSnake();
  drawProjectiles(now);
  drawHud();
  drawOverlay();
}

function loop(now) {
  const delta = Math.min(120, now - lastTickAt);
  lastTickAt = now;
  if (!automationMode) {
    stepSimulation(delta);
  }
  render(now);
  requestAnimationFrame(loop);
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const size = Math.max(320, Math.floor(Math.min(rect.width || 720, window.innerHeight - 24)));
  canvas.width = size;
  canvas.height = size;
  render();
}

async function toggleFullscreen() {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
  } else {
    await document.documentElement.requestFullscreen();
  }
  setTimeout(resizeCanvas, 20);
}

window.addEventListener('resize', resizeCanvas);

function handleCanvasPress(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (clientX - rect.left) * scaleX;
  const y = (clientY - rect.top) * scaleY;

  for (const button of hudButtons) {
    if (x >= button.x && x <= button.x + button.w && y >= button.y && y <= button.y + button.h) {
      if (button.id === 'pause' && mode !== 'start' && mode !== 'game-over') pauseToggle();
      if (button.id === 'restart') resetGame();
      return;
    }
  }
}

canvas.addEventListener('mousedown', (event) => { handleCanvasPress(event.clientX, event.clientY); });
canvas.addEventListener('touchstart', (event) => {
  const touch = event.touches[0];
  if (!touch) return;
  handleCanvasPress(touch.clientX, touch.clientY);
});

window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if (['arrowup','arrowdown','arrowleft','arrowright',' ','w','a','s','d','enter','r','f','z'].includes(key)) {
    event.preventDefault();
  }

  if (key === 'f') { toggleFullscreen().catch(() => {}); return; }

  if (key === 'enter') {
    if (mode === 'start' || mode === 'game-over') { resetGame(); return; }
    if (mode === 'paused') { pauseToggle(); return; }
  }

  if (key === 'r') { resetGame(); return; }

  if (key === ' ' && mode !== 'start' && mode !== 'game-over') { pauseToggle(); return; }

  if (key === 'z' && mode === 'running') { state = fireProjectile(state); return; }

  if (key === 'arrowup'    || key === 'w') applyDirection('UP');
  if (key === 'arrowdown'  || key === 's') applyDirection('DOWN');
  if (key === 'arrowleft'  || key === 'a') applyDirection('LEFT');
  if (key === 'arrowright' || key === 'd') applyDirection('RIGHT');
});

// Automation API
window.render_game_to_text = () => {
  const payload = {
    coordinateSystem: 'origin=(0,0) top-left, +x right via col, +y down via row',
    mode,
    board: { rows: state.rows, cols: state.cols },
    player: { head: state.snake[0], length: state.snake.length, direction: state.direction },
    food: state.food,
    powerUp: state.powerUp,
    projectiles: state.projectiles,
    effects: state.effects,
    score: state.score,
    level: state.level,
    form: state.form.slug,
    fullscreen: Boolean(document.fullscreenElement),
  };
  return JSON.stringify(payload);
};

window.advanceTime = (ms) => {
  automationMode = true;
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let i = 0; i < steps; i += 1) stepSimulation(1000 / 60);
  render();
  return Promise.resolve();
};

resizeCanvas();
render();
requestAnimationFrame(loop);
