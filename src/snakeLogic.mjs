export const DIRECTIONS = {
  UP:    { row: -1, col:  0 },
  DOWN:  { row:  1, col:  0 },
  LEFT:  { row:  0, col: -1 },
  RIGHT: { row:  0, col:  1 },
};

export const POWER_UP_TYPES = {
  SLOW:   'SLOW',
  BONUS:  'BONUS',
  SPEED:  'SPEED',
  SHIELD: 'SHIELD',
  SHRINK: 'SHRINK',
  WRAP:   'WRAP',
  GHOST:  'GHOST',
  MAGNET: 'MAGNET',
};

const POWER_UP_ORDER = [
  POWER_UP_TYPES.SLOW,
  POWER_UP_TYPES.BONUS,
  POWER_UP_TYPES.SPEED,
  POWER_UP_TYPES.SHIELD,
  POWER_UP_TYPES.SHRINK,
  POWER_UP_TYPES.WRAP,
  POWER_UP_TYPES.GHOST,
  POWER_UP_TYPES.MAGNET,
];

export const SNAKE_FORMS = [
  { level: 1, minScore:  0, name: 'Little Grass Snake', slug: 'grass-snake'   },
  { level: 2, minScore:  4, name: 'Garter Snake',       slug: 'garter-snake'  },
  { level: 3, minScore:  8, name: 'Rat Snake',          slug: 'rat-snake'     },
  { level: 4, minScore: 12, name: 'Sand Boa',           slug: 'sand-boa'      },
  { level: 5, minScore: 16, name: 'Viper',              slug: 'viper'         },
  { level: 6, minScore: 20, name: 'King Cobra',         slug: 'king-cobra'    },
  { level: 7, minScore: 26, name: 'Winged Dragon',      slug: 'winged-dragon' },
];

const DEFAULT_OPTIONS = {
  powerUpSpawnChance:  0.1,
  slowDurationTicks:   25,
  speedDurationTicks:  20,
  bonusScore:          3,
  shrinkBy:            2,
  wrapDurationTicks:   30,
  ghostDurationTicks:  20,
  magnetDurationTicks: 25,
  obstaclesPerLevel:   2,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function samePos(a, b) {
  return a && b && a.row === b.row && a.col === b.col;
}

function isOpposite(current, next) {
  return current.row + next.row === 0 && current.col + next.col === 0;
}

function wrapCoord(value, max) {
  return ((value % max) + max) % max;
}

function spawnRandomEmptyCell(rows, cols, occupied, blocked = [], rng = Math.random) {
  const occupiedSet = new Set(occupied.map((p) => `${p.row}:${p.col}`));
  const blockedSet  = new Set(blocked.map((p)  => `${p.row}:${p.col}`));
  const free = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const key = `${row}:${col}`;
      if (!occupiedSet.has(key) && !blockedSet.has(key)) free.push({ row, col });
    }
  }

  if (free.length === 0) return null;
  const index = Math.max(0, Math.min(free.length - 1, Math.floor(rng() * free.length)));
  return free[index];
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export function getFormForScore(score) {
  let selected = SNAKE_FORMS[0];
  for (const form of SNAKE_FORMS) {
    if (score >= form.minScore) selected = form;
  }
  return selected;
}

export function spawnFood(rows, cols, occupied, blockedOrRng = [], maybeRng = Math.random) {
  const blocked = Array.isArray(blockedOrRng) ? blockedOrRng : [];
  const rng     = typeof blockedOrRng === 'function' ? blockedOrRng : maybeRng;
  return spawnRandomEmptyCell(rows, cols, occupied, blocked, rng);
}

export function spawnPowerUp(rows, cols, snake, food, rng = Math.random) {
  const roll      = rng();
  const typeIndex = Math.min(POWER_UP_ORDER.length - 1, Math.floor(roll * POWER_UP_ORDER.length));
  const type      = POWER_UP_ORDER[typeIndex];
  const position  = spawnRandomEmptyCell(rows, cols, snake, food ? [food] : [], rng);
  if (!position) return null;
  return { ...position, type };
}

export function createInitialState({ rows = 20, cols = 20, rng = Math.random } = {}) {
  const centerRow = Math.floor(rows / 2);
  const centerCol = Math.floor(cols / 2);

  const snake = [
    { row: centerRow, col: centerCol },
    { row: centerRow, col: Math.max(0, centerCol - 1) },
    { row: centerRow, col: Math.max(0, centerCol - 2) },
  ];

  // One portal pair: top-left ↔ bottom-right
  const portals = rows >= 6 && cols >= 6
    ? [{ a: { row: 1, col: 1 }, b: { row: rows - 2, col: cols - 2 } }]
    : [];

  const portalCells = portals.flatMap((p) => [p.a, p.b]);
  const obstacles   = [];

  const score = 0;
  const form  = getFormForScore(score);
  const food  = spawnFood(rows, cols, snake, [...obstacles, ...portalCells], rng);

  // Enemy starts at bottom-right corner moving left
  const enemy = {
    snake: [
      { row: rows - 1, col: cols - 1 },
      { row: rows - 1, col: Math.max(0, cols - 2) },
      { row: rows - 1, col: Math.max(0, cols - 3) },
    ],
    direction: DIRECTIONS.LEFT,
  };

  return {
    rows, cols, snake,
    direction: DIRECTIONS.RIGHT,
    food,
    powerUp: null,
    projectiles: [],
    obstacles,
    portals,
    enemy,
    effects: {
      slowTicks:   0,
      speedTicks:  0,
      shieldHits:  0,
      wrapTicks:   0,
      ghostTicks:  0,
      magnetTicks: 0,
    },
    score,
    level: form.level,
    form,
    gameOver: false,
  };
}

export function setDirection(state, nextDirection) {
  if (!nextDirection || state.gameOver) return state;
  if (isOpposite(state.direction, nextDirection)) return state;
  return { ...state, direction: nextDirection };
}

export function fireProjectile(state) {
  if (state.gameOver) return state;
  const head = state.snake[0];
  const newProjectile = {
    row:       head.row + state.direction.row,
    col:       head.col + state.direction.col,
    direction: { ...state.direction },
    ttl:       30,
  };
  return { ...state, projectiles: [...(state.projectiles || []), newProjectile] };
}

// ─── Internal ────────────────────────────────────────────────────────────────

function applyPowerUp(state, powerUpType, config) {
  const nextEffects = { ...state.effects };
  let nextScore = state.score;
  let nextSnake = state.snake;

  if (powerUpType === POWER_UP_TYPES.SLOW)   nextEffects.slowTicks   = config.slowDurationTicks;
  if (powerUpType === POWER_UP_TYPES.SPEED)  nextEffects.speedTicks  = config.speedDurationTicks;
  if (powerUpType === POWER_UP_TYPES.SHIELD) nextEffects.shieldHits += 1;
  if (powerUpType === POWER_UP_TYPES.BONUS)  nextScore += config.bonusScore;
  if (powerUpType === POWER_UP_TYPES.WRAP)   nextEffects.wrapTicks   = config.wrapDurationTicks;
  if (powerUpType === POWER_UP_TYPES.GHOST)  nextEffects.ghostTicks  = config.ghostDurationTicks;
  if (powerUpType === POWER_UP_TYPES.MAGNET) nextEffects.magnetTicks = config.magnetDurationTicks;

  if (powerUpType === POWER_UP_TYPES.SHRINK) {
    const nextLength = Math.max(3, state.snake.length - config.shrinkBy);
    nextSnake = state.snake.slice(0, nextLength);
  }

  return { nextEffects, nextScore, nextSnake };
}

function moveEnemy(enemy, rows, cols, food, obstacles) {
  const head = enemy.snake[0];
  const allDirs = [DIRECTIONS.UP, DIRECTIONS.DOWN, DIRECTIONS.LEFT, DIRECTIONS.RIGHT];
  const obsSet  = new Set((obstacles || []).map((o) => `${o.row}:${o.col}`));

  const candidates = allDirs
    .filter((d) => !isOpposite(enemy.direction, d))
    .map((d) => {
      const nr   = wrapCoord(head.row + d.row, rows);
      const nc   = wrapCoord(head.col + d.col, cols);
      const safe = !obsSet.has(`${nr}:${nc}`);
      const dist = food ? Math.abs(nr - food.row) + Math.abs(nc - food.col) : 0;
      return { d, nr, nc, safe, dist };
    })
    .filter((c) => c.safe)
    .sort((a, b) => a.dist - b.dist);

  if (candidates.length === 0) return enemy; // stuck, don't move

  const chosen    = candidates[0];
  const nextHead  = { row: chosen.nr, col: chosen.nc };
  const nextSnake = [nextHead, ...enemy.snake.slice(0, -1)];
  return { snake: nextSnake, direction: chosen.d };
}

// ─── Tick ─────────────────────────────────────────────────────────────────────

export function tick(state, rng = Math.random, options = DEFAULT_OPTIONS) {
  if (state.gameOver) return state;

  const config = { ...DEFAULT_OPTIONS, ...options };
  const effects = {
    slowTicks:   Math.max(0, state.effects?.slowTicks   ?? 0),
    speedTicks:  Math.max(0, state.effects?.speedTicks  ?? 0),
    shieldHits:  Math.max(0, state.effects?.shieldHits  ?? 0),
    wrapTicks:   Math.max(0, state.effects?.wrapTicks   ?? 0),
    ghostTicks:  Math.max(0, state.effects?.ghostTicks  ?? 0),
    magnetTicks: Math.max(0, state.effects?.magnetTicks ?? 0),
  };

  const obstacles  = state.obstacles  || [];
  const portals    = state.portals    || [];
  const projectiles = state.projectiles || [];

  // Magnet: pull food one step toward head before snake moves
  let currentFood = state.food;
  if (effects.magnetTicks > 0 && currentFood) {
    const head0   = state.snake[0];
    const rowDist = Math.abs(head0.row - currentFood.row);
    const colDist = Math.abs(head0.col - currentFood.col);
    const dr = Math.sign(head0.row - currentFood.row);
    const dc = Math.sign(head0.col - currentFood.col);
    let mfr = currentFood.row;
    let mfc = currentFood.col;
    if (rowDist >= colDist && dr !== 0) mfr += dr;
    else if (dc !== 0) mfc += dc;
    const newFoodPos = { row: mfr, col: mfc };
    const onSnake    = state.snake.some((s) => samePos(s, newFoodPos));
    const onObs      = obstacles.some((o) => samePos(o, newFoodPos));
    const inBounds   = mfr >= 0 && mfr < state.rows && mfc >= 0 && mfc < state.cols;
    if (!onSnake && !onObs && inBounds) currentFood = newFoodPos;
  }

  // Compute next head
  const head = state.snake[0];
  let nextHead = { row: head.row + state.direction.row, col: head.col + state.direction.col };

  // Wall wrap
  const hitsWall = nextHead.row < 0 || nextHead.row >= state.rows || nextHead.col < 0 || nextHead.col >= state.cols;
  if (hitsWall && effects.wrapTicks > 0) {
    nextHead = { row: wrapCoord(nextHead.row, state.rows), col: wrapCoord(nextHead.col, state.cols) };
  }
  const actualHitsWall = hitsWall && effects.wrapTicks === 0;

  // Portal teleportation
  for (const portal of portals) {
    if (samePos(nextHead, portal.a)) { nextHead = { ...portal.b }; break; }
    if (samePos(nextHead, portal.b)) { nextHead = { ...portal.a }; break; }
  }

  // Collision checks
  const hitsBody     = effects.ghostTicks > 0 ? false : state.snake.some((s) => samePos(s, nextHead));
  const hitsObstacle = obstacles.some((o) => samePos(o, nextHead));
  const hitsEnemy    = (state.enemy?.snake || []).some((s) => samePos(s, nextHead));
  const lethal       = actualHitsWall || hitsBody || hitsObstacle || hitsEnemy;

  if (lethal && effects.shieldHits > 0) {
    return {
      ...state,
      food: currentFood,
      effects: {
        ...effects,
        slowTicks:   Math.max(0, effects.slowTicks  - 1),
        speedTicks:  Math.max(0, effects.speedTicks - 1),
        wrapTicks:   Math.max(0, effects.wrapTicks  - 1),
        ghostTicks:  Math.max(0, effects.ghostTicks - 1),
        magnetTicks: Math.max(0, effects.magnetTicks - 1),
        shieldHits:  effects.shieldHits - 1,
      },
    };
  }

  if (lethal) return { ...state, gameOver: true };

  // Move snake
  const willGrow = samePos(nextHead, currentFood);
  let nextSnake  = [nextHead, ...state.snake];
  if (!willGrow) nextSnake.pop();

  let nextScore  = willGrow ? state.score + 1 : state.score;
  let nextPowerUp = state.powerUp;
  let nextEffects = {
    ...effects,
    slowTicks:   Math.max(0, effects.slowTicks   - 1),
    speedTicks:  Math.max(0, effects.speedTicks  - 1),
    wrapTicks:   Math.max(0, effects.wrapTicks   - 1),
    ghostTicks:  Math.max(0, effects.ghostTicks  - 1),
    magnetTicks: Math.max(0, effects.magnetTicks - 1),
  };

  // Collect power-up
  if (nextPowerUp && samePos(nextHead, nextPowerUp)) {
    const applied = applyPowerUp({ ...state, snake: nextSnake, effects: nextEffects, score: nextScore }, nextPowerUp.type, config);
    nextSnake   = applied.nextSnake;
    nextScore   = applied.nextScore;
    nextEffects = applied.nextEffects;
    nextPowerUp = null;
  }

  // Food respawn / obstacle spawn on level-up
  const prevLevel = state.form.level;
  const form      = getFormForScore(nextScore);
  let nextObstacles = obstacles;

  let nextFood = willGrow
    ? spawnFood(state.rows, state.cols, nextSnake, [...nextObstacles, ...(nextPowerUp ? [nextPowerUp] : []), ...portals.flatMap((p) => [p.a, p.b])], rng)
    : currentFood;

  if (form.level > prevLevel) {
    const levelsGained = form.level - prevLevel;
    for (let i = 0; i < levelsGained * config.obstaclesPerLevel; i += 1) {
      const occupied = [...nextSnake, ...nextObstacles, ...(nextFood ? [nextFood] : []), ...portals.flatMap((p) => [p.a, p.b])];
      const pos = spawnRandomEmptyCell(state.rows, state.cols, occupied, [], rng);
      if (pos) nextObstacles = [...nextObstacles, pos];
    }
  }

  if (!nextPowerUp && rng() < config.powerUpSpawnChance) {
    const blocked = [...nextObstacles, ...portals.flatMap((p) => [p.a, p.b])];
    nextPowerUp = spawnPowerUp(state.rows, state.cols, nextSnake, nextFood, rng);
    // Avoid spawning on obstacle/portal
    if (nextPowerUp) {
      const onBlocked = blocked.some((b) => samePos(b, nextPowerUp));
      if (onBlocked) nextPowerUp = null;
    }
  }

  // Move projectiles
  const nextProjectiles = [];
  for (const proj of projectiles) {
    const newRow = proj.row + proj.direction.row;
    const newCol = proj.col + proj.direction.col;
    const newTtl = proj.ttl - 1;
    if (newTtl <= 0) continue;

    const outOfBounds = newRow < 0 || newRow >= state.rows || newCol < 0 || newCol >= state.cols;
    if (outOfBounds) {
      if (effects.wrapTicks > 0) {
        nextProjectiles.push({ ...proj, row: wrapCoord(newRow, state.rows), col: wrapCoord(newCol, state.cols), ttl: newTtl });
      }
      continue;
    }

    const newPos = { row: newRow, col: newCol };

    if (nextFood && samePos(newPos, nextFood)) {
      nextFood = spawnFood(state.rows, state.cols, nextSnake, [...nextObstacles, ...(nextPowerUp ? [nextPowerUp] : [])], rng);
      continue;
    }
    if (nextPowerUp && samePos(newPos, nextPowerUp)) {
      const applied = applyPowerUp({ ...state, snake: nextSnake, effects: nextEffects, score: nextScore }, nextPowerUp.type, config);
      nextSnake   = applied.nextSnake;
      nextScore   = applied.nextScore;
      nextEffects = applied.nextEffects;
      nextPowerUp = null;
      continue;
    }

    nextProjectiles.push({ ...proj, row: newRow, col: newCol, ttl: newTtl });
  }

  // Move enemy
  const nextEnemy = state.enemy
    ? moveEnemy(state.enemy, state.rows, state.cols, nextFood, nextObstacles)
    : null;

  return {
    ...state,
    snake:       nextSnake,
    score:       nextScore,
    level:       form.level,
    form,
    food:        nextFood,
    powerUp:     nextPowerUp,
    projectiles: nextProjectiles,
    obstacles:   nextObstacles,
    enemy:       nextEnemy,
    effects:     nextEffects,
  };
}
