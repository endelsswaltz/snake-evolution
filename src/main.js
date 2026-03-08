import {
  createInitialState,
  DIRECTIONS,
  SNAKE_FORMS,
  setDirection,
  tick,
} from './snakeLogic.mjs';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const config = {
  rows: 20,
  cols: 20,
  baseTickMs: 120,
};

const formPalette = {
  'grass-snake': { snakeA: '#4a8b49', snakeB: '#6ead63', head: '#2b5a2f' },
  'garter-snake': { snakeA: '#356d2d', snakeB: '#4f8b44', head: '#1f421c' },
  'rat-snake': { snakeA: '#3c4732', snakeB: '#5f6a51', head: '#242c20' },
  'sand-boa': { snakeA: '#a67f57', snakeB: '#c79a6a', head: '#734f33' },
  viper: { snakeA: '#4c7d2b', snakeB: '#6ea543', head: '#2a4e19' },
  'king-cobra': { snakeA: '#1f5b45', snakeB: '#2f7d60', head: '#12362a' },
  'winged-dragon': { snakeA: '#44586e', snakeB: '#6b8398', head: '#253747' },
};

let state = createInitialState({ rows: config.rows, cols: config.cols });
let mode = 'start';
let lastTickAt = performance.now();
let tickCarryMs = 0;
let rngState = 1337;
let automationMode = false;

const hudButtons = [
  { id: 'pause', label: 'Pause', x: 484, y: 14, w: 74, h: 28 },
  { id: 'restart', label: 'Restart', x: 568, y: 14, w: 90, h: 28 },
];

function seededRandom() {
  rngState = (rngState * 1664525 + 1013904223) >>> 0;
  return rngState / 4294967296;
}

function getCellSize() {
  return Math.min(canvas.width / config.cols, canvas.height / config.rows);
}

function getEffectLabel() {
  if (state.effects.slowTicks > 0) return `slow (${state.effects.slowTicks})`;
  if (state.effects.speedTicks > 0) return `speed (${state.effects.speedTicks})`;
  if (state.effects.shieldHits > 0) return `shield (${state.effects.shieldHits})`;
  return 'none';
}

function getActiveTickMs() {
  if (state.effects.slowTicks > 0) return config.baseTickMs * 2;
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
  if (mode === 'running') {
    mode = 'paused';
  } else if (mode === 'paused') {
    mode = 'running';
  }
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

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
  g.addColorStop(0, '#d7f0db');
  g.addColorStop(1, '#afdbb3');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cell = getCellSize();
  ctx.strokeStyle = 'rgba(18, 40, 24, 0.18)';
  ctx.lineWidth = 1;
  for (let r = 0; r <= config.rows; r += 1) {
    const y = Math.round(r * cell) + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  for (let c = 0; c <= config.cols; c += 1) {
    const x = Math.round(c * cell) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
}

function drawHud() {
  ctx.fillStyle = 'rgba(7, 28, 12, 0.84)';
  ctx.fillRect(0, 0, canvas.width, 58);
  ctx.fillStyle = '#f2faef';
  ctx.font = '16px "Avenir Next", "Trebuchet MS", sans-serif';
  const form = state.form?.name || SNAKE_FORMS[0].name;
  ctx.fillText(`Score ${state.score}   Level ${state.level}   Form ${form}`, 16, 23);
  ctx.fillText(`Mode ${mode}   Effect ${getEffectLabel()}   Fullscreen [F]`, 16, 45);

  for (const button of hudButtons) {
    const fill = button.id === 'pause' && mode === 'paused' ? 'rgba(170, 218, 176, 0.95)' : 'rgba(237, 246, 236, 0.92)';
    ctx.fillStyle = fill;
    ctx.fillRect(button.x, button.y, button.w, button.h);
    ctx.strokeStyle = 'rgba(16, 34, 20, 0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(button.x + 0.5, button.y + 0.5, button.w - 1, button.h - 1);
    ctx.fillStyle = '#132617';
    ctx.font = '15px "Avenir Next", "Trebuchet MS", sans-serif';
    ctx.fillText(button.label, button.x + 10, button.y + 19);
  }
}

function drawSnakeAndItems() {
  const cell = getCellSize();
  const palette = formPalette[state.form.slug] || formPalette['grass-snake'];

  if (state.food) {
    const fx = state.food.col * cell;
    const fy = state.food.row * cell;
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.arc(fx + cell / 2, fy + cell / 2, cell * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  if (state.powerUp) {
    const px = state.powerUp.col * cell;
    const py = state.powerUp.row * cell;
    const typeColors = {
      SLOW: '#2874a6',
      BONUS: '#d4ac0d',
      SPEED: '#2e86c1',
      SHIELD: '#6c5ce7',
      SHRINK: '#af601a',
    };
    ctx.fillStyle = typeColors[state.powerUp.type] || '#ffffff';
    ctx.fillRect(px + cell * 0.2, py + cell * 0.2, cell * 0.6, cell * 0.6);
  }

  for (let i = state.snake.length - 1; i >= 0; i -= 1) {
    const seg = state.snake[i];
    const x = seg.col * cell;
    const y = seg.row * cell;
    ctx.fillStyle = i % 2 === 0 ? palette.snakeA : palette.snakeB;
    ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
  }

  const head = state.snake[0];
  const hx = head.col * cell;
  const hy = head.row * cell;
  ctx.fillStyle = palette.head;
  ctx.fillRect(hx + 1, hy + 1, cell - 2, cell - 2);
}

function drawOverlay() {
  if (mode === 'running') return;

  ctx.fillStyle = 'rgba(8, 24, 12, 0.7)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#f5fff4';
  ctx.textAlign = 'center';

  if (mode === 'start') {
    ctx.font = 'bold 44px "Avenir Next", "Trebuchet MS", sans-serif';
    ctx.fillText('Snake Evolution', canvas.width / 2, canvas.height * 0.36);
    ctx.font = '20px "Avenir Next", "Trebuchet MS", sans-serif';
    ctx.fillText('Arrow keys or WASD to move', canvas.width / 2, canvas.height * 0.48);
    ctx.fillText('Space to pause, R restart, F fullscreen', canvas.width / 2, canvas.height * 0.54);
    ctx.fillText('Press Enter to start', canvas.width / 2, canvas.height * 0.62);
  } else if (mode === 'paused') {
    ctx.font = 'bold 40px "Avenir Next", "Trebuchet MS", sans-serif';
    ctx.fillText('Paused', canvas.width / 2, canvas.height * 0.5);
  } else if (mode === 'game-over') {
    ctx.font = 'bold 40px "Avenir Next", "Trebuchet MS", sans-serif';
    ctx.fillText('Game Over', canvas.width / 2, canvas.height * 0.45);
    ctx.font = '24px "Avenir Next", "Trebuchet MS", sans-serif';
    ctx.fillText(`Final Score ${state.score}`, canvas.width / 2, canvas.height * 0.53);
    ctx.fillText('Press Enter or R to restart', canvas.width / 2, canvas.height * 0.6);
  }

  ctx.textAlign = 'start';
}

function render() {
  drawBackground();
  drawSnakeAndItems();
  drawHud();
  drawOverlay();
}

function loop(now) {
  const delta = Math.min(120, now - lastTickAt);
  lastTickAt = now;
  if (!automationMode) {
    stepSimulation(delta);
  }
  render();
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
      if (button.id === 'pause' && mode !== 'start' && mode !== 'game-over') {
        pauseToggle();
      }
      if (button.id === 'restart') {
        resetGame();
      }
      return;
    }
  }
}

canvas.addEventListener('mousedown', (event) => {
  handleCanvasPress(event.clientX, event.clientY);
});

canvas.addEventListener('touchstart', (event) => {
  const touch = event.touches[0];
  if (!touch) return;
  handleCanvasPress(touch.clientX, touch.clientY);
});

window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'w', 'a', 's', 'd', 'enter', 'r', 'f'].includes(key)) {
    event.preventDefault();
  }

  if (key === 'f') {
    toggleFullscreen().catch(() => {});
    return;
  }

  if (key === 'enter') {
    if (mode === 'start' || mode === 'game-over') {
      resetGame();
      return;
    }
    if (mode === 'paused') {
      pauseToggle();
      return;
    }
  }

  if (key === 'r') {
    resetGame();
    return;
  }

  if (key === ' ' && mode !== 'start' && mode !== 'game-over') {
    pauseToggle();
    return;
  }

  if (key === 'arrowup' || key === 'w') applyDirection('UP');
  if (key === 'arrowdown' || key === 's') applyDirection('DOWN');
  if (key === 'arrowleft' || key === 'a') applyDirection('LEFT');
  if (key === 'arrowright' || key === 'd') applyDirection('RIGHT');
});

window.render_game_to_text = () => {
  const payload = {
    coordinateSystem: 'origin=(0,0) top-left, +x right via col, +y down via row',
    mode,
    board: { rows: state.rows, cols: state.cols },
    player: {
      head: state.snake[0],
      length: state.snake.length,
      direction: state.direction,
    },
    food: state.food,
    powerUp: state.powerUp,
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
  for (let i = 0; i < steps; i += 1) {
    stepSimulation(1000 / 60);
  }
  render();
  return Promise.resolve();
};

resizeCanvas();
render();
requestAnimationFrame(loop);
