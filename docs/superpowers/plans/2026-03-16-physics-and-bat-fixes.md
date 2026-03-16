# Physics & Bat Feel Fixes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix ball getting trapped between enemies, and make the rubber-band bat feel tighter and more predictable.

**Architecture:** All logic changes in `game.js`; visual changes in `draw.js`. No new files. Two independent problem areas: enemy physics (separation, ball push-out, role exclusivity, arrival steering) and bat feel (retune constants, squash timer, motion blur reduction, enemy bat tuning).

**Tech Stack:** Vanilla JS, HTML5 Canvas. Preview via `mcp__Claude_Preview__preview_start { name: "game" }`.

---

## Chunk 1: Enemy Physics — Fixes A, B, C, D

### Task 1: Ball push-out from characters (Fix B)

**Files:**
- Modify: `game.js` (new function after `applyBallDamage` ~line 388; `updateTraining` ~line 1239)

**Context:**
`applyBallDamage` (line 345) already pushes the ball out on damage hits, but requires `speed > 30`. When enemies sandwich the ball, speed can drop below 30, disabling the push-out and trapping the ball. This task adds a pure physics push-out with no damage, always active.

- [ ] **Step 1: Add `_pushBallOutOfCharacters` function**

Insert this function directly after `applyBallDamage` (after its closing `}` at ~line 388):

```js
function _pushBallOutOfCharacters() {
  if (trainingBall.stopped) return;
  const chars = player.alive ? [player, ...trnEnemies] : [...trnEnemies];
  for (const ch of chars) {
    if (ch.splatTimer >= 0) continue; // skip dying enemies
    const dx = trainingBall.x - ch.x;
    const dy = trainingBall.y - ch.y;
    const d  = Math.hypot(dx, dy);
    const minDist = trainingBall.radius + ch.radius;
    if (d < minDist && d > 0.01) {
      const nx = dx / d, ny = dy / d;
      // Push ball to surface + 2px gap (no damage)
      trainingBall.x = ch.x + nx * (minDist + 2);
      trainingBall.y = ch.y + ny * (minDist + 2);
      // Small outward impulse so ball escapes
      trainingBall.vx += nx * 2.0;
      trainingBall.vy += ny * 2.0;
      trainingBall.speed = Math.hypot(trainingBall.vx, trainingBall.vy);
    }
  }
}
```

- [ ] **Step 2: Call it in `updateTraining`**

In `updateTraining` (~line 1239), after `_updateEnemies(dt);`, add:

```js
  _pushBallOutOfCharacters();
```

The call order should be:
```js
  _updatePlayer(dt);
  _updateBatBallCCD(dt);
  _updateBallPhysics(dt);
  _updateEnemies(dt);
  _pushBallOutOfCharacters();   // ← new
  checkRestartClick();
```

- [ ] **Step 3: Verify in preview**

Start preview → PLAY → hit ball toward enemies, watch that ball doesn't get stuck inside enemy bodies. No console errors.

- [ ] **Step 4: Commit**
```bash
git add game.js
git commit -m "fix: ball push-out from all characters, no damage — prevents sandwiching"
```

---

### Task 2: Entity positional separation (Fix A)

**Files:**
- Modify: `game.js` (new function before `spawnAllEnemies` ~line 409; `_updateEnemies` ~line 938 and ~line 1148)

**Context:**
The current velocity-based separation (lines 1148–1158) is applied AFTER AI movement and friction, so it can be overridden. This task adds positional correction BEFORE any movement, plus includes the player in the separation check. The old velocity-based separation will be removed.

- [ ] **Step 1: Add `_resolveEntitySeparation` function**

Insert this function immediately before `spawnAllEnemies` (~line 409):

```js
function _resolveEntitySeparation() {
  // Build list: player (if alive) + alive enemies
  const entities = [];
  if (player.alive) entities.push(player);
  for (const e of trnEnemies) {
    if (e.splatTimer < 0) entities.push(e);
  }
  // Positional push-apart for every pair
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const a = entities[i], b = entities[j];
      const dx = a.x - b.x, dy = a.y - b.y;
      const d  = Math.hypot(dx, dy);
      const minSep = a.radius + b.radius + 10;
      if (d < minSep && d > 0.01) {
        const push = (minSep - d) * 0.5;
        const nx = dx / d, ny = dy / d;
        a.x += nx * push; a.y += ny * push;
        b.x -= nx * push; b.y -= ny * push;
      }
    }
  }
}
```

- [ ] **Step 2: Call `_resolveEntitySeparation` at start of `_updateEnemies`**

At the very top of `_updateEnemies` (line 938), before the ball-damage block, add:

```js
  _resolveEntitySeparation();
```

So the function starts:
```js
function _updateEnemies(dt) {
  _resolveEntitySeparation();

  // ── Ball damage ──
  applyBallDamage(player);
  ...
```

- [ ] **Step 3: Remove old velocity-based separation from per-enemy loop**

Find and delete the entire "Separation between enemies" block (lines 1148–1158):
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

PLAY → enemies should visibly spread apart instead of stacking on top of each other. No console errors.

- [ ] **Step 5: Commit**
```bash
git add game.js
git commit -m "fix: positional entity separation before AI movement, includes player"
```

---

### Task 3: Role lock timer + non-attacker ball avoidance (Fix C)

**Files:**
- Modify: `game.js` (module-level vars ~line 472; `_updateEnemies` role section ~line 945; movement sections ~lines 1091–1109; `respawnAfterGoal` ~line 524; enemy respawn block ~line 1174)

**Context:**
Currently roles are reassigned every frame, causing jitter when enemies are equidistant from the ball. This task adds a 1.5s lock timer (but immediately reassigns if attacker dies), and adds a 120px exclusion zone around the ball for non-attacker enemies.

- [ ] **Step 1: Add module-level role timer and cached role variables**

Find `let damageNumbers = [];` (~line 472). After it, add:

```js
let enemyRoleTimer = 0;
let cachedAttacker = null, cachedGoalkeeper = null, cachedSupport = null;
```

- [ ] **Step 2: Replace role assignment in `_updateEnemies`**

Find the "Assign roles by distance each frame" block (lines 945–960):
```js
  // ── Assign roles by distance each frame ──
  const bx = trainingBall.x, by = trainingBall.y;
  const alive = trnEnemies.filter(e => e.splatTimer < 0);
  let attacker = null, goalkeeper = null, support = null;
  if (alive.length > 0) {
    const sorted = alive.slice().sort((a, b) =>
      Math.hypot(a.x-bx, a.y-by) - Math.hypot(b.x-bx, b.y-by));
    attacker = sorted[0];
    if (sorted.length >= 2) {
      const others = sorted.slice(1).sort((a, b) =>
        Math.hypot(b.x-attacker.x, b.y-attacker.y) -
        Math.hypot(a.x-attacker.x, a.y-attacker.y));
      goalkeeper = others[0];
      support    = others.length > 1 ? others[1] : null;
    }
  }
```

Replace with:
```js
  // ── Assign roles — locked for 1.5s, refresh if attacker dies ──
  const bx = trainingBall.x, by = trainingBall.y;
  const alive = trnEnemies.filter(e => e.splatTimer < 0);
  enemyRoleTimer -= dt;
  const attackerDead = !cachedAttacker || cachedAttacker.splatTimer >= 0;
  if (enemyRoleTimer <= 0 || attackerDead) {
    enemyRoleTimer = 1.5;
    if (alive.length > 0) {
      const sorted = alive.slice().sort((a, b) =>
        Math.hypot(a.x-bx, a.y-by) - Math.hypot(b.x-bx, b.y-by));
      cachedAttacker = sorted[0];
      if (sorted.length >= 2) {
        const others = sorted.slice(1).sort((a, b) =>
          Math.hypot(b.x-cachedAttacker.x, b.y-cachedAttacker.y) -
          Math.hypot(a.x-cachedAttacker.x, a.y-cachedAttacker.y));
        cachedGoalkeeper = others[0];
        cachedSupport    = others.length > 1 ? others[1] : null;
      } else {
        cachedGoalkeeper = null; cachedSupport = null;
      }
    } else {
      cachedAttacker = null; cachedGoalkeeper = null; cachedSupport = null;
    }
  }
  // Validate cached roles (may have died since last assignment)
  const attacker   = (cachedAttacker?.splatTimer   < 0) ? cachedAttacker   : null;
  const goalkeeper = (cachedGoalkeeper?.splatTimer < 0) ? cachedGoalkeeper : null;
  const support    = (cachedSupport?.splatTimer    < 0) ? cachedSupport    : null;
```

- [ ] **Step 3: Add 120px ball avoidance for non-attacker enemies**

Add this block AFTER the anti-freeze patrol block (the block ending around line 1128) and BEFORE the wall-repulsion section (~line 1130). Placing it after anti-freeze ensures it is not overridden by the anti-freeze logic:

```js
    // Non-attacker ball avoidance: steer away if within 120px
    // (placed after anti-freeze so avoidance wins when near ball)
    if (enemy !== attacker) {
      const ballDistEnemy = Math.hypot(enemy.x - bx, enemy.y - by);
      if (ballDistEnemy < 120 && ballDistEnemy > 0.01) {
        const awayX = (enemy.x - bx) / ballDistEnemy;
        const awayY = (enemy.y - by) / ballDistEnemy;
        enemy.vx = lerp(enemy.vx, awayX * ENEMY_SPEED * 0.7, 0.2);
        enemy.vy = lerp(enemy.vy, awayY * ENEMY_SPEED * 0.7, 0.2);
      }
    }
```

- [ ] **Step 4: Reset role timer and cache in `initTraining` and `respawnAfterGoal`**

In `initTraining` (~line 562), add at the start of the function body:

```js
  enemyRoleTimer = 0;
  cachedAttacker = null; cachedGoalkeeper = null; cachedSupport = null;
```

This covers full restarts via `restart()` (which calls `initTraining`).

Also add the same reset in `respawnAfterGoal` (~line 524), at the end of the function (after the player respawn block):

```js
  enemyRoleTimer = 0;
  cachedAttacker = null; cachedGoalkeeper = null; cachedSupport = null;
```

- [ ] **Step 5: Reset role cache in enemy respawn block inside `_updateEnemies`**

In the in-function respawn block (~line 1175), when an enemy respawns (`enemy.splatTimer >= 0.4`), add after the existing resets:

```js
      // Invalidate cached role if this enemy held a role
      if (cachedAttacker === enemy)   cachedAttacker   = null;
      if (cachedGoalkeeper === enemy) cachedGoalkeeper = null;
      if (cachedSupport === enemy)    cachedSupport    = null;
      enemyRoleTimer = 0; // force immediate reassignment
```

- [ ] **Step 6: Verify in preview**

PLAY → observe that only ONE enemy chases the ball at a time. Other enemies orbit at 120px+ from ball and hold position/goalkeeper role. Role doesn't flicker every frame. No console errors.

- [ ] **Step 7: Commit**
```bash
git add game.js
git commit -m "fix: role lock timer (1.5s) + non-attacker 120px ball avoidance"
```

---

### Task 4: Arrival steering for enemy movement (Fix D)

**Files:**
- Modify: `game.js` (new function ~line 409 alongside separation helper; movement sections in `_updateEnemies` ~lines 1078–1116)

**Context:**
Current enemy movement directly sets `vx/vy` each frame, causing oscillation through the target (overshoot). Arrival steering lerps toward a desired velocity and slows down near the target, preventing overshoot.

- [ ] **Step 1: Add `arrivalSteer` helper**

Add this function immediately after `_resolveEntitySeparation` (inserted in Task 2):

```js
function arrivalSteer(enemy, targetX, targetY, slowRadius) {
  const sr = slowRadius !== undefined ? slowRadius : 80;
  const dx = targetX - enemy.x, dy = targetY - enemy.y;
  const d  = Math.hypot(dx, dy);
  if (d < 1) {
    enemy.vx = lerp(enemy.vx, 0, 0.15);
    enemy.vy = lerp(enemy.vy, 0, 0.15);
    return;
  }
  const desiredSpeed = d < sr ? ENEMY_SPEED * (d / sr) : ENEMY_SPEED;
  enemy.vx = lerp(enemy.vx, (dx / d) * desiredSpeed, 0.15);
  enemy.vy = lerp(enemy.vy, (dy / d) * desiredSpeed, 0.15);
}
```

Note: `arrivalSteer` only sets `enemy.vx`/`enemy.vy`. The existing friction + `enemy.x += enemy.vx * dt` integration at the bottom of the loop still applies.

- [ ] **Step 2: Replace attacker movement with arrival steering**

Find the attacker movement block (~lines 1078–1089):
```js
    } else if (enemy === attacker) {
      if (enemy.hitThisSwing && enemy.swingCooldown > 0.8) {
        // Back off after swing
        if (ed > 0.1) {
          enemy.vx = -(edx / ed) * ENEMY_SPEED * 0.4;
          enemy.vy = -(edy / ed) * ENEMY_SPEED * 0.4;
        }
      } else if (ed > 0.1) {
        // Chase ball
        enemy.vx = (edx / ed) * ENEMY_SPEED;
        enemy.vy = (edy / ed) * ENEMY_SPEED;
      }
```

Replace with:
```js
    } else if (enemy === attacker) {
      if (enemy.hitThisSwing && enemy.swingCooldown > 0.8) {
        // Back off after swing — steer away from ball
        if (ed > 0.1) {
          const awayX = -(edx / ed), awayY = -(edy / ed);
          enemy.vx = lerp(enemy.vx, awayX * ENEMY_SPEED * 0.4, 0.15);
          enemy.vy = lerp(enemy.vy, awayY * ENEMY_SPEED * 0.4, 0.15);
        }
      } else {
        arrivalSteer(enemy, bx, by, 80);
      }
```

- [ ] **Step 3: Replace goalkeeper movement with arrival steering**

Find the goalkeeper movement block (~lines 1091–1100):
```js
    } else if (enemy === goalkeeper) {
      // Position between ball and GATE_RIGHT
      const gateCx = GATE_RIGHT.x + GATE_RIGHT.w / 2;
      const gateCy = GATE_RIGHT.y + GATE_RIGHT.h / 2;
      const targetX = clamp(bx * 0.3 + gateCx * 0.7, TRN_R - 200, TRN_R - 120);
      const targetY = clamp(by, GATE_RIGHT.y - 60, GATE_RIGHT.y + GATE_RIGHT.h + 60);
      const dx = targetX - enemy.x, dy = targetY - enemy.y;
      const d  = Math.hypot(dx, dy);
      if (d > 10) { enemy.vx = (dx / d) * ENEMY_SPEED; enemy.vy = (dy / d) * ENEMY_SPEED; }
      else        { enemy.vx = 0; enemy.vy = 0; }
```

Replace with:
```js
    } else if (enemy === goalkeeper) {
      // Position between ball and GATE_RIGHT
      const gateCx = GATE_RIGHT.x + GATE_RIGHT.w / 2;
      const targetX = clamp(bx * 0.3 + gateCx * 0.7, TRN_R - 200, TRN_R - 120);
      const targetY = clamp(by, GATE_RIGHT.y - 60, GATE_RIGHT.y + GATE_RIGHT.h + 60);
      arrivalSteer(enemy, targetX, targetY, 60);
```

- [ ] **Step 4: Replace support movement with arrival steering**

Find the support movement block (~lines 1102–1109):
```js
    } else if (enemy === support) {
      // Move toward predicted ball position (0.5s lookahead)
      const px = clamp(bx + trainingBall.vx * 0.5, TRN_L + 40, TRN_R - 40);
      const py = clamp(by + trainingBall.vy * 0.5, TRN_T + 40, TRN_B - 40);
      const dx = px - enemy.x, dy = py - enemy.y;
      const d  = Math.hypot(dx, dy);
      if (d > 10) { enemy.vx = (dx / d) * ENEMY_SPEED; enemy.vy = (dy / d) * ENEMY_SPEED; }
      else        { enemy.vx = 0; enemy.vy = 0; }
```

Replace with:
```js
    } else if (enemy === support) {
      // Move toward predicted ball position (0.5s lookahead)
      const px = clamp(bx + trainingBall.vx * 0.5, TRN_L + 40, TRN_R - 40);
      const py = clamp(by + trainingBall.vy * 0.5, TRN_T + 40, TRN_B - 40);
      arrivalSteer(enemy, px, py, 60);
```

- [ ] **Step 5: Verify in preview**

PLAY → enemies no longer oscillate through the ball. Attacker approaches smoothly and slows down as it gets close. Goalkeeper holds position without jitter. No console errors.

- [ ] **Step 6: Commit**
```bash
git add game.js
git commit -m "fix: arrival steering for enemy movement — prevents oscillation overshoot"
```

---

## Chunk 2: Bat Feel — Problem 2

### Task 5: Retune bat constants + CCD frame window + overshoot damping

**Files:**
- Modify: `game.js` (constants block ~lines 39–44; CCD frame check in `_updateBatBallCCD` ~line 653 and in `_updateEnemies` ~line 1029; hit processing in `_updateBatBallCCD` ~lines 733–734)

- [ ] **Step 1: Update bat constants (lines 39–44)**

Find these 6 constants and replace their values exactly:

```js
const BAT_REST_LERP      = 0.18;   // was 0.08 — faster rest-angle tracking, less floaty
const BAT_VISUAL_LERP    = 0.22;   // was 0.12 — tighter visual trail
const BAT_SWING_POWER    = 9;      // was 18 — half the snap velocity
const BAT_SWING_DECAY    = 0.68;   // was 0.75 — swing dies out faster
const BAT_OVERSHOOT_DEG  = 12;     // was 25 — much smaller overshoot
const BAT_RETURN_LERP    = 0.18;   // was 0.25 — gentler spring return
```

- [ ] **Step 2: Extend player bat CCD window to frames 2–10**

Find (~line 652):
```js
  const ccdActive = (bat.swingPhase === 'snap') &&
                    (bat.swingFrame >= 2) && (bat.swingFrame <= 8);
```

Change `<= 8` to `<= 10`:
```js
  const ccdActive = (bat.swingPhase === 'snap') &&
                    (bat.swingFrame >= 2) && (bat.swingFrame <= 10);
```

- [ ] **Step 3: Extend enemy bat CCD window to frames 2–10**

Find (~line 1028):
```js
    const ccdActive = enemy.swingPhase === 'snap' &&
                      enemy.swingFrame >= 2 && enemy.swingFrame <= 8;
```

Change `<= 8` to `<= 10`:
```js
    const ccdActive = enemy.swingPhase === 'snap' &&
                      enemy.swingFrame >= 2 && enemy.swingFrame <= 10;
```

- [ ] **Step 4: Add overshoot damping to player bat hit processing**

Find the launch velocity lines in `_updateBatBallCCD` (~lines 733–734):
```js
      trainingBall.vx = hitDx * effectiveSpeed * BAT_POWER_MULT;
      trainingBall.vy = hitDy * effectiveSpeed * BAT_POWER_MULT;
```

Replace with:
```js
      // Dampen 40% if bat has genuinely overshot its target (past BAT_OVERSHOOT_DEG boundary)
      // batOvershoot > threshold means the bat is in the back-swing zone past the target
      const batOvershoot = Math.abs(normalizeAngle(bat.visualAngle - bat.targetAngle));
      const overshootMult = batOvershoot > BAT_OVERSHOOT_DEG * Math.PI / 180 ? 0.6 : 1.0;
      trainingBall.vx = hitDx * effectiveSpeed * BAT_POWER_MULT * overshootMult;
      trainingBall.vy = hitDy * effectiveSpeed * BAT_POWER_MULT * overshootMult;
```

- [ ] **Step 5: Verify in preview**

PLAY → bat feels tighter (less floaty lag). Snap is less explosive. Hitting ball during overshoot phase produces noticeably weaker launch. No console errors.

- [ ] **Step 6: Commit**
```bash
git add game.js
git commit -m "fix: bat retune — tighter constants, CCD frames 2-10, overshoot damping"
```

---

### Task 6: Wind-up visual cleanup, hit squash timer, motion blur reduction

**Files:**
- Modify: `game.js` (`bat` object ~line 213; idle phase in `_updateBatBallCCD` ~lines 604–621; snap phase ~lines 623–637; hit block ~line 743; motion blur trail cap ~line 773)
- Modify: `draw.js` (motion blur trail ~lines 464–488)

**Context:**
The current idle-phase length stretch looks broken. Replace with a proper squash timer: no deformation during idle, squash (1.2 × 0.9) for exactly 4 frames after a hit, then back to (1,1). Motion blur reduces from 3 ghost frames to 2.

- [ ] **Step 1: Add `squashTimer` field to `bat` object**

Find the `bat` object (~line 213). Add `squashTimer: 0` after `swingFrame: 0`:

```js
const bat = {
  length: 48, width: 14,
  prevAngle: 0,
  prevBase: { x: 0, y: 0 },
  prevTip:  { x: 0, y: 0 },
  hitThisSwing: false,
  hitCooldown: 0,
  // Rubber-band fields
  restAngle: 0,
  visualAngle: 0,
  swingVelocity: 0,
  swingPhase: 'idle',
  swingFrame: 0,
  squashTimer: 0,       // ← new: frames remaining for hit squash
  targetAngle: 0,
  visualScaleX: 1.0,
  visualScaleY: 1.0,
  prevVisualAngles: [],
};
```

- [ ] **Step 2: Remove wind-up stretch from idle phase**

In the idle phase block (~lines 608–611), find:
```js
    // Wind-up tension: slight stretch proportional to angular lag
    const lag = Math.abs(normalizeAngle(bat.restAngle - bat.visualAngle));
    bat.visualScaleX = 1.0 + Math.min(lag, 0.3) * 0.5; // max ~1.15
    bat.visualScaleY = 1.0;
```

Delete those 4 lines entirely (they set scales in idle — we no longer want that).

- [ ] **Step 3: Remove hardcoded squash from snap phase**

In the snap phase block (~lines 628–630), find:
```js
    // Impact squash
    bat.visualScaleX = 1.3;
    bat.visualScaleY = 0.85;
```

Delete those 3 lines entirely.

- [ ] **Step 4: Set squash timer when a hit occurs**

In the hit-success block (~line 743), after `bat.hitThisSwing = true;`, add:
```js
      bat.squashTimer = 4; // 4 frames of squash on impact
```

- [ ] **Step 5: Drive scales from squashTimer after all phase logic**

In `_updateBatBallCCD`, after the entire `if/else if/else` phase block (after the return-phase closing `}`), before the `// ── CCD` comment, add:

```js
  // Squash-on-hit: count down, apply scale; otherwise neutral
  // Note: squashTimer takes priority over the return-phase lerp while counting down.
  // Once squashTimer reaches 0 and phase is 'return', the return-phase lerp takes over.
  if (bat.squashTimer > 0) {
    bat.squashTimer--;
    bat.visualScaleX = 1.2;
    bat.visualScaleY = 0.9;
  } else if (bat.swingPhase !== 'return') {
    bat.visualScaleX = 1.0;
    bat.visualScaleY = 1.0;
  }
  // (in 'return' phase with squashTimer==0, the return block's lerp back to 1.0 applies)
```

- [ ] **Step 6: Reduce motion blur to 2 ghost frames in game.js**

Find (~line 773):
```js
  bat.prevVisualAngles.unshift(bat.visualAngle);
  if (bat.prevVisualAngles.length > 3) bat.prevVisualAngles.pop();
```

Change cap from 3 to 2:
```js
  bat.prevVisualAngles.unshift(bat.visualAngle);
  if (bat.prevVisualAngles.length > 2) bat.prevVisualAngles.pop();
```

- [ ] **Step 7: Update motion blur rendering in draw.js**

In `draw.js`, find the motion blur trail block (~lines 464–488):
```js
      if (bat.swingPhase === 'snap' && bat.prevVisualAngles.length > 0) {
        const trailOpacity = [0.3, 0.15, 0.05];
        const batX = player.radius + 10;
        ...
        for (let t = 0; t < bat.prevVisualAngles.length; t++) {
```

Change the trail opacity array and loop:

1. Replace `const trailOpacity = [0.3, 0.15, 0.05];` with `const trailOpacity = [0.2, 0.08];`
2. Change `for (let t = 0; t < bat.prevVisualAngles.length; t++)` to `for (let t = 0; t < Math.min(bat.prevVisualAngles.length, 2); t++)`

- [ ] **Step 8: Verify in preview**

PLAY → in idle, bat shows no deformation (clean). Click → brief squash on hit only, then back to normal. Motion blur shows 2 faint ghosts during snap (not 3). No console errors.

- [ ] **Step 9: Commit**
```bash
git add game.js draw.js
git commit -m "fix: bat squash-on-hit timer, no idle stretch, 2-frame motion blur"
```

---

### Task 7: Enemy-specific bat tuning

**Files:**
- Modify: `game.js` (constants ~line 44; enemy snap trigger ~line 993; enemy overshoot check ~line 1012)

**Context:**
Enemies should be slightly weaker than the player (ENEMY_BAT_SWING_POWER = 7 vs 9) and more precise (ENEMY_BAT_OVERSHOOT_DEG = 8 vs 12). Enemies should also not swing when the ball is already heading toward the enemy goal (GATE_RIGHT, the right gate) — let it score.

- [ ] **Step 1: Add enemy-specific bat constants**

After `BAT_RETURN_LERP` in the constants block (~line 44), add:

```js
const ENEMY_BAT_SWING_POWER   = 7;    // weaker than player (BAT_SWING_POWER = 9)
const ENEMY_BAT_OVERSHOOT_DEG = 8;    // more precise, less overshoot
```

- [ ] **Step 2: Use enemy-specific constants in snap trigger**

Find the snap trigger inside the enemy idle phase (~line 993–1003):
```js
      if (inRange && enemy.swingCooldown <= 0 && !enemy.hitThisSwing &&
          angleLag < 15 * Math.PI / 180) {
        const angDist      = normalizeAngle(idealAngle - enemy.visualAngle);
        enemy.swingVelocity = angDist * BAT_SWING_POWER;
```

Replace `BAT_SWING_POWER` with `ENEMY_BAT_SWING_POWER`:
```js
        enemy.swingVelocity = angDist * ENEMY_BAT_SWING_POWER;
```

- [ ] **Step 3: Add "don't swing if ball heading to enemy goal" check**

The snap trigger condition (~line 993) currently is:
```js
      if (inRange && enemy.swingCooldown <= 0 && !enemy.hitThisSwing &&
          angleLag < 15 * Math.PI / 180) {
```

Replace with:
```js
      // Don't swing if ball is already heading toward enemy goal (GATE_RIGHT)
      const ballDir = Math.atan2(trainingBall.vy, trainingBall.vx);
      const toEnemyGoal = Math.atan2(
        GATE_RIGHT.y + GATE_RIGHT.h / 2 - by,
        GATE_RIGHT.x + GATE_RIGHT.w / 2 - bx
      );
      const headingToGoal = trainingBall.speed > 100 &&
        Math.abs(normalizeAngle(ballDir - toEnemyGoal)) < Math.PI / 3;
      if (!headingToGoal && inRange && enemy.swingCooldown <= 0 &&
          !enemy.hitThisSwing && angleLag < 15 * Math.PI / 180) {
```

- [ ] **Step 4: Use enemy-specific overshoot constant**

Find the snap-to-return transition (~line 1011):
```js
      const overshoot = normalizeAngle(enemy.visualAngle - enemy.targetAngle);
      if (Math.abs(overshoot) > BAT_OVERSHOOT_DEG * Math.PI / 180 ||
```

Replace `BAT_OVERSHOOT_DEG` with `ENEMY_BAT_OVERSHOOT_DEG`:
```js
      if (Math.abs(overshoot) > ENEMY_BAT_OVERSHOOT_DEG * Math.PI / 180 ||
```

- [ ] **Step 5: Verify in preview**

PLAY → enemies hit weaker than player. Enemies visibly don't swing when ball is rolling toward the right gate. No console errors.

- [ ] **Step 6: Commit**
```bash
git add game.js
git commit -m "fix: enemy bat — weaker power, tighter overshoot, skip swing when ball heading to goal"
```

---

## Final Verification Checklist

- [ ] Ball hit hard between enemies escapes — not permanently trapped
- [ ] Enemies visibly spread apart instead of stacking
- [ ] Only ONE enemy chases ball at any moment; others hold roles
- [ ] Enemies don't oscillate through ball target position
- [ ] Bat lag feels tight (not floaty) — responds quickly to mouse
- [ ] Snap is noticeably less explosive than before
- [ ] Bat shows squash (1.2 × 0.9) briefly on hit, then returns to neutral
- [ ] No idle wind-up deformation
- [ ] 2 motion blur ghost frames during snap only
- [ ] Enemies let a ball heading to their goal pass (don't swing at it)
- [ ] No console errors throughout play
