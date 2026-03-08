import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DIRECTIONS,
  POWER_UP_TYPES,
  getFormForScore,
  setDirection,
  spawnFood,
  spawnPowerUp,
  tick,
} from '../src/snakeLogic.mjs';

function state(overrides = {}) {
  return {
    rows: 6,
    cols: 6,
    snake: [
      { row: 2, col: 2 },
      { row: 2, col: 1 },
      { row: 2, col: 0 },
    ],
    direction: DIRECTIONS.RIGHT,
    food: { row: 4, col: 4 },
    powerUp: null,
    effects: { slowTicks: 0, speedTicks: 0, shieldHits: 0 },
    score: 0,
    level: 1,
    form: getFormForScore(0),
    gameOver: false,
    ...overrides,
  };
}

test('moves snake forward by one cell', () => {
  const next = tick(state(), () => 1, { powerUpSpawnChance: 0 });

  assert.deepEqual(next.snake, [
    { row: 2, col: 3 },
    { row: 2, col: 2 },
    { row: 2, col: 1 },
  ]);
  assert.equal(next.score, 0);
  assert.equal(next.gameOver, false);
});

test('eating food grows snake and increments score', () => {
  const next = tick(
    state({ food: { row: 2, col: 3 } }),
    () => 0,
    { powerUpSpawnChance: 0 },
  );

  assert.equal(next.score, 1);
  assert.equal(next.snake.length, 4);
  assert.deepEqual(next.snake[0], { row: 2, col: 3 });
  assert.notDeepEqual(next.food, { row: 2, col: 3 });
});

test('wall collision sets game over without shield', () => {
  const next = tick(
    state({
      rows: 3,
      cols: 3,
      snake: [{ row: 1, col: 2 }],
      direction: DIRECTIONS.RIGHT,
    }),
    () => 1,
    { powerUpSpawnChance: 0 },
  );

  assert.equal(next.gameOver, true);
});

test('self collision sets game over without shield', () => {
  const next = tick(
    state({
      snake: [
        { row: 2, col: 2 },
        { row: 2, col: 1 },
        { row: 3, col: 1 },
        { row: 3, col: 2 },
      ],
      direction: DIRECTIONS.DOWN,
    }),
    () => 1,
    { powerUpSpawnChance: 0 },
  );

  assert.equal(next.gameOver, true);
});

test('moving into previous tail position is allowed when not growing', () => {
  const next = tick(
    state({
      snake: [
        { row: 2, col: 2 },
        { row: 2, col: 1 },
        { row: 3, col: 1 },
        { row: 3, col: 2 },
      ],
      direction: DIRECTIONS.RIGHT,
      food: { row: 0, col: 0 },
    }),
    () => 1,
    { powerUpSpawnChance: 0 },
  );

  assert.equal(next.gameOver, false);
  assert.deepEqual(next.snake[0], { row: 2, col: 3 });
});

test('setDirection ignores immediate reverse direction', () => {
  const next = setDirection(state(), DIRECTIONS.LEFT);

  assert.deepEqual(next.direction, DIRECTIONS.RIGHT);
});

test('spawnFood returns null when board is full', () => {
  const food = spawnFood(1, 1, [{ row: 0, col: 0 }], () => 0);
  assert.equal(food, null);
});

test('spawnPowerUp maps random rolls to all 5 types', () => {
  const snake = [{ row: 0, col: 0 }];
  const food = { row: 0, col: 1 };

  const p1 = spawnPowerUp(2, 3, snake, food, () => 0.01);
  const p2 = spawnPowerUp(2, 3, snake, food, () => 0.21);
  const p3 = spawnPowerUp(2, 3, snake, food, () => 0.41);
  const p4 = spawnPowerUp(2, 3, snake, food, () => 0.61);
  const p5 = spawnPowerUp(2, 3, snake, food, () => 0.81);

  assert.equal(p1.type, POWER_UP_TYPES.SLOW);
  assert.equal(p2.type, POWER_UP_TYPES.BONUS);
  assert.equal(p3.type, POWER_UP_TYPES.SPEED);
  assert.equal(p4.type, POWER_UP_TYPES.SHIELD);
  assert.equal(p5.type, POWER_UP_TYPES.SHRINK);
});

test('slow power-up activates slowTicks', () => {
  const next = tick(
    state({ powerUp: { row: 2, col: 3, type: POWER_UP_TYPES.SLOW } }),
    () => 1,
    { powerUpSpawnChance: 0, slowDurationTicks: 10 },
  );

  assert.equal(next.effects.slowTicks, 10);
  assert.equal(next.powerUp, null);
});

test('speed power-up activates speedTicks', () => {
  const next = tick(
    state({ powerUp: { row: 2, col: 3, type: POWER_UP_TYPES.SPEED } }),
    () => 1,
    { powerUpSpawnChance: 0, speedDurationTicks: 9 },
  );

  assert.equal(next.effects.speedTicks, 9);
  assert.equal(next.powerUp, null);
});

test('shield power-up adds one shield hit and blocks one collision', () => {
  const withShield = tick(
    state({ powerUp: { row: 2, col: 3, type: POWER_UP_TYPES.SHIELD } }),
    () => 1,
    { powerUpSpawnChance: 0 },
  );

  assert.equal(withShield.effects.shieldHits, 1);

  const afterCollision = tick(
    {
      ...withShield,
      rows: 3,
      cols: 3,
      snake: [{ row: 1, col: 2 }],
      direction: DIRECTIONS.RIGHT,
    },
    () => 1,
    { powerUpSpawnChance: 0 },
  );

  assert.equal(afterCollision.gameOver, false);
  assert.equal(afterCollision.effects.shieldHits, 0);
});

test('bonus power-up adds bonus score', () => {
  const next = tick(
    state({ powerUp: { row: 2, col: 3, type: POWER_UP_TYPES.BONUS } }),
    () => 1,
    { powerUpSpawnChance: 0, bonusScore: 5 },
  );

  assert.equal(next.score, 5);
  assert.equal(next.powerUp, null);
});

test('shrink power-up reduces length but not below 3', () => {
  const next = tick(
    state({
      powerUp: { row: 2, col: 3, type: POWER_UP_TYPES.SHRINK },
      snake: [
        { row: 2, col: 2 },
        { row: 2, col: 1 },
        { row: 2, col: 0 },
        { row: 1, col: 0 },
        { row: 0, col: 0 },
      ],
    }),
    () => 1,
    { powerUpSpawnChance: 0, shrinkBy: 2 },
  );

  assert.equal(next.snake.length, 3);
});

test('score progression updates level and final form to winged dragon', () => {
  const finalState = state({ score: 26, form: getFormForScore(26), level: getFormForScore(26).level });
  const next = tick(
    { ...finalState, food: { row: 2, col: 3 } },
    () => 1,
    { powerUpSpawnChance: 0 },
  );

  assert.equal(next.level, 7);
  assert.equal(next.form.slug, 'winged-dragon');
});
