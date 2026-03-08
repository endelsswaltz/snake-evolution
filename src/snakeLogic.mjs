export const DIRECTIONS = {
  UP: { row: -1, col: 0 },
  DOWN: { row: 1, col: 0 },
  LEFT: { row: 0, col: -1 },
  RIGHT: { row: 0, col: 1 },
};

export const POWER_UP_TYPES = {
  SLOW: 'SLOW',
  BONUS: 'BONUS',
  SPEED: 'SPEED',
  SHIELD: 'SHIELD',
  SHRINK: 'SHRINK',
  WRAP: 'WRAP',
};

const POWER_UP_ORDER = [
  POWER_UP_TYPES.SLOW,
  POWER_UP_TYPES.BONUS,
  POWER_UP_TYPES.SPEED,
  POWER_UP_TYPES.SHIELD,
  POWER_UP_TYPES.SHRINK,
  POWER_UP_TYPES.WRAP,
];

export const SNAKE_FORMS = [
  { level: 1, minScore: 0, name: 'Little Grass Snake', slug: 'grass-snake' },
  { level: 2, minScore: 4, name: 'Garter Snake', slug: 'garter-snake' },
  { level: 3, minScore: 8, name: 'Rat Snake', slug: 'rat-snake' },
  { level: 4, minScore: 12, name: 'Sand Boa', slug: 'sand-boa' },
  { level: 5, minScore: 16, name: 'Viper', slug: 'viper' },
  { level: 6, minScore: 20, name: 'King Cobra', slug: 'king-cobra' },
  { level: 7, minScore: 26, name: 'Winged Dragon', slug: 'winged-dragon' },
];

const DEFAULT_OPTIONS = {
  powerUpSpawnChance: 0.1,
  slowDurationTicks: 25,
  speedDurationTicks: 20,
  bonusScore: 3,
  shrinkBy: 2,
  wrapDurationTicks: 30,
};

function samePos(a, b) {
  return a && b && a.row === b.row && a.col === b.col;
}

function isOpposite(current, next) {
  return current.row + next.row === 0 && current.col + next.col === 0;
}

export function getFormForScore(score) {
  let selected = SNAKE_FORMS[0];
  for (const form of SNAKE_FORMS) {
    if (score >= form.minScore) {
      selected = form;
    }
  }
  return selected;
}

export function spawnFood(rows, cols, occupied, blockedOrRng = [], maybeRng = Math.random) {
  const blocked = Array.isArray(blockedOrRng) ? blockedOrRng : [];
  const rng = typeof blockedOrRng === 'function' ? blockedOrRng : maybeRng;
  return spawnRandomEmptyCell(rows, cols, occupied, blocked, rng);
}

function spawnRandomEmptyCell(rows, cols, occupied, blocked = [], rng = Math.random) {
  const occupiedSet = new Set(occupied.map((p) => `${p.row}:${p.col}`));
  const blockedSet = new Set(blocked.map((p) => `${p.row}:${p.col}`));
  const free = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const key = `${row}:${col}`;
      if (!occupiedSet.has(key) && !blockedSet.has(key)) {
        free.push({ row, col });
      }
    }
  }

  if (free.length === 0) {
    return null;
  }

  const raw = Math.floor(rng() * free.length);
  const index = Math.max(0, Math.min(free.length - 1, raw));
  return free[index];
}

export function spawnPowerUp(rows, cols, snake, food, rng = Math.random) {
  const roll = rng();
  const typeIndex = Math.min(POWER_UP_ORDER.length - 1, Math.floor(roll * POWER_UP_ORDER.length));
  const type = POWER_UP_ORDER[typeIndex];
  const position = spawnRandomEmptyCell(rows, cols, snake, food ? [food] : [], rng);

  if (!position) {
    return null;
  }

  return { ...position, type };
}

export function createInitialState({ rows = 20, cols = 20, rng = Math.random } = {}) {
  const centerRow = Math.floor(rows / 2);
  const centerCol = Math.floor(cols / 2);
  const head = { row: centerRow, col: centerCol };

  const snake = [
    head,
    { row: centerRow, col: Math.max(0, centerCol - 1) },
    { row: centerRow, col: Math.max(0, centerCol - 2) },
  ];

  const score = 0;
  const form = getFormForScore(score);

  return {
    rows,
    cols,
    snake,
    direction: DIRECTIONS.RIGHT,
    food: spawnFood(rows, cols, snake, rng),
    powerUp: null,
    projectiles: [],
    effects: {
      slowTicks: 0,
      speedTicks: 0,
      shieldHits: 0,
      wrapTicks: 0,
    },
    score,
    level: form.level,
    form,
    gameOver: false,
  };
}

export function setDirection(state, nextDirection) {
  if (!nextDirection || state.gameOver) {
    return state;
  }

  if (isOpposite(state.direction, nextDirection)) {
    return state;
  }

  return { ...state, direction: nextDirection };
}

export function fireProjectile(state) {
  if (state.gameOver) return state;
  const head = state.snake[0];
  const newProjectile = {
    row: head.row + state.direction.row,
    col: head.col + state.direction.col,
    direction: { ...state.direction },
    ttl: 30,
  };
  return { ...state, projectiles: [...(state.projectiles || []), newProjectile] };
}

function applyPowerUp(state, powerUpType, config) {
  const nextEffects = { ...state.effects };
  let nextScore = state.score;
  let nextSnake = state.snake;

  if (powerUpType === POWER_UP_TYPES.SLOW) {
    nextEffects.slowTicks = config.slowDurationTicks;
  }

  if (powerUpType === POWER_UP_TYPES.SPEED) {
    nextEffects.speedTicks = config.speedDurationTicks;
  }

  if (powerUpType === POWER_UP_TYPES.SHIELD) {
    nextEffects.shieldHits += 1;
  }

  if (powerUpType === POWER_UP_TYPES.BONUS) {
    nextScore += config.bonusScore;
  }

  if (powerUpType === POWER_UP_TYPES.SHRINK) {
    const minLength = 3;
    const nextLength = Math.max(minLength, state.snake.length - config.shrinkBy);
    nextSnake = state.snake.slice(0, nextLength);
  }

  if (powerUpType === POWER_UP_TYPES.WRAP) {
    nextEffects.wrapTicks = config.wrapDurationTicks;
  }

  return {
    nextEffects,
    nextScore,
    nextSnake,
  };
}

function wrapCoord(value, max) {
  return ((value % max) + max) % max;
}

export function tick(state, rng = Math.random, options = DEFAULT_OPTIONS) {
  if (state.gameOver) {
    return state;
  }

  const config = { ...DEFAULT_OPTIONS, ...options };
  const effects = {
    slowTicks: Math.max(0, state.effects?.slowTicks ?? 0),
    speedTicks: Math.max(0, state.effects?.speedTicks ?? 0),
    shieldHits: Math.max(0, state.effects?.shieldHits ?? 0),
    wrapTicks: Math.max(0, state.effects?.wrapTicks ?? 0),
  };

  const head = state.snake[0];
  let nextHead = {
    row: head.row + state.direction.row,
    col: head.col + state.direction.col,
  };

  const hitsWall =
    nextHead.row < 0 ||
    nextHead.row >= state.rows ||
    nextHead.col < 0 ||
    nextHead.col >= state.cols;

  if (hitsWall && effects.wrapTicks > 0) {
    nextHead = {
      row: wrapCoord(nextHead.row, state.rows),
      col: wrapCoord(nextHead.col, state.cols),
    };
  }

  const actualHitsWall = hitsWall && effects.wrapTicks === 0;
  const willGrow = samePos(nextHead, state.food);
  const hitsBody = state.snake.some((segment) => samePos(segment, nextHead));

  if ((actualHitsWall || hitsBody) && effects.shieldHits > 0) {
    return {
      ...state,
      effects: {
        ...effects,
        slowTicks: Math.max(0, effects.slowTicks - 1),
        speedTicks: Math.max(0, effects.speedTicks - 1),
        wrapTicks: Math.max(0, effects.wrapTicks - 1),
        shieldHits: effects.shieldHits - 1,
      },
    };
  }

  if (actualHitsWall || hitsBody) {
    return { ...state, gameOver: true };
  }

  let nextSnake = [nextHead, ...state.snake];
  if (!willGrow) {
    nextSnake.pop();
  }

  let nextScore = willGrow ? state.score + 1 : state.score;
  let nextPowerUp = state.powerUp;
  let nextEffects = {
    ...effects,
    slowTicks: Math.max(0, effects.slowTicks - 1),
    speedTicks: Math.max(0, effects.speedTicks - 1),
    wrapTicks: Math.max(0, effects.wrapTicks - 1),
  };

  if (nextPowerUp && samePos(nextHead, nextPowerUp)) {
    const applied = applyPowerUp({ ...state, snake: nextSnake, effects: nextEffects, score: nextScore }, nextPowerUp.type, config);
    nextSnake = applied.nextSnake;
    nextScore = applied.nextScore;
    nextEffects = applied.nextEffects;
    nextPowerUp = null;
  }

  let nextFood = willGrow
    ? spawnFood(
      state.rows,
      state.cols,
      nextSnake,
      nextPowerUp ? [nextPowerUp] : [],
      rng,
    )
    : state.food;

  if (!nextPowerUp && rng() < config.powerUpSpawnChance) {
    nextPowerUp = spawnPowerUp(state.rows, state.cols, nextSnake, nextFood, rng);
  }

  // Move projectiles
  const nextProjectiles = [];
  for (const proj of (state.projectiles || [])) {
    const newRow = proj.row + proj.direction.row;
    const newCol = proj.col + proj.direction.col;
    const newTtl = proj.ttl - 1;

    if (newTtl <= 0) continue;

    const projOutOfBounds =
      newRow < 0 || newRow >= state.rows || newCol < 0 || newCol >= state.cols;

    if (projOutOfBounds) {
      if (effects.wrapTicks > 0) {
        nextProjectiles.push({
          ...proj,
          row: wrapCoord(newRow, state.rows),
          col: wrapCoord(newCol, state.cols),
          ttl: newTtl,
        });
      }
      continue;
    }

    const newPos = { row: newRow, col: newCol };

    if (nextFood && samePos(newPos, nextFood)) {
      nextFood = spawnFood(state.rows, state.cols, nextSnake, nextPowerUp ? [nextPowerUp] : [], rng);
      continue;
    }

    if (nextPowerUp && samePos(newPos, nextPowerUp)) {
      const applied = applyPowerUp(
        { ...state, snake: nextSnake, effects: nextEffects, score: nextScore },
        nextPowerUp.type,
        config,
      );
      nextSnake = applied.nextSnake;
      nextScore = applied.nextScore;
      nextEffects = applied.nextEffects;
      nextPowerUp = null;
      continue;
    }

    nextProjectiles.push({ ...proj, row: newRow, col: newCol, ttl: newTtl });
  }

  const form = getFormForScore(nextScore);

  return {
    ...state,
    snake: nextSnake,
    score: nextScore,
    level: form.level,
    form,
    food: nextFood,
    powerUp: nextPowerUp,
    projectiles: nextProjectiles,
    effects: nextEffects,
  };
}
