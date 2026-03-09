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
  'grass-snake':   { snakeA: '#4a8b49', snakeB: '#6ead63', head: '#2b5a2f' },
  'garter-snake':  { snakeA: '#356d2d', snakeB: '#4f8b44', head: '#1f421c' },
  'rat-snake':     { snakeA: '#3c4732', snakeB: '#5f6a51', head: '#242c20' },
  'sand-boa':      { snakeA: '#a67f57', snakeB: '#c79a6a', head: '#734f33' },
  'viper':         { snakeA: '#4c7d2b', snakeB: '#6ea543', head: '#2a4e19' },
  'king-cobra':    { snakeA: '#1f5b45', snakeB: '#2f7d60', head: '#12362a' },
  'winged-dragon': { snakeA: '#44586e', snakeB: '#6b8398', head: '#253747' },
};

const powerUpStyle = {
  SLOW:   { color: '#3498db', bg: '#1a4f72', label: 'S'  },
  BONUS:  { color: '#f1c40f', bg: '#6e5300', label: '★'  },
  SPEED:  { color: '#2ecc71', bg: '#145a32', label: '»'  },
  SHIELD: { color: '#9b59b6', bg: '#4a235a', label: '◈'  },
  SHRINK: { color: '#e67e22', bg: '#6e2c00', label: '↕'  },
  WRAP:   { color: '#1abc9c', bg: '#0b4e3f', label: '∞'  },
  GHOST:  { color: '#bdc3c7', bg: '#424949', label: '◌'  },
  MAGNET: { color: '#e91e8c', bg: '#6a0032', label: '⊕'  },
};

// ─── State ───────────────────────────────────────────────────────────────────

let state       = createInitialState({ rows: config.rows, cols: config.cols });
let mode        = 'start';
let lastTickAt  = performance.now();
let tickCarryMs = 0;
let rngState    = 1337;
let automationMode = false;
let prevState   = state;

// ─── Layout helpers ──────────────────────────────────────────────────────────

function getHudHeight() {
  return Math.round(Math.min(60, Math.max(46, canvas.width * 0.13)));
}

// Returns the square game-board rect within the canvas (below the HUD).
function getBoard() {
  const hud  = getHudHeight();
  const avW  = canvas.width;
  const avH  = canvas.height - hud;
  const size = Math.min(avW, avH);
  return {
    x:    Math.floor((avW - size) / 2),
    y:    hud + Math.floor((avH - size) / 2),
    size,
  };
}

function getCellSize() {
  return getBoard().size / config.rows;
}

function cellCenter(row, col) {
  const board = getBoard();
  const cell  = getCellSize();
  return { x: board.x + col * cell + cell / 2, y: board.y + row * cell + cell / 2 };
}

function getHudButtons() {
  const h  = getHudHeight();
  const bH = Math.min(28, h - 14);
  const bW = Math.max(52, Math.min(80, canvas.width * 0.15));
  const y  = Math.round((h - bH) / 2);
  return [
    { id: 'pause',   label: 'Pause',   x: canvas.width - bW * 2 - 16, y, w: bW, h: bH },
    { id: 'restart', label: 'Restart', x: canvas.width - bW - 6,      y, w: bW, h: bH },
  ];
}

// ─── Particles ───────────────────────────────────────────────────────────────

let particles = [];

function spawnParticles(x, y, color, count = 10, speed = 3) {
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const v = speed * (0.6 + Math.random() * 0.8);
    particles.push({
      x, y,
      vx: Math.cos(angle) * v, vy: Math.sin(angle) * v,
      life: 1, decay: 0.02 + Math.random() * 0.025,
      color, radius: 2 + Math.random() * 3,
    });
  }
}

function updateParticles() {
  particles = particles.filter((p) => {
    p.x += p.vx; p.y += p.vy;
    p.vx *= 0.9; p.vy *= 0.9;
    p.life -= p.decay;
    return p.life > 0;
  });
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle   = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.radius * p.life, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ─── Audio ───────────────────────────────────────────────────────────────────

let audioCtx = null;
function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function playTone(freq, dur, type = 'sine', vol = 0.25, delay = 0) {
  try {
    const ac = getAudio();
    const osc = ac.createOscillator();
    const g   = ac.createGain();
    osc.connect(g); g.connect(ac.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ac.currentTime + delay);
    g.gain.setValueAtTime(vol, ac.currentTime + delay);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + delay + dur);
    osc.start(ac.currentTime + delay);
    osc.stop(ac.currentTime + delay + dur);
  } catch (_) {}
}
function sfxEat()      { playTone(440,0.08,'sine',0.2); playTone(660,0.08,'sine',0.15,0.07); }
function sfxPowerUp()  { playTone(520,0.12,'sine',0.2); playTone(780,0.15,'sine',0.18,0.10); playTone(1040,0.12,'sine',0.12,0.22); }
function sfxShoot()    { playTone(300,0.06,'sawtooth',0.1); }
function sfxGameOver() { playTone(220,0.18,'sawtooth',0.28); playTone(180,0.18,'sawtooth',0.22,0.16); playTone(130,0.3,'sawtooth',0.18,0.32); }
function sfxPortal()   { playTone(800,0.06,'sine',0.15); playTone(400,0.12,'sine',0.12,0.06); }

// ─── High Scores ─────────────────────────────────────────────────────────────

function loadHighScores() {
  try { return JSON.parse(localStorage.getItem('snake-highscores') || '[]'); } catch (_) { return []; }
}
function saveHighScore(score) {
  const scores = loadHighScores();
  scores.push(score);
  scores.sort((a, b) => b - a);
  const top5 = scores.slice(0, 5);
  localStorage.setItem('snake-highscores', JSON.stringify(top5));
  return top5;
}

// ─── Game logic ──────────────────────────────────────────────────────────────

function seededRandom() {
  rngState = (rngState * 1664525 + 1013904223) >>> 0;
  return rngState / 4294967296;
}

function getEffectLabel() {
  const parts = [];
  if (state.effects.wrapTicks   > 0) parts.push(`wrap:${state.effects.wrapTicks}`);
  if (state.effects.ghostTicks  > 0) parts.push(`ghost:${state.effects.ghostTicks}`);
  if (state.effects.magnetTicks > 0) parts.push(`magnet:${state.effects.magnetTicks}`);
  if (state.effects.slowTicks   > 0) parts.push(`slow:${state.effects.slowTicks}`);
  if (state.effects.speedTicks  > 0) parts.push(`speed:${state.effects.speedTicks}`);
  if (state.effects.shieldHits  > 0) parts.push(`shield:${state.effects.shieldHits}`);
  return parts.join(' ') || 'none';
}

function getActiveTickMs() {
  if (state.effects.slowTicks  > 0) return config.baseTickMs * 2;
  if (state.effects.speedTicks > 0) return Math.max(60, Math.floor(config.baseTickMs * 0.7));
  return config.baseTickMs;
}

function resetGame() {
  rngState    = 1337;
  state       = createInitialState({ rows: config.rows, cols: config.cols, rng: seededRandom });
  prevState   = state;
  mode        = 'running';
  tickCarryMs = 0;
  particles   = [];
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
    prevState = state;
    state = tick(state, seededRandom);
    handleStateEvents();
    if (state.gameOver) { mode = 'game-over'; break; }
  }
}

function handleStateEvents() {
  if (prevState.score !== state.score) {
    sfxEat();
    if (prevState.food) {
      const { x, y } = cellCenter(prevState.food.row, prevState.food.col);
      spawnParticles(x, y, '#e74c3c', 12, 4);
    }
  }
  if (prevState.powerUp && !state.powerUp && !state.gameOver) {
    sfxPowerUp();
    const { x, y } = cellCenter(prevState.powerUp.row, prevState.powerUp.col);
    const style = powerUpStyle[prevState.powerUp.type] || { color: '#fff' };
    spawnParticles(x, y, style.color, 16, 5);
  }
  if (prevState.snake.length > 0 && state.snake.length > 0) {
    const ph = prevState.snake[0], nh = state.snake[0];
    if (Math.abs(ph.row - nh.row) + Math.abs(ph.col - nh.col) > 2) {
      sfxPortal();
      const { x, y } = cellCenter(nh.row, nh.col);
      spawnParticles(x, y, '#8e44ad', 14, 4);
    }
  }
  if (!prevState.gameOver && state.gameOver) {
    sfxGameOver();
    const head = prevState.snake[0];
    if (head) {
      const { x, y } = cellCenter(head.row, head.col);
      spawnParticles(x, y, '#e74c3c', 24, 6);
    }
    saveHighScore(state.score);
  }
}

// ─── Drawing ─────────────────────────────────────────────────────────────────

function drawBackground(now) {
  const board = getBoard();

  // Full canvas fill
  ctx.fillStyle = '#0d150e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Board gradient
  const g = ctx.createLinearGradient(board.x, board.y, board.x, board.y + board.size);
  g.addColorStop(0, '#111e13');
  g.addColorStop(1, '#0a130b');
  ctx.fillStyle = g;
  ctx.fillRect(board.x, board.y, board.size, board.size);

  // Grid
  const cell = getCellSize();
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let r = 0; r <= config.rows; r += 1) {
    const y = board.y + Math.round(r * cell) + 0.5;
    ctx.beginPath(); ctx.moveTo(board.x, y); ctx.lineTo(board.x + board.size, y); ctx.stroke();
  }
  for (let c = 0; c <= config.cols; c += 1) {
    const x = board.x + Math.round(c * cell) + 0.5;
    ctx.beginPath(); ctx.moveTo(x, board.y); ctx.lineTo(x, board.y + board.size); ctx.stroke();
  }

  if (state.effects?.wrapTicks > 0) {
    ctx.strokeStyle = `rgba(26,188,156,${0.4 + 0.3 * Math.sin(now * 0.006)})`;
    ctx.lineWidth = 4;
    ctx.strokeRect(board.x + 2, board.y + 2, board.size - 4, board.size - 4);
    ctx.lineWidth = 1;
  }
  if (state.effects?.ghostTicks > 0) {
    ctx.strokeStyle = `rgba(189,195,199,${0.3 + 0.25 * Math.sin(now * 0.008)})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(board.x + 5, board.y + 5, board.size - 10, board.size - 10);
    ctx.lineWidth = 1;
  }
}

function drawObstacles() {
  const cell = getCellSize();
  const board = getBoard();
  const r = Math.max(2, cell * 0.12);
  for (const obs of (state.obstacles || [])) {
    const x = board.x + obs.col * cell + 1.5;
    const y = board.y + obs.row * cell + 1.5;
    const w = cell - 3;
    const g = ctx.createLinearGradient(x, y, x + w, y + w);
    g.addColorStop(0, '#5d4037'); g.addColorStop(1, '#3e2723');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect(x, y, w, w, r); ctx.fill();
    ctx.strokeStyle = '#8d6e63'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x + 0.5, y + 0.5, w - 1, w - 1, r); ctx.stroke();
  }
}

function drawPortals(now) {
  const cell   = getCellSize();
  const colors = [['#8e44ad', '#4a235a'], ['#d35400', '#6e2c00']];
  for (let i = 0; i < (state.portals || []).length; i += 1) {
    const portal = state.portals[i];
    const [colorA, colorB] = colors[i % colors.length];
    const pulse = 0.85 + 0.15 * Math.sin(now * 0.006 + i);
    const size  = cell * 0.42 * pulse;
    for (const side of [portal.a, portal.b]) {
      const { x, y } = cellCenter(side.row, side.col);
      ctx.shadowColor = colorA; ctx.shadowBlur = 12 * pulse;
      ctx.strokeStyle = colorA; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = colorB; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, size * 0.6, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0; ctx.lineWidth = 1;
    }
  }
}

function drawFood(now) {
  if (!state.food) return;
  const { x, y } = cellCenter(state.food.row, state.food.col);
  const cell   = getCellSize();
  const pulse  = 0.92 + 0.08 * Math.sin(now * 0.004);
  const radius = cell * 0.36 * pulse;
  if (state.effects?.magnetTicks > 0) { ctx.shadowColor = '#e91e8c'; ctx.shadowBlur = 16; }
  const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 2.2);
  glow.addColorStop(0, 'rgba(231,76,60,0.28)'); glow.addColorStop(1, 'rgba(231,76,60,0)');
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, radius * 2.2, 0, Math.PI * 2); ctx.fill();
  const grad = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, radius * 0.05, x, y, radius);
  grad.addColorStop(0, '#ff6b5b'); grad.addColorStop(1, '#8e1a10');
  ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.42)';
  ctx.beginPath(); ctx.arc(x - radius * 0.28, y - radius * 0.3, radius * 0.22, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
}

function drawPowerUp(now) {
  if (!state.powerUp) return;
  const { x, y } = cellCenter(state.powerUp.row, state.powerUp.col);
  const cell  = getCellSize();
  const pulse = 0.88 + 0.12 * Math.sin(now * 0.005);
  const size  = cell * 0.38 * pulse;
  const style = powerUpStyle[state.powerUp.type] || { color: '#ecf0f1', bg: '#333', label: '?' };
  ctx.shadowColor = style.color; ctx.shadowBlur = 14 * pulse;
  const grad = ctx.createRadialGradient(x - size * 0.2, y - size * 0.2, size * 0.05, x, y, size);
  grad.addColorStop(0, style.color); grad.addColorStop(1, style.bg);
  ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.floor(size * 1.05)}px "Avenir Next",sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(style.label, x, y + 1);
  ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
}

function drawSnakeBody(snake, headColor, bodyA, bodyB, alpha) {
  const cell = getCellSize();
  const board = getBoard();
  const r    = Math.max(2, cell * 0.18);
  const pad  = 1.5;
  ctx.globalAlpha = alpha;
  for (let i = snake.length - 1; i >= 1; i -= 1) {
    const seg = snake[i];
    const x = board.x + seg.col * cell + pad;
    const y = board.y + seg.row * cell + pad;
    const w = cell - pad * 2;
    const cA = i % 2 === 0 ? bodyA : bodyB;
    const cB = i % 2 === 0 ? bodyB : bodyA;
    const g  = ctx.createLinearGradient(x, y, x + w, y + w);
    g.addColorStop(0, cA); g.addColorStop(1, cB);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect(x, y, w, w, r); ctx.fill();
  }
  const head = snake[0];
  const hx = board.x + head.col * cell + pad;
  const hy = board.y + head.row * cell + pad;
  const hw = cell - pad * 2;
  const hg = ctx.createLinearGradient(hx, hy, hx + hw, hy + hw);
  hg.addColorStop(0, headColor); hg.addColorStop(1, bodyA);
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.roundRect(hx, hy, hw, hw, r); ctx.fill();
  ctx.globalAlpha = 1;
}

function drawEyes(snake, direction, alpha) {
  if (!snake.length) return;
  const cell = getCellSize();
  const head = snake[0];
  const eyeR = Math.max(1.5, cell * 0.09);
  const eo   = cell * 0.22;
  const ef   = cell * 0.18;
  const { x: hcx, y: hcy } = cellCenter(head.row, head.col);
  let e1, e2;
  if      (direction.col ===  1) { e1 = { x: hcx + ef, y: hcy - eo }; e2 = { x: hcx + ef, y: hcy + eo }; }
  else if (direction.col === -1) { e1 = { x: hcx - ef, y: hcy - eo }; e2 = { x: hcx - ef, y: hcy + eo }; }
  else if (direction.row === -1) { e1 = { x: hcx - eo, y: hcy - ef }; e2 = { x: hcx + eo, y: hcy - ef }; }
  else                           { e1 = { x: hcx - eo, y: hcy + ef }; e2 = { x: hcx + eo, y: hcy + ef }; }
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#e8f5e9';
  for (const e of [e1, e2]) { ctx.beginPath(); ctx.arc(e.x, e.y, eyeR, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#090d09';
  for (const e of [e1, e2]) { ctx.beginPath(); ctx.arc(e.x, e.y, eyeR * 0.52, 0, Math.PI * 2); ctx.fill(); }
  ctx.globalAlpha = 1;
}

function drawSnake() {
  if (!state.snake.length) return;
  const palette = formPalette[state.form?.slug] || formPalette['grass-snake'];
  const alpha   = state.effects?.ghostTicks > 0 ? 0.45 : 1;
  drawSnakeBody(state.snake, palette.head, palette.snakeA, palette.snakeB, alpha);
  drawEyes(state.snake, state.direction, alpha);
}

function drawEnemy() {
  if (!state.enemy) return;
  const alpha = state.effects?.ghostTicks > 0 ? 0.35 : 1;
  drawSnakeBody(state.enemy.snake, '#c0392b', '#e74c3c', '#a93226', alpha);
  // Enemy pupils are red-tinted white
  if (state.enemy.snake.length > 0) {
    const cell = getCellSize();
    const head = state.enemy.snake[0];
    const eyeR = Math.max(1.5, cell * 0.09);
    const eo   = cell * 0.22;
    const ef   = cell * 0.18;
    const { x: hcx, y: hcy } = cellCenter(head.row, head.col);
    const dir = state.enemy.direction;
    let e1, e2;
    if      (dir.col ===  1) { e1 = { x: hcx + ef, y: hcy - eo }; e2 = { x: hcx + ef, y: hcy + eo }; }
    else if (dir.col === -1) { e1 = { x: hcx - ef, y: hcy - eo }; e2 = { x: hcx - ef, y: hcy + eo }; }
    else if (dir.row === -1) { e1 = { x: hcx - eo, y: hcy - ef }; e2 = { x: hcx + eo, y: hcy - ef }; }
    else                     { e1 = { x: hcx - eo, y: hcy + ef }; e2 = { x: hcx + eo, y: hcy + ef }; }
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ffe0de';
    for (const e of [e1, e2]) { ctx.beginPath(); ctx.arc(e.x, e.y, eyeR, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#1a0000';
    for (const e of [e1, e2]) { ctx.beginPath(); ctx.arc(e.x, e.y, eyeR * 0.52, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
}

function drawProjectilesList() {
  for (const proj of (state.projectiles || [])) {
    const { x, y } = cellCenter(proj.row, proj.col);
    const cell      = getCellSize();
    const radius    = Math.max(2, cell * 0.16);
    ctx.globalAlpha = Math.min(1, proj.ttl / 8);
    ctx.shadowColor = '#f9ca24'; ctx.shadowBlur = 14;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.4, '#f9ca24'); grad.addColorStop(1, '#e67e22');
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }
}

function drawHud() {
  const hud   = getHudHeight();
  const btns  = getHudButtons();
  const small = canvas.width < 480;
  const fs    = Math.max(11, Math.min(15, canvas.width * 0.034));

  ctx.fillStyle = 'rgba(5,14,7,0.92)';
  ctx.fillRect(0, 0, canvas.width, hud);

  ctx.fillStyle = '#c8e6c9';
  ctx.font = `${fs}px "Avenir Next","Trebuchet MS",sans-serif`;

  if (small) {
    const effect = getEffectLabel();
    ctx.fillText(`Score ${state.score}  Lv${state.level}  ${effect !== 'none' ? effect : ''}`, 10, hud * 0.62);
  } else {
    ctx.fillText(`Score ${state.score}   Level ${state.level}   ${state.form?.name || ''}`, 14, hud * 0.38);
    ctx.fillText(`Effect ${getEffectLabel()}   [Z] shoot  [F] fullscreen`, 14, hud * 0.78);
  }

  for (const button of btns) {
    const active = button.id === 'pause' && mode === 'paused';
    ctx.fillStyle = active ? 'rgba(145,207,155,0.95)' : 'rgba(225,242,228,0.9)';
    ctx.fillRect(button.x, button.y, button.w, button.h);
    ctx.strokeStyle = 'rgba(10,28,14,0.5)'; ctx.lineWidth = 1;
    ctx.strokeRect(button.x + 0.5, button.y + 0.5, button.w - 1, button.h - 1);
    ctx.fillStyle = '#0f2413';
    ctx.font = `${Math.max(10, fs - 1)}px "Avenir Next","Trebuchet MS",sans-serif`;
    ctx.fillText(button.label, button.x + 8, button.y + button.h * 0.68);
  }
}

function drawOverlay() {
  if (mode === 'running') return;
  const board = getBoard();
  const cx    = board.x + board.size / 2;
  const bfs   = (f) => Math.max(f * 0.5, Math.min(f, board.size * (f / 720)));

  ctx.fillStyle = 'rgba(5,14,7,0.78)';
  ctx.fillRect(board.x, board.y, board.size, board.size);
  ctx.textAlign = 'center';

  if (mode === 'start') {
    ctx.fillStyle = '#e8f5e9';
    ctx.font = `bold ${bfs(40)}px "Avenir Next","Trebuchet MS",sans-serif`;
    ctx.fillText('Snake Evolution', cx, board.y + board.size * 0.22);

    ctx.fillStyle = '#81c784';
    ctx.font = `${bfs(14)}px "Avenir Next","Trebuchet MS",sans-serif`;
    const lines = canvas.width < 480
      ? ['Swipe to move  ·  Tap to start', 'Double-tap to shoot']
      : ['Arrow keys / WASD · Space pause · R restart · F fullscreen · Z shoot',
         'Power-ups: S Slow  ★ Bonus  » Speed  ◈ Shield  ↕ Shrink  ∞ Wrap  ◌ Ghost  ⊕ Magnet',
         'Purple rings = portals  ·  Red snake = enemy  ·  Brown blocks = obstacles'];
    lines.forEach((l, i) => ctx.fillText(l, cx, board.y + board.size * 0.36 + i * bfs(20)));

    ctx.fillStyle = '#e8f5e9';
    ctx.font = `bold ${bfs(20)}px "Avenir Next","Trebuchet MS",sans-serif`;
    ctx.fillText(canvas.width < 480 ? 'Tap to start' : 'Press Enter to start', cx, board.y + board.size * 0.62);

    const scores = loadHighScores();
    if (scores.length > 0) {
      ctx.fillStyle = '#a5d6a7';
      ctx.font = `${bfs(13)}px "Avenir Next","Trebuchet MS",sans-serif`;
      ctx.fillText('Best: ' + scores.slice(0, 5).join('  ·  '), cx, board.y + board.size * 0.74);
    }

  } else if (mode === 'paused') {
    ctx.fillStyle = '#e8f5e9';
    ctx.font = `bold ${bfs(38)}px "Avenir Next","Trebuchet MS",sans-serif`;
    ctx.fillText('Paused', cx, board.y + board.size * 0.5);
    ctx.font = `${bfs(15)}px "Avenir Next","Trebuchet MS",sans-serif`;
    ctx.fillStyle = '#a5d6a7';
    ctx.fillText(canvas.width < 480 ? 'Tap Pause to resume' : 'Space / tap Pause to resume', cx, board.y + board.size * 0.6);

  } else if (mode === 'game-over') {
    ctx.fillStyle = '#e8f5e9';
    ctx.font = `bold ${bfs(38)}px "Avenir Next","Trebuchet MS",sans-serif`;
    ctx.fillText('Game Over', cx, board.y + board.size * 0.3);

    ctx.fillStyle = '#a5d6a7';
    ctx.font = `${bfs(20)}px "Avenir Next","Trebuchet MS",sans-serif`;
    ctx.fillText(`Score  ${state.score}`, cx, board.y + board.size * 0.42);

    const scores = loadHighScores();
    if (scores.length > 0) {
      ctx.font = `${bfs(14)}px "Avenir Next","Trebuchet MS",sans-serif`;
      ctx.fillText('Top: ' + scores.join('  ·  '), cx, board.y + board.size * 0.53);
      if (scores[0] === state.score) {
        ctx.fillStyle = '#f1c40f';
        ctx.font = `bold ${bfs(16)}px "Avenir Next","Trebuchet MS",sans-serif`;
        ctx.fillText('★ New best! ★', cx, board.y + board.size * 0.62);
      }
    }

    ctx.fillStyle = '#e8f5e9';
    ctx.font = `${bfs(18)}px "Avenir Next","Trebuchet MS",sans-serif`;
    ctx.fillText(canvas.width < 480 ? 'Tap to restart' : 'Press Enter or R', cx, board.y + board.size * 0.74);
  }

  ctx.textAlign = 'start';
}

// ─── Main loop ───────────────────────────────────────────────────────────────

function render(now = performance.now()) {
  drawBackground(now);
  drawObstacles();
  drawPortals(now);
  drawFood(now);
  drawPowerUp(now);
  drawEnemy();
  drawSnake();
  drawProjectilesList();
  drawParticles();
  updateParticles();
  drawHud();
  drawOverlay();
}

function loop(now) {
  const delta = Math.min(120, now - lastTickAt);
  lastTickAt = now;
  if (!automationMode) stepSimulation(delta);
  render(now);
  requestAnimationFrame(loop);
}

function resizeCanvas() {
  canvas.width  = window.innerWidth  || 720;
  canvas.height = window.innerHeight || 720;
  render();
}

async function toggleFullscreen() {
  if (document.fullscreenElement) await document.exitFullscreen();
  else await document.documentElement.requestFullscreen();
  setTimeout(resizeCanvas, 20);
}

// ─── Input ───────────────────────────────────────────────────────────────────

window.addEventListener('resize', resizeCanvas);

function handleCanvasPress(clientX, clientY) {
  const rect   = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (clientX - rect.left) * scaleX;
  const y = (clientY - rect.top)  * scaleY;

  for (const button of getHudButtons()) {
    if (x >= button.x && x <= button.x + button.w && y >= button.y && y <= button.y + button.h) {
      if (button.id === 'pause'   && mode !== 'start' && mode !== 'game-over') pauseToggle();
      if (button.id === 'restart') resetGame();
      return true;
    }
  }
  return false;
}

canvas.addEventListener('mousedown', (e) => { handleCanvasPress(e.clientX, e.clientY); });

// Touch controls: swipe to move, tap to start/restart, double-tap to shoot
let touchStartX = 0, touchStartY = 0, touchStartTime = 0, lastTapTime = 0;

canvas.addEventListener('touchstart', (e) => {
  const t = e.touches[0]; if (!t) return;
  touchStartX    = t.clientX;
  touchStartY    = t.clientY;
  touchStartTime = Date.now();
}, { passive: true });

canvas.addEventListener('touchend', (e) => {
  const t = e.changedTouches[0]; if (!t) return;

  // Check HUD button tap first
  if (handleCanvasPress(t.clientX, t.clientY)) return;

  const dx   = t.clientX - touchStartX;
  const dy   = t.clientY - touchStartY;
  const dist = Math.max(Math.abs(dx), Math.abs(dy));
  const dur  = Date.now() - touchStartTime;

  if (dist < 12 && dur < 300) {
    // Tap — check for double-tap (shoot)
    const now = Date.now();
    if (now - lastTapTime < 320 && mode === 'running') {
      sfxShoot();
      state = fireProjectile(state);
      lastTapTime = 0;
      return;
    }
    lastTapTime = now;
    // Single tap: start / restart
    if (mode === 'start' || mode === 'game-over') { resetGame(); return; }
    return;
  }

  // Swipe
  if (dist < 10) return;
  if (Math.abs(dx) > Math.abs(dy)) applyDirection(dx > 0 ? 'RIGHT' : 'LEFT');
  else                              applyDirection(dy > 0 ? 'DOWN'  : 'UP');
}, { passive: true });

window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (['arrowup','arrowdown','arrowleft','arrowright',' ','w','a','s','d','enter','r','f','z'].includes(key)) e.preventDefault();
  if (key === 'f') { toggleFullscreen().catch(() => {}); return; }
  if (key === 'enter') {
    if (mode === 'start' || mode === 'game-over') { resetGame(); return; }
    if (mode === 'paused') { pauseToggle(); return; }
  }
  if (key === 'r') { resetGame(); return; }
  if (key === ' ' && mode !== 'start' && mode !== 'game-over') { pauseToggle(); return; }
  if (key === 'z' && mode === 'running') { sfxShoot(); state = fireProjectile(state); return; }
  if (key === 'arrowup'    || key === 'w') applyDirection('UP');
  if (key === 'arrowdown'  || key === 's') applyDirection('DOWN');
  if (key === 'arrowleft'  || key === 'a') applyDirection('LEFT');
  if (key === 'arrowright' || key === 'd') applyDirection('RIGHT');
});

// Fullscreen on first interaction (browsers require gesture)
function requestFS() {
  document.documentElement.requestFullscreen().then(() => setTimeout(resizeCanvas, 20)).catch(() => {});
}
document.addEventListener('keydown',   requestFS, { once: true });
document.addEventListener('touchstart', requestFS, { once: true });

// ─── Automation API ───────────────────────────────────────────────────────────

window.render_game_to_text = () => JSON.stringify({
  coordinateSystem: 'origin=(0,0) top-left, +x right via col, +y down via row',
  mode,
  board:       { rows: state.rows, cols: state.cols },
  player:      { head: state.snake[0], length: state.snake.length, direction: state.direction },
  food:        state.food,
  powerUp:     state.powerUp,
  projectiles: state.projectiles,
  obstacles:   state.obstacles,
  portals:     state.portals,
  enemy:       state.enemy ? { head: state.enemy.snake[0], length: state.enemy.snake.length } : null,
  effects:     state.effects,
  score:       state.score,
  level:       state.level,
  form:        state.form.slug,
  fullscreen:  Boolean(document.fullscreenElement),
});

window.advanceTime = (ms) => {
  automationMode = true;
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let i = 0; i < steps; i += 1) stepSimulation(1000 / 60);
  render();
  return Promise.resolve();
};

// ─── Boot ─────────────────────────────────────────────────────────────────────

resizeCanvas();
render();
requestAnimationFrame(loop);
