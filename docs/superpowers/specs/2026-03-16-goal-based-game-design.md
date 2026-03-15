# Training Grounds — Goal-Based Game Design
**Date:** 2026-03-16
**Approach:** In-place surgical edits to `game.js` and `draw.js`

---

## 1. Map & Gate Zones

### Gate objects (computed after `calcTrainingBounds()`)
The two side-wall rects (`TRN_RECTS[8]` and `TRN_RECTS[9]`, the `{w:35, h:180}` vertical blocks) are **removed from `TRN_RECTS`** so the ball passes through them. Instead, two `GATE_LEFT` and `GATE_RIGHT` objects are defined with the same coordinates:

```js
GATE_LEFT  = { x: TRN_L+50, y: cy-90, w: 35, h: 180, team: 'RED'  }
GATE_RIGHT = { x: TRN_R-85, y: cy-90, w: 35, h: 180, team: 'BLUE' }
```

- **Left gate** = BLUE team's goal (BLUE defends, RED attacks → scoring here gives RED +1)
- **Right gate** = RED team's goal (RED defends, BLUE attacks → scoring here gives BLUE +1)

### Goal detection
Each frame (when `goalFreezeTimer <= 0`): if `ball.x` and `ball.y` are fully inside a gate rect (center-inside point test), trigger a goal for that gate's `team`.

### Gate visuals (in `draw.js`)
- **No solid fill** — drawn as a hollow rounded-rect frame outline
- **Semi-transparent glow fill** inside: blue (`rgba(52,152,219,0.25)`) for left gate, red (`rgba(231,76,60,0.25)`) for right gate
- **Pulsing animation**: glow opacity oscillates using `Math.sin(performance.now()/600)` ×0.10 added to base 0.25
- **Net lines**: diagonal cross-hatch pattern (two sets of lines at ±45°, low opacity ~0.12) clipped to gate interior

---

## 2. Scoreboard HUD & Win Condition

### Scoreboard (screen-space, top-center)
Replaces the `TRAINING GROUNDS` mode label. Two clay-styled score boxes side by side:

```
[ BLUE  3 ] ⚽ [ 2  RED ]
```

- **Left box**: `#3498DB` bg, label "BLUE" (12px), score number (48px bold), claymorphism drop shadow + rounded corners
- **Right box**: `#E74C3C` bg, score number (48px bold), label "RED" (12px)
- **Separator**: small ball icon (circle) between boxes
- **Score bounce animation**: when a goal is scored, the winning team's score number scales `1.3x → 1.0x` over 400ms driven by `scoreAnimTimer[team]`

### State machine
Replace `gameOver: bool` with:
```js
let gameState = 'playing'; // 'playing' | 'won'
let winner = null;         // 'BLUE' | 'RED' | null
```

### Win condition
`GOALS_TO_WIN = 5`. When either team reaches 5 goals: `gameState = 'won'`, `winner = team`.

### Win overlay
- Full-screen semi-transparent overlay in winning team's color
- Large text: `"BLUE WINS!"` or `"RED WINS!"`
- `"PLAY AGAIN"` button: resets scores to 0, resets `gameState = 'playing'`, respawns all entities

### Player death
HP reaching 0 no longer triggers `gameState = 'won'`. Instead:
- `player.alive = false`, `playerRespawnTimer = 2.0` starts
- Player hidden and invulnerable during countdown
- After 2s: teleport to BLUE spawn `(WW*0.28, mapCY)`, restore full HP, 1s invulnerability flash

---

## 3. Team System & Enemy AI

### Spawn positions
- **Player (BLUE)**: `(WW * 0.28, mapCY)` — left third
- **Enemies (RED)** — 3 enemies at fixed positions:
  - `enemies[0]` goalkeeper: `(WW*0.82, mapCY)`
  - `enemies[1]` support: `(WW*0.72, mapCY - 150)`
  - `enemies[2]` support: `(WW*0.72, mapCY + 150)`

### Possession heuristic
Ball moving toward left gate: `trainingBall.vx < -50` → RED attacking
Otherwise: BLUE attacking

### Enemy roles (assigned by index, re-evaluated each frame when not swinging)

**When RED attacking (ball moving left):**
- `enemies[0]` = **Attacker**: chase ball; on swing init, override `swingStartAngle` so hit direction aims toward `GATE_LEFT` center
- `enemies[1,2]` = **Support**: position at `(WW*0.6, mapCY ± 120)` to receive rebounds

**When BLUE attacking (ball moving right):**
- `enemies[0]` = **Goalkeeper**: move to stay between ball and `GATE_RIGHT` center; clamp x near `TRN_R - 120`, clamp y to gate bounds ±100
- `enemies[1,2]` = **Interceptors**: move toward predicted intercept point = `ball.pos + ball.vel * 0.3`

### General AI rules
- Separation: if two enemies within 80px, apply push-apart force
- Existing dodge behavior (perpendicular sidestep when ball speed > 200) remains active for all roles
- Enemies removed on splat are now **respawned** at their fixed starting positions (no permanent removal) — splat still plays, then enemy reappears

### Attacker swing aim fix
When a RED enemy initiates a swing, compute ideal angle:
```js
const aimAngle = Math.atan2(GATE_LEFT.y + GATE_LEFT.h/2 - enemy.y,
                            GATE_LEFT.x + GATE_LEFT.w/2 - enemy.x);
enemy.swingStartAngle = aimAngle;
```
(existing CCD hit logic unchanged — only the start angle changes)

---

## 4. Goal Celebration & Respawn

### On goal scored (triggered once per goal, guarded by `goalFreezeTimer <= 0`)
1. Zero ball velocity; set `goalFreezeTimer = GOAL_FREEZE_DURATION` (1000ms)
2. Spawn 25 particles at gate center: small circles in scoring team's color, random outward velocity 150–400px/s, fade over 800ms — added to `bounceParticles` with `color` field
3. `scoreAnimTimer[team] = 0.4` — triggers score box scale bounce
4. Spawn floating `+1` text at gate center (rises 60px, fades over 1000ms) — added to `damageNumbers` with team color and `text: '+1'`
5. Increment `scores[team]`; check win condition
6. After 1000ms: respawn ball at `(WW/2, mapCY)` zero velocity; respawn all enemies at RED starting positions with full HP; respawn player at BLUE starting position with full HP

### Player death respawn (independent of goals)
- `playerRespawnTimer` counts down from 2.0s when HP = 0
- After 2s: full HP, teleport to BLUE spawn, 1s invulnerability

---

## 5. New Constants

```js
const GOALS_TO_WIN         = 5;
const GOAL_FREEZE_DURATION = 1000;  // ms (not seconds — compared against ms timer)
const ENEMY_COUNT          = 3;     // replaces ENEMY_MAX_COUNT
```

Retained as tunable: `DAMAGE_MULTIPLIER`, `ENEMY_HP` (→ rename `ENEMY_MAX_HP`), `PLAYER_HP`, `MAX_BALL_SPEED`

---

## 6. Files Changed

| File | Changes |
|------|---------|
| `game.js` | New constants; gate zone objects; goal detection; game state refactor; scoreboard data; score animation timers; player respawn logic; enemy spawn positions; enemy AI roles; goal celebration logic |
| `draw.js` | Gate drawing (hollow frame + glow + net); scoreboard HUD; win overlay; `+1` float text colored; celebration particles colored |

---

## Implementation Order (for writing-plans)

1. New constants + gate objects in `game.js`
2. Remove gate rects from `TRN_RECTS`; add gate collision pass-through
3. Game state refactor (`gameOver` → `gameState`/`winner`)
4. Scores, timers, `goalFreezeTimer`, `scoreAnimTimer`
5. Goal detection logic in `_updateBallPhysics`
6. Goal celebration: particles, `+1` float, freeze/respawn sequence
7. Enemy spawn positions + `spawnAllEnemies()` function
8. Enemy AI roles (attacker aim fix, goalkeeper, support, interceptor, separation)
9. Player death → respawn (not game over)
10. Draw: gate visuals in `draw.js`
11. Draw: scoreboard HUD
12. Draw: win overlay + PLAY AGAIN button
13. Draw: colored celebration particles + `+1` text
