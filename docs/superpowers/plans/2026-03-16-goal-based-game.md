# Goal-Based Game Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Training Grounds from a sandbox into a 2-team goal-based game with scoring, AI roles, celebration effects, and a win condition.

**Architecture:** All changes are in-place edits to `game.js` (logic) and `draw.js` (rendering). No new files created. Gate zones replace the two side-wall obstacle rects. A new game-state machine (`gameState`/`winner`) replaces the `gameOver` bool. Enemy AI gains team-role logic (attacker, goalkeeper, support, interceptors). A `triggerGoal` / `respawnAfterGoal` system handles scoring lifecycle.

**Tech Stack:** Vanilla JS, HTML5 Canvas API, no build system, no test framework. Visual verification is done by loading the game in the preview server (`node` static server at localhost). The preview server is already configured in `.claude/launch.json` — start it with `mcp__Claude_Preview__preview_start { name: "game" }` and screenshot with `mcp__Claude_Preview__preview_screenshot`.

---

## Chunk 1: Foundation — Constants, Gates, Game State

### Task 1: Add new constants; delete `ENEMY_MAX_COUNT`

**Files:**
- Modify: `game.js` (constants block, lines ~18–36)

- [ ] **Step 1: Edit constants block**

In `game.js`, in the `// ── Tunable constants` section:
- Delete the line: `const ENEMY_MAX_COUNT    = 5;`
- Add after `const TRN_DEBUG`:
```js
const GOALS_TO_WIN         = 5;
const GOAL_FREEZE_DURATION = 1.0;   // seconds
const ENEMY_COUNT          = 3;
```

- [ ] **Step 2: Verify game still loads**

Open preview → click PLAY → confirm game starts with no console errors. No visible change yet.

- [ ] **Step 3: Commit**
```bash
git add game.js
git commit -m "feat: add GOALS_TO_WIN, GOAL_FREEZE_DURATION, ENEMY_COUNT constants"
```

---

### Task 2: Gate objects — module-level declarations + assignment in `calcTrainingBounds`

**Files:**
- Modify: `game.js` (around line 148 for declarations; inside `calcTrainingBounds` ~line 150–181)

- [ ] **Step 1: Add module-level gate declarations**

After the line `let TRN_RECTS = [];` (around line 148), add:
```js
let GATE_LEFT  = null;
let GATE_RIGHT = null;
```

- [ ] **Step 2: Remove side-wall rects from TRN_RECTS literal**

Inside `calcTrainingBounds()`, the `TRN_RECTS = [...]` array literal currently ends with these two entries (indices 8 and 9):
```js
    // Side walls
    { x: TRN_L + 50, y: cy - 90, w: 35, h: 180 },
    { x: TRN_R - 85, y: cy - 90, w: 35, h: 180 },
```
Delete both of these lines (the comment and both objects).

- [ ] **Step 3: Assign GATE_LEFT and GATE_RIGHT inside `calcTrainingBounds`**

Immediately after the `TRN_RECTS = [...]` block (after the closing `];`), add:
```js
  GATE_LEFT  = { x: TRN_L + 50,  y: cy - 90, w: 35, h: 180 };
  GATE_RIGHT = { x: TRN_R - 85, y: cy - 90, w: 35, h: 180 };
```
Important: the local variable in `calcTrainingBounds()` is named `cy` (not `mapCY` — that name is used in `initTraining()`). Use `cy` here, not `mapCY`.

- [ ] **Step 4: Verify in preview**

Load game → click PLAY → confirm the two vertical blocks on the sides are gone (ball can now pass through where they were). No other visible change yet.

- [ ] **Step 5: Commit**
```bash
git add game.js
git commit -m "feat: replace side-wall rects with GATE_LEFT/GATE_RIGHT zone objects"
```

---

### Task 3: Game state refactor — replace `gameOver` with `gameState`/`winner`

**Files:**
- Modify: `game.js` (3 read sites + declaration + `restart()`)

- [ ] **Step 1: Replace declaration**

Find: `let gameOver = false;` (around line 456)
Replace with:
```js
let gameState = 'playing';  // 'playing' | 'won'
let winner    = null;       // 'BLUE' | 'RED' | null
```

- [ ] **Step 2: Update `updateTraining` guard**

Find: `if (gameOver) return;` (first line of `updateTraining`)
Replace with: `if (gameState !== 'playing') return;`

- [ ] **Step 3: Update `checkRestartClick`**

Find: `if (gameOver) {` inside `checkRestartClick`
Replace with: `if (gameState === 'won') {`

- [ ] **Step 4: Update `restart()`**

Replace the entire `restart()` function body with:
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
(The `scores`, `scoreAnimBlue`, etc. vars will be declared in Task 4 — this order is fine since `restart()` is called at runtime, not at parse time.)

- [ ] **Step 5: Verify in preview**

Load game → click PLAY → game runs normally. Click ↺ RESTART top-left → game resets. Confirm no errors.

- [ ] **Step 6: Commit**
```bash
git add game.js
git commit -m "refactor: replace gameOver bool with gameState/winner state machine"
```

---

### Task 4: Declare all new module-level state variables

**Files:**
- Modify: `game.js` (near existing `let gameOver` location, now replaced)

- [ ] **Step 1: Add state variable declarations**

After the `let gameState` / `let winner` lines just added, add:
```js
let scores           = { BLUE: 0, RED: 0 };
let scoreAnimBlue    = 0;
let scoreAnimRed     = 0;
let goalFreezeTimer  = 0;
let playerRespawnTimer = 0;
let redPossession    = false;
```

- [ ] **Step 2: Verify — no console errors**

Load preview → PLAY → no errors in browser console.

- [ ] **Step 3: Commit**
```bash
git add game.js
git commit -m "feat: declare scores, anim timers, freeze timer, possession state"
```

---

## Chunk 2: Goal System — triggerGoal, respawnAfterGoal, Detection, Freeze

### Task 5: Add `spawnAllEnemies` and update `initTraining`

**Files:**
- Modify: `game.js` (replace `trnSpawnEnemy` + `checkTrainingSpawnClick`; update `initTraining`)

- [ ] **Step 1: Add `spawnAllEnemies(mapCY)` function**

Replace the entire `trnSpawnEnemy()` function (lines ~387–423) with:
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

- [ ] **Step 2: Delete `checkTrainingSpawnClick()`**

Find and delete the entire `checkTrainingSpawnClick()` function (lines ~425–432).

- [ ] **Step 3: Update `initTraining()` to call `spawnAllEnemies`**

Inside `initTraining()`, find the line: `trnEnemies = [];`
Replace it with: `spawnAllEnemies(mapCY);`
(The `mapCY` local variable already exists in `initTraining` scope as `const mapCY = (TRN_T + TRN_B) / 2;` — if it doesn't exist as a named local, derive it: `const mapCY = (TRN_T + TRN_B) / 2;` is already computed there as the `y` offset.)

Actually, in the existing `initTraining`, the center line is computed as `const mapCY = (TRN_T + TRN_B) / 2;`. Confirm this by reading the function. Replace `trnEnemies = [];` with `spawnAllEnemies(mapCY);`.

- [ ] **Step 4: Remove `checkTrainingSpawnClick()` call from `updateTraining`**

Find: `checkTrainingSpawnClick();` in `updateTraining` and delete that line.

- [ ] **Step 5: Verify in preview**

Load game → click PLAY → 3 red enemy blobs should appear on the right side. Confirm they move and swing. No +ENEMY button interaction needed.

- [ ] **Step 6: Commit**
```bash
git add game.js
git commit -m "feat: replace random enemy spawning with fixed-position spawnAllEnemies()"
```

---

### Task 6: Add `triggerGoal(team)` and `respawnAfterGoal()`

**Files:**
- Modify: `game.js` (add two new functions after `restart()`)

- [ ] **Step 1: Add `triggerGoal(team)` function**

After the `restart()` function, add:
```js
function triggerGoal(team) {
  trainingBall.vx = 0; trainingBall.vy = 0;
  trainingBall.stopped = true;
  goalFreezeTimer = GOAL_FREEZE_DURATION;

  const gate = (team === 'RED') ? GATE_LEFT : GATE_RIGHT;
  const gateCx = gate.x + gate.w / 2;
  const gateCy = gate.y + gate.h / 2;
  const teamColor = (team === 'RED') ? '#E74C3C' : '#3498DB';

  // Celebration particles
  for (let i = 0; i < 25; i++) {
    const a   = Math.random() * Math.PI * 2;
    const spd = 150 + Math.random() * 250;
    bounceParticles.push({
      x: gateCx, y: gateCy,
      vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
      life: 0.8, maxLife: 0.8,
      radius: 4 + Math.random() * 4,
      color: teamColor,
    });
  }

  // Score bounce anim
  if (team === 'BLUE') scoreAnimBlue = 0.4;
  else                 scoreAnimRed  = 0.4;

  // +1 float
  damageNumbers.push({
    x: gateCx, y: gateCy - 20,
    value: '+1', color: teamColor,
    life: 1.0, maxLife: 1.0,
  });

  scores[team]++;
  if (scores[team] >= GOALS_TO_WIN) {
    gameState = 'won';
    winner = team;
  }
}
```

- [ ] **Step 2: Add `respawnAfterGoal()` function**

Immediately after `triggerGoal`, add:
```js
function respawnAfterGoal() {
  const mapCY = (TRN_T + TRN_B) / 2;
  trainingBall.x = WW / 2; trainingBall.y = mapCY;
  trainingBall.vx = 0; trainingBall.vy = 0;
  trainingBall.speed = 0; trainingBall.stopped = true;
  trainingBall.trail = [];
  for (const e of trnEnemies) {
    e.x = e.startX; e.y = e.startY;
    e.vx = 0; e.vy = 0;
    e.hp = ENEMY_MAX_HP;
    e.splatTimer = -1;
    e.swingProgress = -1;
    e.swingCooldown = 0;
    e.hitThisSwing = false;
  }
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

- [ ] **Step 3: Commit**
```bash
git add game.js
git commit -m "feat: add triggerGoal() and respawnAfterGoal() functions"
```

---

### Task 7: Goal detection in `_updateBallPhysics`; freeze block in `updateTraining`

**Files:**
- Modify: `game.js`

- [ ] **Step 1: Add `ballInGate` helper and goal detection in `_updateBallPhysics`**

At the end of `_updateBallPhysics`, just before the closing `}`, add:
```js
  // Goal detection
  if (goalFreezeTimer <= 0 && !trainingBall.stopped) {
    function ballInGate(gate) {
      return trainingBall.x > gate.x && trainingBall.x < gate.x + gate.w &&
             trainingBall.y > gate.y && trainingBall.y < gate.y + gate.h;
    }
    if (ballInGate(GATE_LEFT))  triggerGoal('RED');
    if (ballInGate(GATE_RIGHT)) triggerGoal('BLUE');
  }
```

Note: `ballInGate` as an inner function declaration is hoisted to `_updateBallPhysics` scope, which is fine. Alternatively declare it as a module-level function — either approach works.

- [ ] **Step 2: Add freeze block and `playerRespawnTimer` decrement in `updateTraining`**

In `updateTraining`, find the existing structure:
```js
function updateTraining(dt) {
  if (gameState !== 'playing') return;

  updateTrainingCamera();
  _updatePlayer(dt);
  ...
```

Replace with:
```js
function updateTraining(dt) {
  if (gameState !== 'playing') return;

  // playerRespawnTimer always ticks, even during goal freeze
  if (!player.alive && playerRespawnTimer > 0) {
    playerRespawnTimer -= dt;
  }

  // Score anim timers
  if (scoreAnimBlue > 0) scoreAnimBlue = Math.max(0, scoreAnimBlue - dt);
  if (scoreAnimRed  > 0) scoreAnimRed  = Math.max(0, scoreAnimRed  - dt);

  // Goal freeze: run only particles + damage numbers, then return
  if (goalFreezeTimer > 0) {
    goalFreezeTimer -= dt;
    if (goalFreezeTimer <= 0) { goalFreezeTimer = 0; respawnAfterGoal(); }
    // Update particles during freeze so goal celebration animates
    for (let i = bounceParticles.length - 1; i >= 0; i--) {
      const p = bounceParticles[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.94; p.vy *= 0.94;
      p.life -= dt;
      if (p.life <= 0) bounceParticles.splice(i, 1);
    }
    for (let i = damageNumbers.length - 1; i >= 0; i--) {
      const dn = damageNumbers[i];
      dn.y -= 40 * dt;
      dn.life -= dt * 1.5;
      if (dn.life <= 0) damageNumbers.splice(i, 1);
    }
    return;  // ← skips all game-update calls below
  }

  updateTrainingCamera();
  _updatePlayer(dt);
  ...
```

- [ ] **Step 3: Keep existing particle/damage-number loops in main body**

The freeze block above handles particles/damage numbers only during the freeze (before `return`). The existing particle and damage-number update loops that appear **after** the regular update calls in the main body remain exactly as they are — they run on the non-freeze path. Do NOT remove them. The two paths are mutually exclusive via the `return` in the freeze block.

- [ ] **Step 4: Verify in preview**

Load game → PLAY → kick the ball into the right side where GATE_LEFT used to be a wall. Watch for:
- Ball enters left gate zone → RED scores → 1s freeze → ball respawns at center
- `scores.RED` incremented (will be visible once scoreboard draw is added in Chunk 4)

For now, verify no errors and that the game doesn't crash when the ball enters a gate zone.

- [ ] **Step 5: Commit**
```bash
git add game.js
git commit -m "feat: goal detection + freeze block in updateTraining"
```

---

### Task 8: Player death → respawn (not game over)

**Files:**
- Modify: `game.js` (`applyBallDamage` + `_updatePlayer`)

- [ ] **Step 1: Update `applyBallDamage`**

Find:
```js
  if (entity === player && entity.hp < 0.5) {
    entity.hp = 0;
    gameOver = true;
  }
```
Replace with:
```js
  if (entity === player && entity.hp < 0.5) {
    entity.hp = 0;
    entity.alive = false;
    playerRespawnTimer = 2.0;
  }
```

- [ ] **Step 2: Update `_updatePlayer` — add early-return respawn block**

At the very top of `_updatePlayer(dt)`, before any existing logic, add:
```js
  if (!player.alive) {
    // playerRespawnTimer is decremented in updateTraining (before this call)
    // Do NOT add playerRespawnTimer -= dt here — it's already handled above.
    if (playerRespawnTimer <= 0) {
      const mapCY = (TRN_T + TRN_B) / 2;
      player.x = WW * 0.28;
      player.y = mapCY;
      player.vx = 0; player.vy = 0;
      player.hp = PLAYER_HP;
      player.alive = true;
      player.invulnTimer = 1.0;
    }
    return;
  }
```

Critical: `playerRespawnTimer -= dt` must appear **only** in `updateTraining`, not here. This function only reads the timer value to know when to fire the respawn.

- [ ] **Step 3: Verify in preview**

Load game → let enemies hit you with the ball until HP = 0 → player disappears for ~2s → reappears at left side. Game continues. No "YOU LOST" overlay.

- [ ] **Step 4: Commit**
```bash
git add game.js
git commit -m "feat: player death triggers 2s respawn instead of game over"
```

---

## Chunk 3: Enemy AI Overhaul

### Task 9: Enemy respawn-in-place after splat

**Files:**
- Modify: `game.js` (end of `_updateEnemies`)

- [ ] **Step 1: Replace the splice loop with a reset loop**

In `_updateEnemies`, find:
```js
  // Remove dead enemies
  for (let i = trnEnemies.length - 1; i >= 0; i--) {
    if (trnEnemies[i].splatTimer >= 0.4) trnEnemies.splice(i, 1);
  }
```
Replace with:
```js
  // Respawn dead enemies in-place
  for (const enemy of trnEnemies) {
    if (enemy.splatTimer >= 0.4) {
      enemy.splatTimer    = -1;
      enemy.x             = enemy.startX;
      enemy.y             = enemy.startY;
      enemy.vx            = 0; enemy.vy = 0;
      enemy.hp            = ENEMY_MAX_HP;
      enemy.swingProgress = -1;
      enemy.swingCooldown = 0;
      enemy.hitThisSwing  = false;
    }
  }
```

- [ ] **Step 2: Verify in preview**

Load game → let an enemy get killed by the ball (wait for splat animation) → enemy reappears at its starting position on the right side.

- [ ] **Step 3: Commit**
```bash
git add game.js
git commit -m "feat: enemies respawn at start position after splat instead of being removed"
```

---

### Task 10: Enemy AI — possession heuristic + role-based movement

**Files:**
- Modify: `game.js` (`_updateEnemies`)

- [ ] **Step 1: Add possession heuristic at top of enemy loop**

Note: `redPossession` was already declared as `let redPossession = false;` in Task 4.

Gate orientation reminder (from spec):
- `GATE_LEFT` = BLUE's goal (player defends it). RED **attacks** it → RED attacker aims at `GATE_LEFT` ✓
- `GATE_RIGHT` = RED's goal (enemies defend it). RED **goalkeeper** guards `GATE_RIGHT` ✓

In `_updateEnemies`, at the very start of the function body (before the ball-damage calls), add:
```js
  // Possession heuristic (hysteresis: only change when |vx| > 80)
  if      (trainingBall.vx < -80) redPossession = true;
  else if (trainingBall.vx >  80) redPossession = false;
```

- [ ] **Step 2: Replace the CHASE / SWING_INIT / DODGE logic with role-based logic**

The existing AI has a `} else {` branch that handles DODGE and CHASE. This is the section to replace with role-aware movement. The SWING_ACTIVE block at the top stays unchanged. The IDLE block stays unchanged.

Find the section in `_updateEnemies` that handles enemy movement when `enemy.swingProgress < 0` and ball is not stopped. It currently looks like:
```js
    } else if (trainingBall.stopped) {
      // IDLE
      enemy.vx = 0; enemy.vy = 0;
    } else if (trainingBall.speed > 200) {
      // DODGE
      ...
    } else {
      const edx = ...;
      if (ed < 150 && enemy.swingCooldown <= 0 ...) {
        // SWING_INIT
        ...
      } else {
        // CHASE
        ...
      }
    }
```

Replace the `} else if (trainingBall.speed > 200) {` → `}` final section with:
```js
    } else if (trainingBall.stopped) {
      // IDLE
      enemy.vx = 0; enemy.vy = 0;
    } else if (trainingBall.speed > 200) {
      // DODGE (highest priority regardless of role)
      const bvLen = Math.hypot(trainingBall.vx, trainingBall.vy);
      const perpX = -trainingBall.vy / bvLen;
      const perpY =  trainingBall.vx / bvLen;
      const dot = perpX * (enemy.x - trainingBall.x) + perpY * (enemy.y - trainingBall.y);
      const side = dot >= 0 ? 1 : -1;
      enemy.vx = perpX * side * ENEMY_DODGE_SPEED;
      enemy.vy = perpY * side * ENEMY_DODGE_SPEED;
    } else {
      const idx = trnEnemies.indexOf(enemy);
      const edx = trainingBall.x - enemy.x, edy = trainingBall.y - enemy.y;
      const ed  = Math.hypot(edx, edy);
      const mapCY = (TRN_T + TRN_B) / 2;

      if (redPossession) {
        // RED attacking — aim at GATE_LEFT
        if (idx === 0) {
          // Attacker: chase ball; swing aims toward GATE_LEFT
          if (ed < 150 && enemy.swingCooldown <= 0 && !enemy.hitThisSwing) {
            // SWING_INIT — aim toward GATE_LEFT
            enemy.swingStartAngle = Math.atan2(
              GATE_LEFT.y + GATE_LEFT.h / 2 - enemy.y,
              GATE_LEFT.x + GATE_LEFT.w / 2 - enemy.x
            );
            const toPlayer = Math.atan2(player.y - enemy.y, player.x - enemy.x);
            const cwMid  = enemy.swingStartAngle + Math.PI * (1 / 3);
            const ccwMid = enemy.swingStartAngle - Math.PI * (1 / 3);
            enemy.swingDir = Math.abs(Math.atan2(Math.sin(toPlayer - cwMid), Math.cos(toPlayer - cwMid))) <
                             Math.abs(Math.atan2(Math.sin(toPlayer - ccwMid), Math.cos(toPlayer - ccwMid))) ? 1 : -1;
            enemy.swingProgress = 0;
            enemy.hitThisSwing  = false;
            enemy.vx = 0; enemy.vy = 0;
            const seg0 = _getEnemyBatSegment(enemy, enemy.swingStartAngle);
            enemy.prevBatBase = { x: seg0.bx, y: seg0.by };
            enemy.prevBatTip  = { x: seg0.tx, y: seg0.ty };
          } else if (ed > 0.1) {
            // CHASE ball
            enemy.vx = (edx / ed) * ENEMY_SPEED;
            enemy.vy = (edy / ed) * ENEMY_SPEED;
            enemy.angle = Math.atan2(edy, edx);
          }
        } else {
          // Support: move to flanking positions
          const supportY = idx === 1 ? mapCY - 120 : mapCY + 120;
          const tx = WW * 0.6, ty = supportY;
          const dx = tx - enemy.x, dy = ty - enemy.y;
          const d  = Math.hypot(dx, dy);
          if (d > 10) { enemy.vx = (dx / d) * ENEMY_SPEED; enemy.vy = (dy / d) * ENEMY_SPEED; }
          else        { enemy.vx = 0; enemy.vy = 0; }
        }
      } else {
        // BLUE attacking — RED defending GATE_RIGHT
        if (idx === 0) {
          // Goalkeeper: stay between ball and GATE_RIGHT
          const gateCx = GATE_RIGHT.x + GATE_RIGHT.w / 2;
          const gateCy = GATE_RIGHT.y + GATE_RIGHT.h / 2;
          const targetX = clamp(trainingBall.x * 0.3 + gateCx * 0.7, TRN_R - 200, TRN_R - 120);
          const targetY = clamp(trainingBall.y, GATE_RIGHT.y - 60, GATE_RIGHT.y + GATE_RIGHT.h + 60);
          const dx = targetX - enemy.x, dy = targetY - enemy.y;
          const d  = Math.hypot(dx, dy);
          if (d > 10) { enemy.vx = (dx / d) * ENEMY_SPEED; enemy.vy = (dy / d) * ENEMY_SPEED; }
          else        { enemy.vx = 0; enemy.vy = 0; }
        } else {
          // Interceptors: steer toward predicted ball position
          const ix = clamp(trainingBall.x + trainingBall.vx * 0.3, TRN_L + 40, TRN_R - 40);
          const iy = clamp(trainingBall.y + trainingBall.vy * 0.3, TRN_T + 40, TRN_B - 40);
          const dx = ix - enemy.x, dy = iy - enemy.y;
          const d  = Math.hypot(dx, dy);
          if (d > 10) { enemy.vx = (dx / d) * ENEMY_SPEED; enemy.vy = (dy / d) * ENEMY_SPEED; }
          else        { enemy.vx = 0; enemy.vy = 0; }
        }
      }
    }
```

- [ ] **Step 3: Add separation force after main movement loop**

After the existing wall-repulsion block and before the friction/integrate block, add:
```js
    // Separation between enemies
    for (let j = 0; j < trnEnemies.length; j++) {
      if (trnEnemies[j] === enemy || trnEnemies[j].splatTimer >= 0) continue;
      const sep = Math.hypot(enemy.x - trnEnemies[j].x, enemy.y - trnEnemies[j].y);
      if (sep < 80 && sep > 0.1) {
        const push = (80 - sep) * 0.5;
        const nx = (enemy.x - trnEnemies[j].x) / sep;
        const ny = (enemy.y - trnEnemies[j].y) / sep;
        enemy.vx += nx * push;
        enemy.vy += ny * push;
      }
    }
```

- [ ] **Step 4: Verify in preview**

Load game → click PLAY → observe enemy behavior:
- When ball moves toward left side (`vx < -80`): enemies chase ball (attacker) and position centrally (support)
- When ball moves toward right side (`vx > 80`): enemy[0] moves toward right gate area (goalkeeper), enemies[1,2] intercept ball trajectory
- Enemies don't cluster on top of each other

- [ ] **Step 5: Commit**
```bash
git add game.js
git commit -m "feat: enemy AI roles — attacker, goalkeeper, support, interceptors + separation"
```

---

## Chunk 4: Drawing — Gates, Scoreboard, Win Overlay, Particles

### Task 11: Draw gate visuals in `draw.js`

**Files:**
- Modify: `draw.js` (inside `drawTraining()`, before obstacles section)

- [ ] **Step 1: Add gate drawing function**

Add a helper function before `drawTraining()`:
```js
function drawGate(gate, glowColor) {
  const alpha = 0.20 + 0.10 * Math.sin(performance.now() / 600);
  ctx.save();
  ctx.beginPath();
  ctx.rect(gate.x, gate.y, gate.w, gate.h);
  ctx.clip();

  // Glow fill
  ctx.globalAlpha = alpha;
  ctx.fillStyle = glowColor;
  ctx.fillRect(gate.x, gate.y, gate.w, gate.h);

  // Net lines (+45°)
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.lineWidth = 1;
  for (let d = -gate.h; d < gate.w + gate.h; d += 16) {
    ctx.beginPath();
    ctx.moveTo(gate.x + d,          gate.y);
    ctx.lineTo(gate.x + d + gate.h, gate.y + gate.h);
    ctx.stroke();
  }
  // Net lines (-45°)
  for (let d = -gate.h; d < gate.w + gate.h; d += 16) {
    ctx.beginPath();
    ctx.moveTo(gate.x + d + gate.h, gate.y);
    ctx.lineTo(gate.x + d,          gate.y + gate.h);
    ctx.stroke();
  }

  ctx.restore();

  // Frame outline
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = glowColor;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(gate.x, gate.y, gate.w, gate.h, 4);
  ctx.stroke();
  ctx.restore();
}
```

- [ ] **Step 2: Call drawGate in `drawTraining`**

Inside `drawTraining()`, find the `// ── Training obstacles` section. **Before** that section, add:
```js
  // ── Gates ──
  if (GATE_LEFT)  drawGate(GATE_LEFT,  'rgba(52,152,219,1)');
  if (GATE_RIGHT) drawGate(GATE_RIGHT, 'rgba(231,76,60,1)');
```

- [ ] **Step 3: Verify in preview**

Load game → PLAY → two gate zones visible on left and right sides, with colored glow, cross-hatch net, and frame outline. Glow pulses slowly.

- [ ] **Step 4: Commit**
```bash
git add draw.js
git commit -m "feat: draw gate zones with pulsing glow, net lines, and frame"
```

---

### Task 12: Update particle and damage-number draw loops for color support

**Files:**
- Modify: `draw.js`

Note: The `damageNumbers` push with `value: '+1'` and `color: teamColor` is done inside `triggerGoal()` (added in Task 6). No additional push-site needed here — this task only updates the **draw** loop to handle what Task 6 already pushes.

Note: `gameState === 'won'` is set inside `triggerGoal()` (Task 6) and the overlay checks that same string. The value `'won'` is consistent across all tasks.

- [ ] **Step 1: Update `bounceParticles` draw loop**

In `drawTraining()`, find the existing bounce particles loop:
```js
    // ── Bounce particles (clay dust) ──
    for (const p of bounceParticles) {
      ctx.save();
      ctx.globalAlpha = (p.life / p.maxLife) * 0.5;
      ctx.fillStyle = clayCircleGradient(p.x, p.y, p.radius, CLAY.wallBase);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
```
Replace with:
```js
    // ── Bounce particles (clay dust / goal celebration) ──
    for (const p of bounceParticles) {
      ctx.save();
      ctx.globalAlpha = (p.life / p.maxLife) * 0.5;
      ctx.fillStyle = clayCircleGradient(p.x, p.y, p.radius, p.color || CLAY.wallBase);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
```

- [ ] **Step 2: Update `damageNumbers` draw loop in `drawTrainingHUD`**

Find the existing damage numbers loop:
```js
  for (const dn of damageNumbers) {
    const t = dn.life / dn.maxLife;
    ctx.save();
    ctx.globalAlpha = t;
    ctx.font = `bold ${16 + Math.round((1 - t) * 6)}px Segoe UI,sans-serif`;
    ctx.textAlign = 'center';
    const r = 255, g = Math.round(255 * t + 156 * (1 - t)), b = Math.round(255 * t + 18 * (1 - t));
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 3;
    ctx.strokeText('-' + dn.value, dn.x, dn.y);
    ctx.fillText('-' + dn.value, dn.x, dn.y);
    ctx.restore();
  }
```
Replace with:
```js
  for (const dn of damageNumbers) {
    const t = dn.life / dn.maxLife;
    ctx.save();
    ctx.globalAlpha = t;
    ctx.font = `bold ${16 + Math.round((1 - t) * 6)}px Segoe UI,sans-serif`;
    ctx.textAlign = 'center';
    const label = typeof dn.value === 'string' ? dn.value : ('-' + dn.value);
    const r = 255, g = Math.round(255 * t + 156 * (1 - t)), b = Math.round(255 * t + 18 * (1 - t));
    const col = dn.color || `rgb(${r},${g},${b})`;
    ctx.fillStyle = col;
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 3;
    ctx.strokeText(label, dn.x, dn.y);
    ctx.fillText(label, dn.x, dn.y);
    ctx.restore();
  }
```

- [ ] **Step 3: Verify in preview**

Score a goal (kick ball into a gate zone) → colored celebration particles burst from gate center → `+1` floats up in team color.

- [ ] **Step 4: Commit**
```bash
git add draw.js
git commit -m "feat: colored bounce particles and string/color damage numbers"
```

---

### Task 13: Scoreboard HUD

**Files:**
- Modify: `draw.js` (inside `drawTrainingHUD`)

- [ ] **Step 1: Replace mode label with scoreboard**

In `drawTrainingHUD`, find and delete the mode label block:
```js
  // Mode label
  ctx.save();
  ctx.fillStyle = 'rgba(200,160,100,0.5)';
  ctx.font = 'bold 14px Segoe UI,sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('TRAINING GROUNDS', WW / 2, 35);
  ctx.restore();
```

Replace with the full scoreboard draw:
```js
  // ── Scoreboard ──
  {
    const boxW = 120, boxH = 70, sep = 24;
    const totalW = boxW * 2 + sep;
    const startX = (WW - totalW) / 2;
    const startY = 12;

    function drawScoreBox(x, y, w, h, color, label, score, animTimer) {
      const scale = 1.0 + 0.3 * (animTimer / 0.4);
      // Shadow
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath(); ctx.roundRect(x + 3, y + 4, w, h, 12); ctx.fill();
      ctx.restore();
      // Box
      ctx.save();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.roundRect(x, y, w, h, 12); ctx.fill();
      // Highlight
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath(); ctx.roundRect(x + 4, y + 3, w - 8, h / 2 - 3, [10, 10, 0, 0]); ctx.fill();
      // Stroke
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(x, y, w, h, 12); ctx.stroke();
      // Label
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = 'bold 12px Segoe UI,sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(label, x + w / 2, y + 18);
      // Score number with bounce scale
      ctx.save();
      ctx.translate(x + w / 2, y + h / 2 + 14);
      ctx.scale(scale, scale);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 42px Segoe UI,sans-serif'; ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 6;
      ctx.fillText(String(score), 0, 0);
      ctx.restore();
      ctx.restore();
    }

    drawScoreBox(startX,          startY, boxW, boxH, '#3498DB', 'BLUE', scores.BLUE, scoreAnimBlue);
    drawScoreBox(startX + boxW + sep, startY, boxW, boxH, '#E74C3C', 'RED',  scores.RED,  scoreAnimRed);

    // Separator ball
    ctx.save();
    ctx.fillStyle = '#F39C12';
    ctx.shadowColor = 'rgba(243,156,18,0.5)'; ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(startX + boxW + sep / 2, startY + boxH / 2, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
```

- [ ] **Step 2: Verify in preview**

Load game → PLAY → two score boxes at top-center showing `BLUE 0` and `RED 0` with a ball separator. Score a goal → correct team's score increments → number scales up briefly.

- [ ] **Step 3: Commit**
```bash
git add draw.js
git commit -m "feat: scoreboard HUD with team score boxes and bounce animation"
```

---

### Task 14: Win overlay + remove old overlay and +ENEMY button

**Files:**
- Modify: `draw.js` (replace old gameOver overlay; remove +ENEMY button)

- [ ] **Step 1: Replace the old `if (gameOver)` overlay with win overlay**

In `drawTrainingHUD`, find the entire old `// ── YOU LOST overlay` block:
```js
  // ── YOU LOST overlay (new) ──
  if (gameOver) {
    ...
  }
```
Replace it with:
```js
  // ── WIN overlay ──
  if (gameState === 'won') {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, WW, WH);

    const winColor = winner === 'BLUE' ? '#3498DB' : '#E74C3C';
    const winText  = winner === 'BLUE' ? 'BLUE WINS!' : 'RED WINS!';
    ctx.font = 'bold 96px Segoe UI,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = winColor;
    ctx.shadowColor = winColor; ctx.shadowBlur = 40;
    ctx.fillText(winText, WW / 2, WH / 2 - 30);
    ctx.shadowBlur = 0;

    // PLAY AGAIN button (reuses RESTART_BTN rect)
    const { x: bx, y: by, w: bw, h: bh } = RESTART_BTN;
    const rGrad = ctx.createLinearGradient(bx, by, bx, by + bh);
    rGrad.addColorStop(0, CLAY.coverHi); rGrad.addColorStop(1, CLAY.cover);
    ctx.fillStyle = 'rgba(40,20,10,0.5)';
    ctx.beginPath(); ctx.roundRect(bx + 3, by + 4, bw, bh, bh / 2); ctx.fill();
    ctx.fillStyle = rGrad;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, bh / 2); ctx.fill();
    ctx.strokeStyle = CLAY.coverStroke; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, bh / 2); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff'; ctx.font = 'bold 20px Segoe UI,sans-serif';
    ctx.fillText('▶  PLAY AGAIN', bx + bw / 2, by + bh / 2 + 7);

    ctx.restore();
  }
```

- [ ] **Step 2: Remove the `+ENEMY` button from `drawTrainingHUD`**

Find and delete the entire `// +ENEMY button` block (roughly 12 lines).

- [ ] **Step 3: Verify in preview**

Play to 5 goals for one team → full-screen team-colored WIN overlay appears with PLAY AGAIN button → clicking it resets and restarts the game.

- [ ] **Step 4: Final visual check**

Take a screenshot at each game state: title screen, in-play with scoreboard, goal celebration, win screen.

- [ ] **Step 5: Commit**
```bash
git add draw.js
git commit -m "feat: win overlay with PLAY AGAIN; remove +ENEMY button and old game-over overlay"
```

---

## Final Verification Checklist

- [ ] Game starts from title screen → PLAY
- [ ] 3 RED enemies spawn on right side
- [ ] Ball passes through gate zones (no bounce)
- [ ] Ball entering GATE_LEFT → RED scores (blue gate, right side of scoreboard)
- [ ] Ball entering GATE_RIGHT → BLUE scores (red gate, left... wait — GATE_RIGHT is red glow, BLUE scores there)
- [ ] Goal freeze: 1s celebration, particles, +1 float, ball respawns at center
- [ ] First team to 5 goals → WIN overlay in team color
- [ ] PLAY AGAIN resets to 0-0
- [ ] Player death → 2s respawn on left side, game continues
- [ ] Enemies respawn after splat
- [ ] Enemy AI: attacker chases ball, goalkeeper guards right gate, etc.
- [ ] No console errors throughout
