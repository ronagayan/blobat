# Training Grounds — Goal-Based Game Design
**Date:** 2026-03-16
**Approach:** In-place surgical edits to `game.js` and `draw.js`

---

## 0. Reference: key existing structs and globals

```
player:        { x, y, vx, vy, radius, angle, hp, maxHp, alive (bool), invulnTimer, flashTimer,
                 rolling, rollTimer, rollDuration, rollCooldown, rollCooldownMax, rollDx, rollDy,
                 rollSpeed, ghosts, speed, friction }
trainingBall:  { x, y, vx, vy, radius, speed, squash, squashAngle, squashTimer, trail, stopped }
bounceParticles: [{ x, y, vx, vy, life, maxLife, radius }]     ← color field ADDED by this spec
damageNumbers:   [{ x, y, value (number OR string), color (optional), life, maxLife }]  ← color + string value ADDED
trnEnemies:    [{ x, y, vx, vy, radius, angle, hp, maxHp, flashTimer, splatTimer,
                 swingCooldown, swingProgress, swingStartAngle, swingDir,
                 prevBatBase, prevBatTip, hitThisSwing, color,
                 startX, startY }]   ← startX/startY ADDED by this spec
WW = 1600, WH = 900  (confirmed: these are the global canvas dimension names)
player.alive is already declared in the existing player object (initTraining sets it to true)
```

`mapCY` = `(TRN_T + TRN_B) / 2`. Already used as a local `const` inside `calcTrainingBounds()` and `initTraining()` in the existing code.

---

## 1. Map & Gate Zones

### Gate objects
`TRN_RECTS` is built as a fixed array literal inside `calcTrainingBounds()`. The two side-wall entries (currently the last two entries — indices 8 and 9) are **deleted from the literal** (just remove those two lines from the array). Their rect values are the same coords used for the gate objects below.

Two gate objects declared as **module-level `let`** (initialized to `null`, assigned inside `calcTrainingBounds()`):

```js
let GATE_LEFT  = null;
let GATE_RIGHT = null;
```

Inside `calcTrainingBounds()`, after `mapCY` is computed:

```js
GATE_LEFT  = { x: TRN_L + 50,  y: mapCY - 90, w: 35, h: 180 };
GATE_RIGHT = { x: TRN_R - 85,  y: mapCY - 90, w: 35, h: 180 };
```

**Team/scoring mapping** (no `team` field on gate — detection is explicit):

| Gate | Defended by | Ball scores for | Glow color |
|------|-------------|-----------------|------------|
| `GATE_LEFT` | BLUE | RED (+1 to `scores.RED`) | Blue `rgba(52,152,219,…)` |
| `GATE_RIGHT` | RED | BLUE (+1 to `scores.BLUE`) | Red `rgba(231,76,60,…)` |

### Goal detection
Each frame in `_updateBallPhysics`, when `goalFreezeTimer <= 0` and `!trainingBall.stopped`:

```js
function ballInGate(gate) {
  return trainingBall.x > gate.x && trainingBall.x < gate.x + gate.w &&
         trainingBall.y > gate.y && trainingBall.y < gate.y + gate.h;
}
if (ballInGate(GATE_LEFT))  triggerGoal('RED');
if (ballInGate(GATE_RIGHT)) triggerGoal('BLUE');
```

(Center-inside test — triggers when ball center enters the gate zone.)

### Gate visuals (in `draw.js`, world-space, drawn before obstacles)
For each gate (`GATE_LEFT` with blue color, `GATE_RIGHT` with red color):
1. **Glow fill** (clipped to gate rect): `alpha = 0.20 + 0.10 * Math.sin(performance.now() / 600)`
2. **Net lines**: two passes of diagonal lines at +45° and -45°, `rgba(255,255,255,0.12)`, clipped to gate rect
3. **Frame outline**: `ctx.strokeRect` (or `roundRect` with small radius), 3px, matching glow color at `alpha = 1`

---

## 2. Scoreboard HUD & Win Condition

### New module-level declarations (added near top of `game.js`)
```js
let scores        = { BLUE: 0, RED: 0 };
let scoreAnimBlue = 0;   // counts DOWN from 0.4 to 0 after BLUE scores
let scoreAnimRed  = 0;   // counts DOWN from 0.4 to 0 after RED scores
let goalFreezeTimer   = 0;   // counts DOWN from GOAL_FREEZE_DURATION to 0
let playerRespawnTimer = 0;  // counts DOWN from 2.0 to 0; 0 = not respawning
let gameState = 'playing';   // 'playing' | 'won'
let winner    = null;        // 'BLUE' | 'RED' | null
```

Remove `let gameOver = false;`.

### All existing `gameOver` read sites (update all three):
1. `updateTraining`: `if (gameOver) return;` → `if (gameState !== 'playing') return;`
2. `checkRestartClick`: `if (gameOver) { ... }` → `if (gameState === 'won') { ... }`
3. `drawTrainingHUD`: the `if (gameOver)` overlay block → **replaced** by the win overlay (see §2.5)

### Win condition
`GOALS_TO_WIN = 5`. Inside `triggerGoal` after `scores[team]++`:
```js
if (scores[team] >= GOALS_TO_WIN) { gameState = 'won'; winner = team; }
```

### Win overlay (in `drawTrainingHUD`)
When `gameState === 'won'`:
- Full-screen dark overlay
- Large text `"BLUE WINS!"` (color `#3498DB`) or `"RED WINS!"` (color `#E74C3C`)
- `"PLAY AGAIN"` button: rect `{ x: WW/2-100, y: WH/2+40, w: 200, h: 60 }` (same position as old RESTART_BTN)

### PLAY AGAIN hit test (in `checkRestartClick`)
```js
if (mouse.justDown && gameState === 'won') {
  const btn = { x: WW/2-100, y: WH/2+40, w: 200, h: 60 };
  if (mouse.screenX >= btn.x && mouse.screenX <= btn.x+btn.w &&
      mouse.screenY >= btn.y && mouse.screenY <= btn.y+btn.h) {
    restart();
  }
}
```

### `restart()` updated
```js
function restart() {
  gameState = 'playing'; winner = null;
  scores = { BLUE: 0, RED: 0 };
  scoreAnimBlue = 0; scoreAnimRed = 0;
  goalFreezeTimer = 0; playerRespawnTimer = 0;
  damageNumbers = [];
  initTraining();
}
```

### Scoreboard draw (in `drawTrainingHUD`)
Replaces the `TRAINING GROUNDS` mode label. Score bounce: `scoreAnimBlue` and `scoreAnimRed` are decremented by `dt` in `updateTraining` (floored at 0). Scale multiplier for scoring team's number = `1.0 + 0.3 * (timer / 0.4)` where `timer` is `scoreAnimBlue` or `scoreAnimRed`.

The anim timer for the **scoring** team (not the defending team):
- `triggerGoal('BLUE')` → `scoreAnimBlue = 0.4`
- `triggerGoal('RED')` → `scoreAnimRed = 0.4`

### Player death
In `applyBallDamage`, replace:
```js
if (entity === player && entity.hp < 0.5) { entity.hp = 0; gameOver = true; }
```
with:
```js
if (entity === player && entity.hp < 0.5) {
  entity.hp = 0;
  entity.alive = false;
  playerRespawnTimer = 2.0;
}
```

In `_updatePlayer`, add at the top:
```js
if (!player.alive) {
  playerRespawnTimer -= dt;
  if (playerRespawnTimer <= 0) {
    player.x = WW * 0.28;
    player.y = mapCY;   // use (TRN_T + TRN_B) / 2
    player.vx = 0; player.vy = 0;
    player.hp = PLAYER_HP;
    player.alive = true;
    player.invulnTimer = 1.0;
  }
  return; // skip movement/bat logic
}
```

---

## 3. Team System & Enemy AI

### `spawnAllEnemies(mapCY)`
Replaces `trnSpawnEnemy()`. Called **only from inside `initTraining()`** (where `mapCY` is already a local variable), immediately after `calcTrainingBounds()`. Never called directly from `restart()` — `restart()` calls `initTraining()` which calls `spawnAllEnemies`. The `mapCY` parameter is the local value computed in `initTraining()` as `(TRN_T + TRN_B) / 2`.

```js
function spawnAllEnemies(mapCY) {
  const starts = [
    { x: WW * 0.82, y: mapCY },
    { x: WW * 0.72, y: mapCY - 150 },
    { x: WW * 0.72, y: mapCY + 150 },
  ];
  trnEnemies = [];
  for (let i = 0; i < ENEMY_COUNT; i++) {
    const sx = starts[i].x, sy = starts[i].y;
    const angle = Math.atan2(trainingBall.y - sy, trainingBall.x - sx);
    const seg = _getEnemyBatSegment({ x: sx, y: sy, radius: 26 }, angle);
    trnEnemies.push({
      x: sx, y: sy, startX: sx, startY: sy,
      vx: 0, vy: 0,
      radius: 26, angle,
      hp: ENEMY_MAX_HP, maxHp: ENEMY_MAX_HP,
      flashTimer: 0, splatTimer: -1,
      swingCooldown: 0, swingProgress: -1,
      swingStartAngle: 0, swingDir: 1,
      prevBatBase: { x: seg.bx, y: seg.by },
      prevBatTip:  { x: seg.tx, y: seg.ty },
      hitThisSwing: false,
      color: '#E74C3C',
    });
  }
}
```

Remove `trnSpawnEnemy()` and `checkTrainingSpawnClick()` entirely. Remove `+ENEMY` button from `drawTrainingHUD`.

`ENEMY_MAX_COUNT` is **deleted**. `ENEMY_COUNT = 3` is the replacement constant.

### Enemy respawn after splat (in `_updateEnemies`)
Change the dead-enemy loop from splicing to resetting in-place:
```js
for (const enemy of trnEnemies) {
  if (enemy.splatTimer >= 0.4) {
    enemy.splatTimer   = -1;
    enemy.x            = enemy.startX;
    enemy.y            = enemy.startY;
    enemy.vx           = 0; enemy.vy = 0;
    enemy.hp           = ENEMY_MAX_HP;
    enemy.swingProgress = -1;
    enemy.swingCooldown = 0;
    enemy.hitThisSwing  = false;
  }
}
```

### Possession heuristic (module-level state, updated in `_updateEnemies`)
```js
let redPossession = false;
// inside _updateEnemies, before role logic:
if      (trainingBall.vx < -80) redPossession = true;
else if (trainingBall.vx >  80) redPossession = false;
// |vx| <= 80 → possession unchanged (hysteresis)
```

### Enemy roles (by array index, re-evaluated each frame when not mid-swing)

**`redPossession === true` (RED attacking, aiming at GATE_LEFT):**
Note: RED scores by putting the ball INTO `GATE_LEFT` (BLUE's goal). So RED's attacker aims at `GATE_LEFT` — this is correct.

- `trnEnemies[0]` = **Attacker**: existing CHASE and SWING_INIT logic; at SWING_INIT entry, override:
  ```js
  enemy.swingStartAngle = Math.atan2(
    GATE_LEFT.y + GATE_LEFT.h / 2 - enemy.y,
    GATE_LEFT.x + GATE_LEFT.w / 2 - enemy.x
  );
  ```
- `trnEnemies[1]`, `trnEnemies[2]` = **Support**: steer toward `(WW*0.6, mapCY-120)` and `(WW*0.6, mapCY+120)` respectively at `ENEMY_SPEED`

**`redPossession === false` (BLUE attacking, RED defending GATE_RIGHT):**
- `trnEnemies[0]` = **Goalkeeper**: compute target position between ball and GATE_RIGHT center:
  - `targetX = clamp(trainingBall.x * 0.3 + (GATE_RIGHT.x + GATE_RIGHT.w/2) * 0.7, TRN_R-200, TRN_R-120)`
  - `targetY = clamp(trainingBall.y, GATE_RIGHT.y - 60, GATE_RIGHT.y + GATE_RIGHT.h + 60)`
  - Steer toward `(targetX, targetY)` at `ENEMY_SPEED`
- `trnEnemies[1]`, `trnEnemies[2]` = **Interceptors**: steer toward predicted intercept:
  - `ix = clamp(trainingBall.x + trainingBall.vx * 0.3, TRN_L+40, TRN_R-40)`
  - `iy = clamp(trainingBall.y + trainingBall.vy * 0.3, TRN_T+40, TRN_B-40)`
  - Steer toward `(ix, iy)` at `ENEMY_SPEED`

**All roles:** existing DODGE (ball speed > 200) takes priority over role logic. Existing wall repulsion unchanged.

**Separation:** after all movement, for each pair `(i, j)` where `i < j`, if `dist < 80`, push both enemies apart by `(80 - dist) * 0.5` along the separation axis.

---

## 4. Goal Celebration & Respawn

### `triggerGoal(team)`
```
1. trainingBall.vx = 0; trainingBall.vy = 0; trainingBall.stopped = true;
   goalFreezeTimer = GOAL_FREEZE_DURATION;  // 1.0 seconds

2. Determine gate center:
   const gate = (team === 'RED') ? GATE_LEFT : GATE_RIGHT;
   const gateCx = gate.x + gate.w / 2;
   const gateCy = gate.y + gate.h / 2;
   const teamColor = (team === 'RED') ? '#E74C3C' : '#3498DB';

3. Spawn 25 goal particles into bounceParticles:
   for 25 iterations: random angle, random speed 150–400,
   push { x: gateCx, y: gateCy, vx: cos(a)*spd, vy: sin(a)*spd,
          life: 0.8, maxLife: 0.8, radius: 4+rand*4, color: teamColor }

4. Set score anim timer (scoring team):
   if (team === 'BLUE') scoreAnimBlue = 0.4;
   else                 scoreAnimRed  = 0.4;

5. Push +1 float to damageNumbers:
   { x: gateCx, y: gateCy - 20, value: '+1', color: teamColor,
     life: 1.0, maxLife: 1.0 }

6. scores[team]++;
   if (scores[team] >= GOALS_TO_WIN) { gameState = 'won'; winner = team; }
```

### `goalFreezeTimer` countdown and `respawnAfterGoal` call (in `updateTraining`)
`playerRespawnTimer` is decremented **before** the freeze check so it continues counting down even during a goal freeze:

```js
// Always run — not affected by freeze
if (!player.alive && playerRespawnTimer > 0) {
  playerRespawnTimer -= dt;
  // actual respawn handled inside _updatePlayer's early-return block
  // (or inline here — pick one place, consistently)
}

// Freeze block — suspends all other updates
if (goalFreezeTimer > 0) {
  goalFreezeTimer -= dt;
  if (goalFreezeTimer <= 0) { goalFreezeTimer = 0; respawnAfterGoal(); }
  return;
}
```

Note: `_updatePlayer` already handles the respawn-in-place when `playerRespawnTimer <= 0`. Moving the `playerRespawnTimer -= dt` before the freeze block ensures this still fires during a freeze. Do not decrement it in both places — only before the freeze block.

### `respawnAfterGoal()`
```js
function respawnAfterGoal() {
  const mapCY = (TRN_T + TRN_B) / 2;
  // Ball
  trainingBall.x = WW / 2; trainingBall.y = mapCY;
  trainingBall.vx = 0; trainingBall.vy = 0;
  trainingBall.speed = 0; trainingBall.stopped = true;
  trainingBall.trail = [];
  // Enemies
  for (const e of trnEnemies) {
    e.x = e.startX; e.y = e.startY;
    e.vx = 0; e.vy = 0;
    e.hp = ENEMY_MAX_HP;
    e.splatTimer = -1;         // cancel any in-progress splat
    e.swingProgress = -1;
    e.swingCooldown = 0;
    e.hitThisSwing = false;
  }
  // Player
  if (!player.alive) {
    player.x = WW * 0.28; player.y = mapCY;
    player.vx = 0; player.vy = 0;
    player.hp = PLAYER_HP;
    player.alive = true;
    player.invulnTimer = 1.0;
    playerRespawnTimer = 0;
  }
}
```

### `bounceParticles` draw loop (existing, in `draw.js`)
Add color fallback:
```js
ctx.fillStyle = p.color ? clayCircleGradient(p.x, p.y, p.radius, p.color)
                         : clayCircleGradient(p.x, p.y, p.radius, CLAY.wallBase);
```

### `damageNumbers` draw loop (existing, in `drawTrainingHUD`)
Update render to handle string values and optional color:
```js
const label = typeof dn.value === 'string' ? dn.value : ('-' + dn.value);
// use dn.color if present, else existing computed color (yellow→white fade)
const col = dn.color || `rgb(${r},${g},${b})`;
ctx.fillStyle = col;
ctx.strokeText(label, dn.x, dn.y);
ctx.fillText(label, dn.x, dn.y);
```

---

## 5. New Constants

```js
const GOALS_TO_WIN         = 5;
const GOAL_FREEZE_DURATION = 1.0;   // seconds
const ENEMY_COUNT          = 3;
// ENEMY_MAX_COUNT: DELETED (remove all references)
```

All other existing constants unchanged: `DAMAGE_MULTIPLIER`, `ENEMY_MAX_HP`, `PLAYER_HP`, `MAX_BALL_SPEED`, `ENEMY_SPEED`, `ENEMY_DODGE_SPEED`, `ENEMY_BAT_LENGTH`, `ENEMY_BAT_WIDTH`.

---

## 6. Files Changed

| File | Changes |
|------|---------|
| `game.js` | New constants; gate objects in `calcTrainingBounds`; remove side-wall rects; `gameState`/`winner`/`scores`/timers replacing `gameOver`; `triggerGoal`; `respawnAfterGoal`; `spawnAllEnemies`; enemy respawn-in-place; enemy AI roles + possession heuristic; player death→respawn; `restart()` updated |
| `draw.js` | Gate drawing; scoreboard HUD; win overlay + PLAY AGAIN hit test; particle color fallback; damageNumber string/color |

---

## 7. Implementation Order

1. New constants; delete `ENEMY_MAX_COUNT`
2. Gate objects declared at module level; assigned in `calcTrainingBounds()`; remove 2 rect entries from `TRN_RECTS` literal
3. `gameState`/`winner` replacing `gameOver` — update all 3 read sites; `restart()` updated
4. Declare `scores`, `scoreAnimBlue/Red`, `goalFreezeTimer`, `playerRespawnTimer`, `redPossession`
5. `spawnAllEnemies(mapCY)` function; update `initTraining()` to call it; remove `trnSpawnEnemy`/`checkTrainingSpawnClick`
6. `triggerGoal(team)` function
7. `respawnAfterGoal()` function
8. Goal detection in `_updateBallPhysics`; freeze/countdown block in `updateTraining`
9. Player death → respawn in `applyBallDamage` + `_updatePlayer`
10. Enemy AI: possession heuristic, roles per index, attacker aim, goalkeeper, support, interceptors, separation, respawn-in-place loop
11. `draw.js`: gate visuals (glow + net + frame)
12. `draw.js`: scoreboard HUD (score boxes, separator, bounce anim)
13. `draw.js`: win overlay + PLAY AGAIN; remove old gameOver overlay; remove +ENEMY button
14. `draw.js`: particle color fallback; damageNumber string/color handling
