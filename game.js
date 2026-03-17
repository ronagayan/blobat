'use strict';

// ── Canvas ───────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const WW = 1600, WH = 900;
canvas.width = WW;
canvas.height = WH;
const ctx = canvas.getContext('2d');
let canvasScale = 1;

function rescale() {
  canvasScale = Math.min(window.innerWidth / WW, window.innerHeight / WH);
  canvas.style.transform = `translate(-50%, -50%) scale(${canvasScale})`;
}
window.addEventListener('resize', rescale);
rescale();

// ── Tunable constants ────────────────────────────
const TILE               = 64;      // used by makeFloor() in draw.js
const PLAYER_HP          = 100;
const PLAYER_SPEED       = 290;
const PLAYER_FRICTION    = 0.83;
const BAT_POWER_MULT     = 1.5;
const DAMAGE_MULTIPLIER  = 0.04;    // ball speed × this = hp damage
const RESTITUTION        = 0.8;
const BALL_FRICTION      = 0.985;
const MAX_BALL_SPEED     = 1000;
const ENEMY_MAX_HP       = 100;
const ENEMY_SPEED        = 160;
const ENEMY_BAT_LENGTH   = 48;
const ENEMY_BAT_WIDTH    = 14;
const TRN_WALL           = 40;
const TRN_MAX_SPEED      = 800;    // ball speed = 100% momentum
const TRN_DEBUG          = false;
const GOALS_TO_WIN         = 5;
const GOAL_FREEZE_DURATION = 1.0;   // seconds
const ENEMY_COUNT          = 3;
const MIN_BALL_SPEED     = 0.8;   // px per frame — ball never fully stops
const BAT_REST_LERP      = 0.18;   // was 0.08 — faster rest-angle tracking, less floaty
const BAT_VISUAL_LERP    = 0.22;   // was 0.12 — tighter visual trail
const BAT_SWING_POWER    = 9;      // was 18 — half the snap velocity
const BAT_SWING_DECAY    = 0.68;   // was 0.75 — swing dies out faster
const BAT_OVERSHOOT_DEG  = 12;     // was 25 — much smaller overshoot
const BAT_RETURN_LERP    = 0.18;   // was 0.25 — gentler spring return
const ENEMY_BAT_SWING_POWER   = 7;    // weaker than player (BAT_SWING_POWER = 9)
const ENEMY_BAT_OVERSHOOT_DEG = 8;    // more precise, less overshoot
const MAX_SWING_FRAMES        = 20;   // safety: force snap→return after this many frames

// ── Input ────────────────────────────────────────
const keys  = {};
const mouse = {
  x: WW / 2, y: WH / 2,
  down: false, justDown: false, justUp: false,
  screenX: WW / 2, screenY: WH / 2,
};
const myPlayerColor = '#44ff88';

// ── Player ───────────────────────────────────────
const player = {
  x: WW / 2, y: WH / 2 + 150,
  vx: 0, vy: 0,
  radius: 26, angle: 0,
  speed: PLAYER_SPEED, friction: PLAYER_FRICTION,
  rolling: false, rollTimer: 0, rollDuration: 0.32,
  rollCooldown: 0, rollCooldownMax: 1.1,
  rollDx: 1, rollDy: 0, rollSpeed: 820,
  ghosts: [],
  hp: PLAYER_HP, maxHp: PLAYER_HP,
  invulnTimer: 0, alive: true, flashTimer: 0,
};

// ── Utility functions ────────────────────────────
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }
function normalizeAngle(a) {
  while (a >  Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
function lerp(a, b, t) { return a + (b - a) * t; }
function lerpAngle(a, b, t) { return a + normalizeAngle(b - a) * t; }
// Returns [nx, ny] unit vector from (ax,ay) toward (bx,by); returns [0,0] if coincident.
function safeNormalize(dx, dy) {
  const d = Math.hypot(dx, dy);
  return d > 0.001 ? [dx / d, dy / d] : [0, 0];
}

// ── Mouse events ─────────────────────────────────
canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  const sx = (e.clientX - r.left) * (WW / r.width);
  const sy = (e.clientY - r.top)  * (WH / r.height);
  mouse.screenX = sx;
  mouse.screenY = sy;
  mouse.x = (sx - WW / 2) / trnCam.zoom + trnCam.x;
  mouse.y = (sy - WH / 2) / trnCam.zoom + trnCam.y;
});
canvas.addEventListener('mousedown', e => {
  mouse.down = true; mouse.justDown = true;
  const r = canvas.getBoundingClientRect();
  const sx = (e.clientX - r.left) * (WW / r.width);
  const sy = (e.clientY - r.top)  * (WH / r.height);
  mouse.screenX = sx; mouse.screenY = sy;
  mouse.x = (sx - WW / 2) / trnCam.zoom + trnCam.x;
  mouse.y = (sy - WH / 2) / trnCam.zoom + trnCam.y;
});
canvas.addEventListener('mouseup', () => { mouse.down = false; mouse.justUp = true; });
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  const t = e.touches[0];
  const r = canvas.getBoundingClientRect();
  const sx = (t.clientX - r.left) * (WW / r.width);
  const sy = (t.clientY - r.top)  * (WH / r.height);
  mouse.down = true; mouse.justDown = true;
  mouse.screenX = sx; mouse.screenY = sy;
  mouse.x = (sx - WW / 2) / trnCam.zoom + trnCam.x;
  mouse.y = (sy - WH / 2) / trnCam.zoom + trnCam.y;
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  const t = e.touches[0];
  const r = canvas.getBoundingClientRect();
  const sx = (t.clientX - r.left) * (WW / r.width);
  const sy = (t.clientY - r.top)  * (WH / r.height);
  mouse.screenX = sx; mouse.screenY = sy;
  mouse.x = (sx - WW / 2) / trnCam.zoom + trnCam.x;
  mouse.y = (sy - WH / 2) / trnCam.zoom + trnCam.y;
}, { passive: false });
canvas.addEventListener('touchend', () => { mouse.down = false; mouse.justUp = true; });

// ── Keyboard events ──────────────────────────────
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space') { e.preventDefault(); tryRoll(); }
});
window.addEventListener('keyup',  e => { keys[e.code] = false; });

// ── tryRoll (standalone — no WS/INV deps) ────────
function tryRoll() {
  if (player.rolling || player.rollCooldown > 0) return;
  let rdx = 0, rdy = 0;
  if (keys['KeyW'] || keys['ArrowUp'])    rdy -= 1;
  if (keys['KeyS'] || keys['ArrowDown'])  rdy += 1;
  if (keys['KeyA'] || keys['ArrowLeft'])  rdx -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) rdx += 1;
  if (rdx === 0 && rdy === 0) {
    rdx = Math.cos(player.angle);
    rdy = Math.sin(player.angle);
  } else {
    const l = Math.hypot(rdx, rdy);
    rdx /= l; rdy /= l;
  }
  player.rolling    = true;
  player.rollTimer  = player.rollDuration;
  player.rollCooldown = player.rollCooldownMax;
  player.rollDx = rdx;
  player.rollDy = rdy;
}

// ── Training map bounds ──────────────────────────
// NOTE: Written fresh — NOT copied from training.js.
// The original uses a visibleH calculation for mobile cropping
// which is wrong for the letterboxed standalone.
let TRN_L = TRN_WALL, TRN_R = WW - TRN_WALL;
let TRN_T = TRN_WALL, TRN_B = WH - TRN_WALL;
let TRN_RECTS = [];
let GATE_LEFT  = null;
let GATE_RIGHT = null;

function calcTrainingBounds() {
  TRN_L = TRN_WALL;
  TRN_R = WW - TRN_WALL;
  TRN_T = TRN_WALL;
  TRN_B = WH - TRN_WALL;

  const cx = WW / 2;
  const cy = (TRN_T + TRN_B) / 2;
  const hw = (TRN_R - TRN_L) / 2;
  const hh = (TRN_B - TRN_T) / 2;

  TRN_RECTS = [
    // Central cross
    { x: cx - 40, y: cy - hh * 0.35, w: 80, h: 70 },
    { x: cx - 40, y: cy + hh * 0.35 - 70, w: 80, h: 70 },
    { x: cx - hw * 0.35, y: cy - 35, w: 80, h: 70 },
    { x: cx + hw * 0.35 - 80, y: cy - 35, w: 80, h: 70 },
    // Corner bumpers
    { x: TRN_L + 60, y: TRN_T + 60, w: 90, h: 50 },
    { x: TRN_R - 150, y: TRN_T + 60, w: 90, h: 50 },
    { x: TRN_L + 60, y: TRN_B - 110, w: 90, h: 50 },
    { x: TRN_R - 150, y: TRN_B - 110, w: 90, h: 50 },
    // Top/bottom barriers
    { x: cx - hw * 0.55, y: TRN_T + 50, w: 50, h: 90 },
    { x: cx + hw * 0.55 - 50, y: TRN_T + 50, w: 50, h: 90 },
    { x: cx - hw * 0.55, y: TRN_B - 140, w: 50, h: 90 },
    { x: cx + hw * 0.55 - 50, y: TRN_B - 140, w: 50, h: 90 },
  ];
  GATE_LEFT  = { x: TRN_L + 50,  y: cy - 90, w: 35, h: 180 };
  GATE_RIGHT = { x: TRN_R - 85, y: cy - 90, w: 35, h: 180 };
}

// ── Camera (fixed center — no tracking needed) ───
const trnCam = { x: WW / 2, y: WH / 2, zoom: 1 };

function updateTrainingCamera() {
  trnCam.zoom = 1;
  trnCam.x = WW / 2;
  trnCam.y = WH / 2;
}

// ── Ball state ───────────────────────────────────
const trainingBall = {
  x: WW / 2, y: WH / 2,
  vx: 0, vy: 0,
  radius: 16, speed: 0,
  squash: 1, squashAngle: 0, squashTimer: 0,
  trail: [], stopped: true,
};

// ── Bat state ────────────────────────────────────
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
  swingPhase: 'idle',      // 'idle' | 'snap' | 'return'
  swingFrame: 0,
  squashTimer: 0,       // frames remaining for hit squash
  targetAngle: 0,
  visualScaleX: 1.0,
  visualScaleY: 1.0,
  prevVisualAngles: [],    // last 3 angles for motion blur
};

// ── Visual FX state ──────────────────────────────
let bounceParticles = [];
let impactFlashes   = [];
let shakeTimer      = 0;
let shakeIntensity  = 0;
let momentumDisplay = 0;

// ── Physics helpers (verbatim from training.js) ──

function pushOutOfTrainingRects(ent) {
  const r = ent.radius;
  for (const rect of TRN_RECTS) {
    const left = rect.x - r, right = rect.x + rect.w + r;
    const top  = rect.y - r, bottom = rect.y + rect.h + r;
    if (ent.x < left || ent.x > right || ent.y < top || ent.y > bottom) continue;
    const ol = ent.x - left, or2 = right - ent.x, ot = ent.y - top, ob = bottom - ent.y;
    const m = Math.min(ol, or2, ot, ob);
    if (m === ol)       { ent.x = left;   if (ent.vx > 0) ent.vx = 0; }
    else if (m === or2) { ent.x = right;  if (ent.vx < 0) ent.vx = 0; }
    else if (m === ot)  { ent.y = top;    if (ent.vy > 0) ent.vy = 0; }
    else                { ent.y = bottom; if (ent.vy < 0) ent.vy = 0; }
  }
}

function bounceBallOffRect(b, rect) {
  const r = b.radius;
  const left = rect.x - r, right = rect.x + rect.w + r;
  const top  = rect.y - r, bottom = rect.y + rect.h + r;
  if (b.x < left || b.x > right || b.y < top || b.y > bottom) return false;

  const ol = b.x - left, or2 = right - b.x, ot = b.y - top, ob = bottom - b.y;
  const m = Math.min(ol, or2, ot, ob);
  const restitution = 0.8;

  if (m === ol)       { b.x = left;   b.vx = -Math.abs(b.vx) * restitution; b.squashAngle = 0; }
  else if (m === or2) { b.x = right;  b.vx =  Math.abs(b.vx) * restitution; b.squashAngle = 0; }
  else if (m === ot)  { b.y = top;    b.vy = -Math.abs(b.vy) * restitution; b.squashAngle = Math.PI / 2; }
  else                { b.y = bottom; b.vy =  Math.abs(b.vy) * restitution; b.squashAngle = Math.PI / 2; }

  b.squash = 0.7;
  b.squashTimer = 0.13;

  const spd0 = Math.hypot(b.vx, b.vy);

  if (spd0 > 60) {
    impactFlashes.push({ x: b.x, y: b.y, radius: 8, maxRadius: 30 + spd0 * 0.03, alpha: 0.6 });
  }

  if (spd0 > 40) {
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 40 + Math.random() * 80;
      bounceParticles.push({
        x: b.x, y: b.y,
        vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
        life: 0.25 + Math.random() * 0.15,
        maxLife: 0.25 + Math.random() * 0.15,
        radius: 3 + Math.random() * 4,
      });
    }
    if (spd0 > 150) {
      shakeTimer = 0.12;
      shakeIntensity = Math.min(spd0 * 0.008, 6);
    }
  }

  return true;
}

function closestPointOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { x: ax, y: ay, t: 0 };
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return { x: ax + dx * t, y: ay + dy * t, t };
}

function segmentCircleTest(ax, ay, bx, by, cx, cy, r) {
  const cp = closestPointOnSegment(cx, cy, ax, ay, bx, by);
  const d = Math.hypot(cx - cp.x, cy - cp.y);
  return { hit: d < r, closest: cp, dist: d };
}

function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const denom = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (Math.abs(denom) < 1e-10) return false;
  const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / denom;
  const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

function _getBatSegment(angle) {
  const baseDist = player.radius + 10;
  const tipDist = baseDist + bat.length;
  return {
    bx: player.x + Math.cos(angle) * baseDist,
    by: player.y + Math.sin(angle) * baseDist,
    tx: player.x + Math.cos(angle) * tipDist,
    ty: player.y + Math.sin(angle) * tipDist,
  };
}

function _getEnemyBatSegment(enemy, angle) {
  const baseDist = enemy.radius + 10;
  return {
    bx: enemy.x + Math.cos(angle) * baseDist,
    by: enemy.y + Math.sin(angle) * baseDist,
    tx: enemy.x + Math.cos(angle) * (baseDist + ENEMY_BAT_LENGTH),
    ty: enemy.y + Math.sin(angle) * (baseDist + ENEMY_BAT_LENGTH),
  };
}

// ── Ball damage ──────────────────────────────────
function applyBallDamage(entity) {
  if (trainingBall.stopped) return false;
  // Skip dead or invulnerable player (prevents respawnTimer reset loops)
  if (entity === player && (!player.alive || player.invulnTimer > 0)) return false;
  const d = Math.hypot(trainingBall.x - entity.x, trainingBall.y - entity.y);
  if (d >= trainingBall.radius + entity.radius) return false;
  if (trainingBall.speed <= 30) return false;

  const dmg = trainingBall.speed * DAMAGE_MULTIPLIER;
  entity.hp = Math.max(0, entity.hp - dmg);
  entity.flashTimer = 0.2;

  // Spawn floating damage number
  damageNumbers.push({
    x: entity.x, y: entity.y - entity.radius - 5,
    value: Math.round(dmg),
    life: 1.0, maxLife: 1.0,
  });

  // Slow ball on hit
  trainingBall.vx *= 0.7;
  trainingBall.vy *= 0.7;
  trainingBall.speed = Math.hypot(trainingBall.vx, trainingBall.vy);

  // Push ball out of entity (safeNormalize guards against d≈0 NaN)
  const [nx, ny] = safeNormalize(trainingBall.x - entity.x, trainingBall.y - entity.y);
  if (nx !== 0 || ny !== 0) {
    const overlap = (trainingBall.radius + entity.radius) - d;
    trainingBall.x += nx * (overlap + 2);
    trainingBall.y += ny * (overlap + 2);
  }

  // Trigger game over for player when hp bottoms out
  if (entity === player && entity.hp < 0.5) {
    entity.hp = 0;
    entity.alive = false;
    playerRespawnTimer = 2.0;
  }

  // Trigger splat for dead enemies
  if (entity !== player && entity.hp < 0.5 && entity.splatTimer < 0) {
    entity.hp = 0;
    entity.splatTimer = 0;
  }

  return true;
}

function _pushBallOutOfCharacters() {
  if (trainingBall.stopped) return;
  const chars = player.alive ? [player, ...trnEnemies] : [...trnEnemies];
  for (const ch of chars) {
    if (ch.splatTimer >= 0) continue; // skip dying enemies (player has no splatTimer — handled above)
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

function getBatTip() {
  const tipDist = player.radius + 10 + bat.length;
  return {
    x: player.x + Math.cos(player.angle) * tipDist,
    y: player.y + Math.sin(player.angle) * tipDist,
  };
}

function getBatBase() {
  const baseDist = player.radius + 10;
  return {
    x: player.x + Math.cos(player.angle) * baseDist,
    y: player.y + Math.sin(player.angle) * baseDist,
  };
}

// ── Enemies ──────────────────────────────────────
let trnEnemies = [];

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

function arrivalSteer(enemy, targetX, targetY, slowRadius) {
  const sr = slowRadius !== undefined ? slowRadius : 80;
  const dx = targetX - enemy.x, dy = targetY - enemy.y;
  const d  = Math.hypot(dx, dy);
  if (d < 0.5) {
    // At/past target — nudge randomly so enemy doesn't freeze at target point
    enemy.vx += (Math.random() - 0.5) * ENEMY_SPEED * 0.1;
    enemy.vy += (Math.random() - 0.5) * ENEMY_SPEED * 0.1;
    return;
  }
  const desiredSpeed = d < sr ? ENEMY_SPEED * (d / sr) : ENEMY_SPEED;
  // Minimum speed floor: enemy never fully stops due to slowRadius scaling
  const finalSpeed = Math.max(desiredSpeed, ENEMY_SPEED * 0.15);
  enemy.vx = lerp(enemy.vx, (dx / d) * finalSpeed, 0.15);
  enemy.vy = lerp(enemy.vy, (dy / d) * finalSpeed, 0.15);
}

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
      swingCooldown: 0,
      // Rubber-band bat fields (replaces swingProgress)
      swingPhase: 'idle',      // 'idle' | 'snap' | 'return'
      swingFrame: 0,
      restAngle: angle,
      visualAngle: angle,
      swingVelocity: 0,
      targetAngle: angle,
      prevBatBase: { x: seg.bx, y: seg.by },
      prevBatTip:  { x: seg.tx, y: seg.ty },
      hitThisSwing: false,
      idleTimer: 0,
      lastCheckX: sx, lastCheckY: sy,
      color: '#E74C3C',
    });
  }
}

// Restart button bounds (canvas-space):
const RESTART_BTN     = { x: WW / 2 - 100, y: WH / 2 + 40, w: 200, h: 60 };
const RESTART_TOP_BTN = { x: 20, y: 20, w: 90, h: 30 };

function checkRestartClick() {
  if (!mouse.justDown) return;
  // Top-left restart (always available)
  const { x: tx, y: ty, w: tw, h: th } = RESTART_TOP_BTN;
  if (mouse.screenX >= tx && mouse.screenX <= tx + tw &&
      mouse.screenY >= ty && mouse.screenY <= ty + th) {
    restart(); return;
  }
  // Center overlay restart (only when gameOver)
  if (gameState === 'won') {
    const { x: gx, y: gy, w: gw, h: gh } = RESTART_BTN;
    if (mouse.screenX >= gx && mouse.screenX <= gx + gw &&
        mouse.screenY >= gy && mouse.screenY <= gy + gh) {
      restart();
    }
  }
}

let gameState = 'playing';  // 'playing' | 'won'
let winner    = null;       // 'BLUE' | 'RED' | null
let scores           = { BLUE: 0, RED: 0 };
let scoreAnimBlue    = 0;
let scoreAnimRed     = 0;
let goalFreezeTimer  = 0;
let playerRespawnTimer = 0;
let damageNumbers = [];
let enemyRoleTimer = 0;
let cachedAttacker = null, cachedGoalkeeper = null, cachedSupport = null;
let frameCount = 0;

function restart() {
  gameState = 'playing'; winner = null;
  scores = { BLUE: 0, RED: 0 };
  scoreAnimBlue = 0; scoreAnimRed = 0;
  goalFreezeTimer = 0; playerRespawnTimer = 0;
  damageNumbers = []; frameCount = 0;
  initTraining();
}

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
    e.swingPhase    = 'idle';
    e.swingFrame    = 0;
    e.swingCooldown = 0;
    e.hitThisSwing  = false;
    e.idleTimer     = 0;
      // Reset rubber-band bat angles to face ball from spawn
      const spawnAngle = Math.atan2(trainingBall.y - e.startY, trainingBall.x - e.startX);
      e.restAngle     = spawnAngle;
      e.visualAngle   = spawnAngle;
      e.angle         = spawnAngle;
      e.swingVelocity = 0;
      e.targetAngle   = spawnAngle;
      const seg0 = _getEnemyBatSegment(e, spawnAngle);
      e.prevBatBase = { x: seg0.bx, y: seg0.by };
      e.prevBatTip  = { x: seg0.tx, y: seg0.ty };
  }
  if (!player.alive) {
    player.x = WW * 0.28; player.y = mapCY;
    player.vx = 0; player.vy = 0;
    player.hp = PLAYER_HP;
    player.alive = true;
    player.invulnTimer = 1.0;
    playerRespawnTimer = 0;
  }
  enemyRoleTimer = 0;
  cachedAttacker = null; cachedGoalkeeper = null; cachedSupport = null;
}

// ── initTraining ─────────────────────────────────
function initTraining() {
  enemyRoleTimer = 0;
  cachedAttacker = null; cachedGoalkeeper = null; cachedSupport = null;
  calcTrainingBounds();
  const mapCY = (TRN_T + TRN_B) / 2;

  trainingBall.x = WW / 2;
  trainingBall.y = mapCY - 150;
  trainingBall.vx = 0; trainingBall.vy = 0;
  trainingBall.speed = 0; trainingBall.stopped = true;
  trainingBall.trail = []; trainingBall.squash = 1;

  bat.hitThisSwing = false;
  bat.hitCooldown  = 0.5;
  bat._initFrames  = 30;

  momentumDisplay  = 0;
  bounceParticles  = [];
  impactFlashes    = [];
  shakeTimer       = 0;
  spawnAllEnemies(mapCY);
  damageNumbers    = [];

  player.x = WW / 2;
  player.y = mapCY + 150;
  player.vx = 0; player.vy = 0;
  player.hp = PLAYER_HP; player.maxHp = PLAYER_HP;
  player.alive = true; player.flashTimer = 0;
  player.rolling = false; player.rollCooldown = 0;
  player.ghosts  = [];

  bat.prevAngle = Math.PI / 2;
  const initSeg = _getBatSegment(bat.prevAngle);
  bat.prevBase = { x: initSeg.bx, y: initSeg.by };
  bat.prevTip  = { x: initSeg.tx, y: initSeg.ty };
}

// ── CCD bat-ball collision ───────────────────────
function _updateBatBallCCD(dt) {
  if (bat.hitCooldown > 0) bat.hitCooldown -= dt;

  const mouseAngle = player.angle; // computed in _updatePlayer each frame

  // ── Phase: idle — rubber-band follows mouse ──
  if (bat.swingPhase === 'idle') {
    bat.restAngle   = lerpAngle(bat.restAngle,   mouseAngle,    BAT_REST_LERP);
    bat.visualAngle = lerpAngle(bat.visualAngle, bat.restAngle, BAT_VISUAL_LERP);

    // Trigger snap on click
    if (mouse.justDown && !player.rolling) {
      const angDist = normalizeAngle(mouseAngle - bat.visualAngle);
      // Minimum velocity so bat always sweeps even when already aimed at ball.
      // Without this, angDist≈0 → velocity≈0 → snap ends before CCD fires.
      const swingDir = angDist !== 0 ? Math.sign(angDist) : 1;
      bat.swingVelocity = swingDir * Math.max(Math.abs(angDist * BAT_SWING_POWER), BAT_SWING_POWER * 0.5);
      bat.targetAngle   = mouseAngle;
      bat.swingPhase    = 'snap';
      bat.swingFrame    = 0;
      bat.hitThisSwing  = false;
    }

  } else if (bat.swingPhase === 'snap') {
    bat.swingFrame++;
    bat.visualAngle   += bat.swingVelocity * dt;
    bat.swingVelocity *= Math.pow(BAT_SWING_DECAY, dt * 60);

    // Transition to return on overshoot or velocity decay
    const overshoot = normalizeAngle(bat.visualAngle - bat.targetAngle);
    if (Math.abs(overshoot) > BAT_OVERSHOOT_DEG * Math.PI / 180 ||
        Math.abs(bat.swingVelocity) < 0.3) {
      bat.swingPhase = 'return';
    }

  } else { // 'return'
    bat.restAngle   = lerpAngle(bat.restAngle,   mouseAngle,    BAT_REST_LERP);
    bat.visualAngle = lerpAngle(bat.visualAngle, bat.restAngle, BAT_RETURN_LERP);
    bat.visualScaleX = lerp(bat.visualScaleX, 1.0, 0.2);
    bat.visualScaleY = lerp(bat.visualScaleY, 1.0, 0.2);

    if (Math.abs(normalizeAngle(bat.visualAngle - bat.restAngle)) < 0.05) {
      bat.swingPhase   = 'idle';
      bat.hitThisSwing = false; // allow next swing
    }
  }

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

  // ── CCD — active during snap frames 1–10 ──
  const ccdActive = (bat.swingPhase === 'snap') &&
                    (bat.swingFrame >= 1) && (bat.swingFrame <= 10);

  const currSeg  = _getBatSegment(bat.visualAngle);
  const currBase = { x: currSeg.bx, y: currSeg.by };
  const currTip  = { x: currSeg.tx, y: currSeg.ty };

  if (!bat.hitThisSwing && bat.hitCooldown <= 0 && !player.rolling && ccdActive) {
    const bx = trainingBall.x, by = trainingBall.y;
    const hitRadius = trainingBall.radius + bat.width;
    let contactPoint = null;

    // Test 1: current bat position
    const currTest = segmentCircleTest(currBase.x, currBase.y, currTip.x, currTip.y, bx, by, hitRadius);
    if (currTest.hit) contactPoint = currTest.closest;

    // Test 2-4: CCD sweep (only if ball is reachable)
    if (!contactPoint) {
      const ballPlayerDist = Math.hypot(bx - player.x, by - player.y);
      const maxCCDDist = (player.radius + 10 + bat.length) * 2;
      if (ballPlayerDist <= maxCCDDist) {
        const pb = bat.prevBase, pt = bat.prevTip;

        const e1 = segmentCircleTest(pb.x, pb.y, currBase.x, currBase.y, bx, by, hitRadius);
        if (e1.hit) contactPoint = e1.closest;

        if (!contactPoint) {
          const e2 = segmentCircleTest(pt.x, pt.y, currTip.x, currTip.y, bx, by, hitRadius);
          if (e2.hit) contactPoint = e2.closest;
        }
        if (!contactPoint) {
          const e3 = segmentCircleTest(pb.x, pb.y, pt.x, pt.y, bx, by, hitRadius);
          if (e3.hit) contactPoint = e3.closest;
        }
        // Point-in-swept-quad
        if (!contactPoint) {
          const qx = [pb.x, pt.x, currTip.x, currBase.x];
          const qy = [pb.y, pt.y, currTip.y, currBase.y];
          let inside = true;
          for (let i = 0; i < 4; i++) {
            const j = (i + 1) % 4;
            if ((qx[j]-qx[i])*(by-qy[i]) - (qy[j]-qy[i])*(bx-qx[i]) < 0) { inside=false; break; }
          }
          if (!inside) {
            inside = true;
            for (let i = 0; i < 4; i++) {
              const j = (i + 1) % 4;
              if ((qx[j]-qx[i])*(by-qy[i]) - (qy[j]-qy[i])*(bx-qx[i]) > 0) { inside=false; break; }
            }
          }
          if (inside) {
            const midBase = { x: (pb.x+currBase.x)/2, y: (pb.y+currBase.y)/2 };
            const midTip  = { x: (pt.x+currTip.x)/2,  y: (pt.y+currTip.y)/2  };
            contactPoint = closestPointOnSegment(bx, by, midBase.x, midBase.y, midTip.x, midTip.y);
          }
        }
      }
    }

    if (contactPoint) {
      let hitDx = bx - contactPoint.x;
      let hitDy = by - contactPoint.y;
      const hitLen = Math.hypot(hitDx, hitDy);
      if (hitLen > 0.01) { hitDx /= hitLen; hitDy /= hitLen; }
      else { hitDx = Math.cos(bat.visualAngle); hitDy = Math.sin(bat.visualAngle); }

      // Clamp hit direction: no more than 90° from bat outward
      const outAngle = bat.visualAngle;
      const hitAngle = Math.atan2(hitDy, hitDx);
      const angleDiff = normalizeAngle(hitAngle - outAngle);
      if (Math.abs(angleDiff) > Math.PI / 2) {
        const clampedAngle = outAngle + Math.sign(angleDiff) * Math.PI / 2;
        hitDx = Math.cos(clampedAngle);
        hitDy = Math.sin(clampedAngle);
      }

      // Launch speed from swing velocity (rad/s * px = px/s tangential speed)
      const pivotDist = Math.hypot(contactPoint.x - player.x, contactPoint.y - player.y);
      const swingSpeed     = Math.abs(bat.swingVelocity) * pivotDist;
      const effectiveSpeed = Math.max(swingSpeed, 120);

      // Dampen 40% if bat has genuinely overshot its target (past BAT_OVERSHOOT_DEG boundary)
      const batOvershoot = Math.abs(normalizeAngle(bat.visualAngle - bat.targetAngle));
      const overshootMult = batOvershoot > BAT_OVERSHOOT_DEG * Math.PI / 180 ? 0.6 : 1.0;
      trainingBall.vx = hitDx * effectiveSpeed * BAT_POWER_MULT * overshootMult;
      trainingBall.vy = hitDy * effectiveSpeed * BAT_POWER_MULT * overshootMult;
      const launchSpeed = Math.hypot(trainingBall.vx, trainingBall.vy);
      if (launchSpeed > MAX_BALL_SPEED) {
        trainingBall.vx *= MAX_BALL_SPEED / launchSpeed;
        trainingBall.vy *= MAX_BALL_SPEED / launchSpeed;
      }
      trainingBall.stopped = false;
      trainingBall.speed = Math.hypot(trainingBall.vx, trainingBall.vy);

      bat.hitThisSwing = true;
      bat.squashTimer = 4; // 4 frames of squash on impact
      bat.hitCooldown  = 0.2;
      trainingBall.x = contactPoint.x + hitDx * (trainingBall.radius + bat.width + 2);
      trainingBall.y = contactPoint.y + hitDy * (trainingBall.radius + bat.width + 2);

      if (trainingBall.speed > 100) {
        shakeTimer = 0.15;
        shakeIntensity = Math.min(trainingBall.speed * 0.008, 8);
      }
      if (trainingBall.speed > 80) {
        for (let i = 0; i < 6; i++) {
          const a = Math.random() * Math.PI * 2;
          const spd = 60 + Math.random() * 120;
          bounceParticles.push({
            x: contactPoint.x, y: contactPoint.y,
            vx: Math.cos(a)*spd, vy: Math.sin(a)*spd,
            life: 0.3 + Math.random()*0.2, maxLife: 0.3 + Math.random()*0.2,
            radius: 3 + Math.random()*5,
          });
        }
        impactFlashes.push({ x: contactPoint.x, y: contactPoint.y, radius: 5, maxRadius: 35, alpha: 0.5 });
      }
      trainingBall.squash = 0.7;
      trainingBall.squashTimer = 0.13;
      trainingBall.squashAngle = Math.atan2(hitDy, hitDx);
    }
  }

  // Track previous visual angles for motion blur (max 3)
  bat.prevVisualAngles.unshift(bat.visualAngle);
  if (bat.prevVisualAngles.length > 2) bat.prevVisualAngles.pop();

  // Store for next frame's CCD
  bat.prevBase  = { x: currBase.x, y: currBase.y };
  bat.prevTip   = { x: currTip.x,  y: currTip.y  };
  bat.prevAngle = bat.visualAngle;
}

// ── Ball physics ─────────────────────────────────
function _updateBallPhysics(dt) {
  if (!trainingBall.stopped) {
    trainingBall.x += trainingBall.vx * dt;
    trainingBall.y += trainingBall.vy * dt;

    trainingBall.vx *= Math.pow(0.985, dt * 60);
    trainingBall.vy *= Math.pow(0.985, dt * 60);

    trainingBall.speed = Math.hypot(trainingBall.vx, trainingBall.vy);

    if (trainingBall.speed > 1000) {
      const scale = 1000 / trainingBall.speed;
      trainingBall.vx *= scale;
      trainingBall.vy *= scale;
      trainingBall.speed = 1000;
    }

    // Minimum speed floor — ball never fully stops once in motion
    if (trainingBall.speed > 0 && trainingBall.speed < MIN_BALL_SPEED) {
      const ratio = MIN_BALL_SPEED / trainingBall.speed;
      trainingBall.vx *= ratio;
      trainingBall.vy *= ratio;
      trainingBall.speed = MIN_BALL_SPEED;
    }

    // Bounce off outer walls
    const wallRest = 0.8;
    if (trainingBall.x - trainingBall.radius < TRN_L) {
      trainingBall.x = TRN_L + trainingBall.radius;
      trainingBall.vx = Math.abs(trainingBall.vx) * wallRest;
      trainingBall.squash = 0.7; trainingBall.squashTimer = 0.13; trainingBall.squashAngle = 0;
      const s = Math.abs(trainingBall.vx);
      if (s > 60) impactFlashes.push({ x: trainingBall.x, y: trainingBall.y, radius: 8, maxRadius: 25, alpha: 0.5 });
      if (s > 100) { shakeTimer = 0.1; shakeIntensity = 3; }
    }
    if (trainingBall.x + trainingBall.radius > TRN_R) {
      trainingBall.x = TRN_R - trainingBall.radius;
      trainingBall.vx = -Math.abs(trainingBall.vx) * wallRest;
      trainingBall.squash = 0.7; trainingBall.squashTimer = 0.13; trainingBall.squashAngle = 0;
      const s = Math.abs(trainingBall.vx);
      if (s > 60) impactFlashes.push({ x: trainingBall.x, y: trainingBall.y, radius: 8, maxRadius: 25, alpha: 0.5 });
      if (s > 100) { shakeTimer = 0.1; shakeIntensity = 3; }
    }
    if (trainingBall.y - trainingBall.radius < TRN_T) {
      trainingBall.y = TRN_T + trainingBall.radius;
      trainingBall.vy = Math.abs(trainingBall.vy) * wallRest;
      trainingBall.squash = 0.7; trainingBall.squashTimer = 0.13; trainingBall.squashAngle = Math.PI / 2;
      const s = Math.abs(trainingBall.vy);
      if (s > 60) impactFlashes.push({ x: trainingBall.x, y: trainingBall.y, radius: 8, maxRadius: 25, alpha: 0.5 });
      if (s > 100) { shakeTimer = 0.1; shakeIntensity = 3; }
    }
    if (trainingBall.y + trainingBall.radius > TRN_B) {
      trainingBall.y = TRN_B - trainingBall.radius;
      trainingBall.vy = -Math.abs(trainingBall.vy) * wallRest;
      trainingBall.squash = 0.7; trainingBall.squashTimer = 0.13; trainingBall.squashAngle = Math.PI / 2;
      const s = Math.abs(trainingBall.vy);
      if (s > 60) impactFlashes.push({ x: trainingBall.x, y: trainingBall.y, radius: 8, maxRadius: 25, alpha: 0.5 });
      if (s > 100) { shakeTimer = 0.1; shakeIntensity = 3; }
    }

    for (const rect of TRN_RECTS) {
      bounceBallOffRect(trainingBall, rect);
    }

    if (trainingBall.speed > 180) {
      trainingBall.trail.push({ x: trainingBall.x, y: trainingBall.y, alpha: 0.6 });
      if (trainingBall.trail.length > 5) trainingBall.trail.shift();
    }
  }

  // Fade trail
  for (let i = trainingBall.trail.length - 1; i >= 0; i--) {
    trainingBall.trail[i].alpha -= dt * 3;
    if (trainingBall.trail[i].alpha <= 0) trainingBall.trail.splice(i, 1);
  }

  // Squash recovery
  if (trainingBall.squashTimer > 0) {
    trainingBall.squashTimer -= dt;
    const t = 1 - trainingBall.squashTimer / 0.13;
    trainingBall.squash = 0.7 + 0.3 * t + 0.08 * Math.sin(t * Math.PI * 2) * (1 - t);
  } else {
    trainingBall.squash = 1;
  }

  // Goal detection
  if (goalFreezeTimer <= 0 && !trainingBall.stopped) {
    function ballInGate(gate) {
      return trainingBall.x > gate.x && trainingBall.x < gate.x + gate.w &&
             trainingBall.y > gate.y && trainingBall.y < gate.y + gate.h;
    }
    if (ballInGate(GATE_LEFT))  triggerGoal('RED');
    if (ballInGate(GATE_RIGHT)) triggerGoal('BLUE');
  }
}

// ── Player movement ──────────────────────────────
function _updatePlayer(dt) {
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

  player.angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);

  if (player.rolling) {
    player.rollTimer -= dt;
    const rollFrac = 1 - player.rollTimer / player.rollDuration;
    const vel = player.rollSpeed * (1 - rollFrac * rollFrac);
    player.vx = player.rollDx * vel;
    player.vy = player.rollDy * vel;
    if (player.rollTimer <= 0) player.rolling = false;
  } else {
    let dx = 0, dy = 0;
    if (keys['KeyW'] || keys['ArrowUp']) dy -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) dy += 1;
    if (keys['KeyA'] || keys['ArrowLeft']) dx -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) dx += 1;
    if (dx && dy) { dx *= 0.707; dy *= 0.707; }
    player.vx += dx * player.speed * dt * 13;
    player.vy += dy * player.speed * dt * 13;
    player.vx *= Math.pow(player.friction, dt * 60);
    player.vy *= Math.pow(player.friction, dt * 60);
  }

  if (player.rollCooldown > 0) player.rollCooldown = Math.max(0, player.rollCooldown - dt);
  player.x += player.vx * dt;
  player.y += player.vy * dt;
  player.x = clamp(player.x, TRN_L + player.radius, TRN_R - player.radius);
  player.y = clamp(player.y, TRN_T + player.radius, TRN_B - player.radius);
  pushOutOfTrainingRects(player);

  // Ghost trail for rolling
  if (player.rolling) {
    if (player.ghosts.length === 0 ||
      dist(player.x, player.y, player.ghosts[player.ghosts.length - 1].x, player.ghosts[player.ghosts.length - 1].y) > 14) {
      player.ghosts.push({ x: player.x, y: player.y, alpha: 0.5 });
    }
  }
  for (let i = player.ghosts.length - 1; i >= 0; i--) {
    player.ghosts[i].alpha -= dt * 2;
    if (player.ghosts[i].alpha <= 0) player.ghosts.splice(i, 1);
  }
}

// ── Enemy AI + ball damage ───────────────────────
function _updateEnemies(dt) {
  _resolveEntitySeparation();

  // ── Ball damage ──
  applyBallDamage(player);
  for (const e of trnEnemies) {
    if (e.swingPhase !== 'snap' && e.splatTimer < 0) applyBallDamage(e);
  }

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

  for (const enemy of trnEnemies) {
    if (enemy.flashTimer > 0) enemy.flashTimer -= dt;
    if (enemy.splatTimer >= 0) {
      enemy.splatTimer += dt;
      continue;
    }

    const edx = bx - enemy.x, edy = by - enemy.y;
    const ed  = Math.hypot(edx, edy);

    // ── Determine ideal bat angle for this role ──
    let idealAngle;
    if (enemy === attacker) {
      // Aim swing toward GATE_LEFT (enemy goal = BLUE's net)
      idealAngle = Math.atan2(
        GATE_LEFT.y + GATE_LEFT.h / 2 - enemy.y,
        GATE_LEFT.x + GATE_LEFT.w / 2 - enemy.x
      );
    } else {
      // Goalkeeper and support: face ball
      idealAngle = Math.atan2(edy, edx);
    }

    // ── Rubber-band bat update ──
    if (enemy.swingPhase === 'idle') {
      enemy.restAngle   = lerpAngle(enemy.restAngle,   idealAngle,        BAT_REST_LERP);
      enemy.visualAngle = lerpAngle(enemy.visualAngle, enemy.restAngle,   BAT_VISUAL_LERP);

      // Trigger snap when visual has caught up AND ball in range AND cooldown done
      const angleLag  = Math.abs(normalizeAngle(enemy.restAngle - enemy.visualAngle));
      const inRange   = ed < (enemy === attacker ? 100 : 150);
      // Don't swing if ball is already heading toward enemy goal (GATE_RIGHT)
      const ballDir = Math.atan2(trainingBall.vy, trainingBall.vx);
      const toEnemyGoal = Math.atan2(
        GATE_RIGHT.y + GATE_RIGHT.h / 2 - by,
        GATE_RIGHT.x + GATE_RIGHT.w / 2 - bx
      );
      const headingToGoal = trainingBall.speed > 500 &&
        Math.abs(normalizeAngle(ballDir - toEnemyGoal)) < Math.PI / 3;
      if (!headingToGoal && inRange && enemy.swingCooldown <= 0 &&
          !enemy.hitThisSwing && angleLag < 45 * Math.PI / 180) {
        const angDist   = normalizeAngle(idealAngle - enemy.visualAngle);
        const eSwingDir = angDist !== 0 ? Math.sign(angDist) : 1;
        enemy.swingVelocity = eSwingDir * Math.max(Math.abs(angDist * ENEMY_BAT_SWING_POWER), ENEMY_BAT_SWING_POWER * 0.5);
        enemy.targetAngle  = idealAngle;
        enemy.swingPhase   = 'snap';
        enemy.swingFrame   = 0;
        enemy.hitThisSwing = false;
        const seg0 = _getEnemyBatSegment(enemy, enemy.visualAngle);
        enemy.prevBatBase = { x: seg0.bx, y: seg0.by };
        enemy.prevBatTip  = { x: seg0.tx, y: seg0.ty };
      }

    } else if (enemy.swingPhase === 'snap') {
      enemy.swingFrame++;
      enemy.visualAngle    += enemy.swingVelocity * dt;
      enemy.swingVelocity  *= Math.pow(BAT_SWING_DECAY, dt * 60);

      const overshoot = normalizeAngle(enemy.visualAngle - enemy.targetAngle);
      if (Math.abs(overshoot) > ENEMY_BAT_OVERSHOOT_DEG * Math.PI / 180 ||
          Math.abs(enemy.swingVelocity) < 0.3 ||
          enemy.swingFrame > MAX_SWING_FRAMES) {      // safety timeout
        enemy.swingPhase   = 'return';
        enemy.swingCooldown = 1.2 + Math.random() * 0.6;
      }

    } else { // 'return'
      enemy.restAngle   = lerpAngle(enemy.restAngle,   idealAngle,      BAT_REST_LERP);
      enemy.visualAngle = lerpAngle(enemy.visualAngle, enemy.restAngle, BAT_RETURN_LERP);
      if (Math.abs(normalizeAngle(enemy.visualAngle - enemy.restAngle)) < 0.05) {
        enemy.swingPhase   = 'idle';
        enemy.hitThisSwing = false;
      }
    }

    // ── CCD during snap frames 1–10 ──
    const ccdActive = enemy.swingPhase === 'snap' &&
                      enemy.swingFrame >= 1 && enemy.swingFrame <= 10;
    if (ccdActive && !enemy.hitThisSwing) {
      const currSeg = _getEnemyBatSegment(enemy, enemy.visualAngle);
      const hb = trainingBall.x, hy = trainingBall.y;
      const hitRadius = trainingBall.radius + ENEMY_BAT_WIDTH;
      let contactPoint = null;

      const ct = segmentCircleTest(currSeg.bx, currSeg.by, currSeg.tx, currSeg.ty, hb, hy, hitRadius);
      if (ct.hit) contactPoint = ct.closest;
      if (!contactPoint) {
        const e1 = segmentCircleTest(enemy.prevBatBase.x, enemy.prevBatBase.y, currSeg.bx, currSeg.by, hb, hy, hitRadius);
        if (e1.hit) contactPoint = e1.closest;
      }
      if (!contactPoint) {
        const e2 = segmentCircleTest(enemy.prevBatTip.x, enemy.prevBatTip.y, currSeg.tx, currSeg.ty, hb, hy, hitRadius);
        if (e2.hit) contactPoint = e2.closest;
      }
      if (contactPoint) {
        let hitDx = hb - contactPoint.x, hitDy = hy - contactPoint.y;
        const hitLen = Math.hypot(hitDx, hitDy);
        if (hitLen > 0.01) { hitDx /= hitLen; hitDy /= hitLen; }
        else { hitDx = Math.cos(enemy.visualAngle); hitDy = Math.sin(enemy.visualAngle); }

        const swingSpeed = Math.abs(enemy.swingVelocity) *
          Math.hypot(contactPoint.x - enemy.x, contactPoint.y - enemy.y);
        const effectiveSpeed = Math.max(swingSpeed, 200);

        trainingBall.vx = hitDx * effectiveSpeed;
        trainingBall.vy = hitDy * effectiveSpeed;
        trainingBall.stopped = false;
        trainingBall.speed = Math.hypot(trainingBall.vx, trainingBall.vy);
        trainingBall.squash = 0.75; trainingBall.squashTimer = 0.13;
        trainingBall.squashAngle = Math.atan2(hitDy, hitDx);
        trainingBall.x = contactPoint.x + hitDx * (trainingBall.radius + ENEMY_BAT_WIDTH + 2);
        trainingBall.y = contactPoint.y + hitDy * (trainingBall.radius + ENEMY_BAT_WIDTH + 2);
        enemy.hitThisSwing = true;
      }

      enemy.prevBatBase = { x: currSeg.bx, y: currSeg.by };
      enemy.prevBatTip  = { x: currSeg.tx, y: currSeg.ty };
    }

    // Body faces bat direction
    enemy.angle = enemy.visualAngle;

    // ── Role-based movement ──
    const isSwinging = enemy.swingPhase === 'snap';
    if (isSwinging) {
      // Fix C: slow drift toward ball during snap instead of full stop
      if (ed > 0.1) {
        enemy.vx = lerp(enemy.vx, (edx / ed) * ENEMY_SPEED * 0.2, 0.2);
        enemy.vy = lerp(enemy.vy, (edy / ed) * ENEMY_SPEED * 0.2, 0.2);
      } else {
        enemy.vx = lerp(enemy.vx, 0, 0.2);
        enemy.vy = lerp(enemy.vy, 0, 0.2);
      }

    } else if (enemy === attacker) {
      if (enemy.hitThisSwing && enemy.swingCooldown > 0.8) {
        // Back off after swing — steer away from ball
        if (ed > 0.1) {
          const awayX = -(edx / ed), awayY = -(edy / ed);
          enemy.vx = lerp(enemy.vx, awayX * ENEMY_SPEED * 0.4, 0.15);
          enemy.vy = lerp(enemy.vy, awayY * ENEMY_SPEED * 0.4, 0.15);
        }
      } else {
        // Approach from behind ball (opposite side of GATE_LEFT = player's goal).
        // This ensures the bat swings toward the goal rather than away from it.
        const gateCx = GATE_LEFT.x + GATE_LEFT.w / 2;
        const gateCy = GATE_LEFT.y + GATE_LEFT.h / 2;
        const [awx, awy] = safeNormalize(bx - gateCx, by - gateCy);
        const approachDist = enemy.radius + trainingBall.radius + 30;
        const approachX = clamp(bx + awx * approachDist, TRN_L + enemy.radius, TRN_R - enemy.radius);
        const approachY = clamp(by + awy * approachDist, TRN_T + enemy.radius, TRN_B - enemy.radius);
        arrivalSteer(enemy, approachX, approachY, 80);
      }

    } else if (enemy === goalkeeper) {
      // Position between ball and GATE_RIGHT
      const gateCx = GATE_RIGHT.x + GATE_RIGHT.w / 2;
      const targetX = clamp(bx * 0.3 + gateCx * 0.7, TRN_R - 200, TRN_R - 120);
      const targetY = clamp(by, GATE_RIGHT.y - 60, GATE_RIGHT.y + GATE_RIGHT.h + 60);
      arrivalSteer(enemy, targetX, targetY, 60);

    } else if (enemy === support) {
      // Move toward predicted ball position (0.5s lookahead)
      const px = clamp(bx + trainingBall.vx * 0.5, TRN_L + 40, TRN_R - 40);
      const py = clamp(by + trainingBall.vy * 0.5, TRN_T + 40, TRN_B - 40);
      arrivalSteer(enemy, px, py, 60);

    } else {
      // No role — patrol toward ball slowly
      if (ed > 0.1) {
        enemy.vx = (edx / ed) * ENEMY_SPEED * 0.5;
        enemy.vy = (edy / ed) * ENEMY_SPEED * 0.5;
      }
    }

    // Anti-freeze patrol: if velocity near zero for > 0.5s, force toward ball
    if (Math.hypot(enemy.vx, enemy.vy) < 5) {
      enemy.idleTimer += dt;
      if (enemy.idleTimer > 0.5 && ed > 0.1) {
        enemy.vx = (edx / ed) * ENEMY_SPEED * 0.5;
        enemy.vy = (edy / ed) * ENEMY_SPEED * 0.5;
      }
    } else {
      enemy.idleTimer = 0;
    }

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

    // Wall repulsion
    const repulse = 180;
    if (enemy.x - TRN_L < 60) enemy.vx += repulse * dt;
    if (TRN_R - enemy.x < 60) enemy.vx -= repulse * dt;
    if (enemy.y - TRN_T < 60) enemy.vy += repulse * dt;
    if (TRN_B - enemy.y < 60) enemy.vy -= repulse * dt;
    for (const rect of TRN_RECTS) {
      const el = rect.x - 60, er = rect.x + rect.w + 60;
      const et = rect.y - 60, eb = rect.y + rect.h + 60;
      if (enemy.x > el && enemy.x < er && enemy.y > et && enemy.y < eb) {
        const dl = enemy.x - el, dr = er - enemy.x;
        const dt2 = enemy.y - et, db2 = eb - enemy.y;
        const minH = Math.min(dl, dr), minV = Math.min(dt2, db2);
        if (minH < minV) enemy.vx += (dl < dr ? -repulse : repulse) * dt;
        else             enemy.vy += (dt2 < db2 ? -repulse : repulse) * dt;
      }
    }



    // Friction + integrate
    enemy.vx *= Math.pow(0.85, dt * 60);
    enemy.vy *= Math.pow(0.85, dt * 60);
    enemy.x += enemy.vx * dt;
    enemy.y += enemy.vy * dt;
    enemy.x = clamp(enemy.x, TRN_L + enemy.radius, TRN_R - enemy.radius);
    enemy.y = clamp(enemy.y, TRN_T + enemy.radius, TRN_B - enemy.radius);
    pushOutOfTrainingRects(enemy);

    // Fix B: push enemy out of ball body (position correction only — no velocity change)
    if (!trainingBall.stopped) {
      const bdx = enemy.x - trainingBall.x;
      const bdy = enemy.y - trainingBall.y;
      const bd  = Math.hypot(bdx, bdy);
      const bMin = enemy.radius + trainingBall.radius;
      if (bd < bMin && bd > 0.001) {
        const overlap = bMin - bd;
        enemy.x += (bdx / bd) * overlap;
        enemy.y += (bdy / bd) * overlap;
        // Give ball a gentle push away from enemy (velocity only, not teleport)
        trainingBall.vx -= (bdx / bd) * overlap * 0.5;
        trainingBall.vy -= (bdy / bd) * overlap * 0.5;
      } else if (bd <= 0.001) {
        enemy.x += enemy.radius * 0.5; // exact coincidence: nudge enemy right
      }
    }

    if (enemy.swingCooldown > 0) enemy.swingCooldown -= dt;

    // Fix D: stuck detector — every 30 frames check movement; escape if stuck
    if (frameCount % 30 === 0) {
      enemy.lastCheckX = enemy.x;
      enemy.lastCheckY = enemy.y;
    }
    if (frameCount % 30 === 29) {
      const moved = Math.hypot(enemy.x - enemy.lastCheckX, enemy.y - enemy.lastCheckY);
      if (moved < 5 && ed > enemy.radius + trainingBall.radius + 5) {
        // Stuck but not actively pressing the ball — escape in random direction
        const escapeAngle = Math.random() * Math.PI * 2;
        enemy.x += Math.cos(escapeAngle) * 20;
        enemy.y += Math.sin(escapeAngle) * 20;
      }
    }
  }

  // Respawn dead enemies in-place
  for (const enemy of trnEnemies) {
    if (enemy.splatTimer >= 0.4) {
      enemy.splatTimer    = -1;
      enemy.x             = enemy.startX;
      enemy.y             = enemy.startY;
      enemy.vx            = 0; enemy.vy = 0;
      enemy.hp            = ENEMY_MAX_HP;
      enemy.swingPhase    = 'idle';
      enemy.swingFrame    = 0;
      enemy.swingCooldown = 0;
      enemy.hitThisSwing  = false;
      enemy.idleTimer     = 0;
      enemy.lastCheckX    = enemy.startX;
      enemy.lastCheckY    = enemy.startY;
      // Reset bat angles to face ball from spawn position
      const spawnAngle = Math.atan2(by - enemy.startY, bx - enemy.startX);
      enemy.restAngle   = spawnAngle;
      enemy.visualAngle = spawnAngle;
      enemy.angle       = spawnAngle;
      enemy.swingVelocity = 0;
      enemy.targetAngle   = spawnAngle;
      // Reset bat segment positions to avoid false CCD hit after teleport
      const seg0 = _getEnemyBatSegment(enemy, spawnAngle);
      enemy.prevBatBase = { x: seg0.bx, y: seg0.by };
      enemy.prevBatTip  = { x: seg0.tx, y: seg0.ty };
      // Invalidate cached role if this enemy held a role
      if (cachedAttacker === enemy)   cachedAttacker   = null;
      if (cachedGoalkeeper === enemy) cachedGoalkeeper = null;
      if (cachedSupport === enemy)    cachedSupport    = null;
      enemyRoleTimer = 0; // force immediate reassignment
    }
  }
}

// ── updateTraining ───────────────────────────────
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

  frameCount++;
  updateTrainingCamera();
  _updatePlayer(dt);
  _updateBatBallCCD(dt);
  _updateBallPhysics(dt);
  _updateEnemies(dt);
  _pushBallOutOfCharacters();

  // NaN watchdog: if ball position/velocity corrupted, reset ball to centre
  if (isNaN(trainingBall.x) || isNaN(trainingBall.y) ||
      isNaN(trainingBall.vx) || isNaN(trainingBall.vy)) {
    const mapCY = (TRN_T + TRN_B) / 2;
    trainingBall.x = WW / 2; trainingBall.y = mapCY;
    trainingBall.vx = 0; trainingBall.vy = 0;
    trainingBall.speed = 0; trainingBall.stopped = true;
  }

  checkRestartClick();

  // Bounce particles
  for (let i = bounceParticles.length - 1; i >= 0; i--) {
    const p = bounceParticles[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.94; p.vy *= 0.94;
    p.life -= dt;
    if (p.life <= 0) bounceParticles.splice(i, 1);
  }

  // Impact flashes
  for (let i = impactFlashes.length - 1; i >= 0; i--) {
    const f = impactFlashes[i];
    f.radius += (f.maxRadius - f.radius) * 0.3;
    f.alpha  -= dt * 4;
    if (f.alpha <= 0) impactFlashes.splice(i, 1);
  }

  if (shakeTimer > 0) shakeTimer -= dt;
  if (player.flashTimer  > 0) player.flashTimer  -= dt;
  if (player.invulnTimer > 0) player.invulnTimer = Math.max(0, player.invulnTimer - dt);

  // Momentum bar
  const actualMomentum = Math.min(trainingBall.speed / TRN_MAX_SPEED * 100, 100);
  momentumDisplay += (actualMomentum - momentumDisplay) * 0.1;
  if (Math.abs(momentumDisplay - actualMomentum) < 0.5) momentumDisplay = actualMomentum;

  // Damage numbers
  for (let i = damageNumbers.length - 1; i >= 0; i--) {
    const dn = damageNumbers[i];
    dn.y    -= 40 * dt;
    dn.life -= dt * 1.5;
    if (dn.life <= 0) damageNumbers.splice(i, 1);
  }
}

// ── Off-screen ball aura ─────────────────────────
function drawBallAura() {
  const bx = trainingBall.x, by = trainingBall.y;
  if (bx >= 0 && bx <= WW && by >= 0 && by <= WH) return;

  const angle = Math.atan2(by - WH / 2, bx - WW / 2);
  const margin = 28;
  const tx = clamp(WW / 2 + Math.cos(angle) * WW, margin, WW - margin);
  const ty = clamp(WH / 2 + Math.sin(angle) * WH, margin, WH - margin);

  const pulse = 0.65 + 0.35 * Math.sin(performance.now() / 200);
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.shadowColor = '#F39C12';
  ctx.shadowBlur  = 18;
  ctx.fillStyle   = '#F39C12';
  ctx.beginPath(); ctx.arc(tx, ty, 10, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}

// ── Off-screen enemy auras ───────────────────────
function drawEnemyAuras() {
  const margin = 20;
  for (const enemy of trnEnemies) {
    if (enemy.splatTimer >= 0) continue;
    if (enemy.x >= 0 && enemy.x <= WW && enemy.y >= 0 && enemy.y <= WH) continue;
    const angle = Math.atan2(enemy.y - WH / 2, enemy.x - WW / 2);
    const tx = clamp(WW / 2 + Math.cos(angle) * WW, margin, WW - margin);
    const ty = clamp(WH / 2 + Math.sin(angle) * WH, margin, WH - margin);
    const pulse = 0.5 + 0.3 * Math.sin(performance.now() / 300);
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.shadowColor = enemy.color;
    ctx.shadowBlur  = 14;
    ctx.fillStyle   = enemy.color;
    ctx.beginPath(); ctx.arc(tx, ty, 7, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

// ── Training HUD (screen-space) ──────────────────
function drawTrainingHUD() {
  // ── ↺ RESTART button (top-left) ──
  ctx.save();
  ctx.globalAlpha = 0.2; ctx.fillStyle = 'rgba(80,40,20,0.5)';
  ctx.beginPath(); ctx.roundRect(22, 23, 90, 30, 10); ctx.fill();
  ctx.globalAlpha = 1;
  const rstGrad = ctx.createLinearGradient(20, 20, 20, 50);
  rstGrad.addColorStop(0, CLAY.coverHi); rstGrad.addColorStop(1, CLAY.cover);
  ctx.fillStyle = rstGrad;
  ctx.beginPath(); ctx.roundRect(20, 20, 90, 30, 10); ctx.fill();
  ctx.strokeStyle = CLAY.coverStroke; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(20, 20, 90, 30, 10); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 13px Segoe UI,sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('↺ RESTART', 65, 40);
  ctx.restore();

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

    drawScoreBox(startX,              startY, boxW, boxH, '#3498DB', 'BLUE', scores.BLUE, scoreAnimBlue);
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

  // ── Momentum bar (clay styled) ──
  const barW = 300, barH = 28;
  const barX = (WW - barW) / 2;
  const barY = WH - 65;
  const pct = momentumDisplay / 100;

  // Label
  ctx.save();
  ctx.fillStyle = 'rgba(220,200,170,0.7)';
  ctx.font = 'bold 12px Segoe UI,sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('MOMENTUM', WW / 2, barY - 6);
  ctx.restore();

  // Track background
  ctx.save();
  ctx.fillStyle = '#2C3E50';
  ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, barH / 2); ctx.fill();
  // Inner shadow
  ctx.save();
  ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, barH / 2); ctx.clip();
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH / 2, [barH / 2, barH / 2, 0, 0]); ctx.fill();
  ctx.restore();
  // Border
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, barH / 2); ctx.stroke();

  // Fill
  if (pct > 0.01) {
    const fillW = Math.max(barH, barW * pct);
    const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    grad.addColorStop(0, '#3498DB');
    grad.addColorStop(0.5, '#F39C12');
    grad.addColorStop(1, '#E74C3C');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.roundRect(barX, barY, fillW, barH, barH / 2); ctx.fill();
    // Glossy highlight
    ctx.save();
    ctx.beginPath(); ctx.roundRect(barX, barY, fillW, barH, barH / 2); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.roundRect(barX + 4, barY + 2, fillW - 8, barH / 2 - 2, barH / 4); ctx.fill();
    ctx.restore();
  }

  // Pulsing glow at max momentum
  if (momentumDisplay > 95) {
    const glowAlpha = 0.15 + 0.15 * Math.sin(performance.now() / 200);
    ctx.save();
    ctx.shadowColor = '#E74C3C';
    ctx.shadowBlur = 20;
    ctx.globalAlpha = glowAlpha;
    ctx.strokeStyle = '#E74C3C'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(barX - 2, barY - 2, barW + 4, barH + 4, barH / 2 + 2); ctx.stroke();
    ctx.restore();
  }

  ctx.restore();

  // Controls hint
  ctx.save();
  ctx.fillStyle = 'rgba(200,160,100,0.45)';
  ctx.font = '11px Segoe UI,sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('WASD: Move  |  Swing Bat Into Ball  |  Space: Roll', WW / 2, WH - 20);
  ctx.restore();

  // ── Off-screen auras (new) ──
  drawBallAura();
  drawEnemyAuras();

  // ── Floating damage numbers (new) ──
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

  // ── Player HP bar (new) ──
  {
    const barW = 180, barH = 18;
    const barX = 20, barY = WH - 50;
    ctx.save();
    ctx.fillStyle = 'rgba(220,200,170,0.7)';
    ctx.font = 'bold 11px Segoe UI,sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('HP', barX, barY - 4);
    ctx.fillStyle = '#2C3E50';
    ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, barH / 2); ctx.fill();
    const hpPct = player.hp / player.maxHp;
    const hpCol = hpPct > 0.5 ? '#2ECC71' : hpPct > 0.25 ? '#F39C12' : '#E74C3C';
    if (hpPct > 0.01) {
      ctx.fillStyle = hpCol;
      ctx.beginPath(); ctx.roundRect(barX, barY, Math.max(barH, barW * hpPct), barH, barH / 2); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.roundRect(barX, barY, Math.max(barH, barW * hpPct), barH, barH / 2); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      const hlW = barW * hpPct - 6;
      if (hlW > 0) { ctx.beginPath(); ctx.roundRect(barX + 3, barY + 2, hlW, barH / 2 - 2, barH / 4); ctx.fill(); }
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, barH / 2); ctx.stroke();
    ctx.restore();
  }

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
}

// ── Game loop ────────────────────────────────────
let lastTs = 0;
let loopStarted = false;

function gameLoop(ts) {
  const dt = Math.min((ts - lastTs) / 1000, 0.05);
  lastTs = ts;

  updateTraining(dt);

  ctx.clearRect(0, 0, WW, WH);

  // World-space draw (camera transform)
  ctx.save();
  ctx.translate(WW / 2, WH / 2);
  ctx.scale(trnCam.zoom, trnCam.zoom);
  ctx.translate(-trnCam.x, -trnCam.y);
  drawTraining();
  ctx.restore();

  // Screen-space draw
  drawTrainingHUD();

  mouse.justDown = false;
  mouse.justUp   = false;

  requestAnimationFrame(gameLoop);
}

// ── Title screen PLAY handler ────────────────────
document.getElementById('playBtn').addEventListener('click', () => {
  document.getElementById('titleScreen').style.display = 'none';
  if (!loopStarted) {
    loopStarted = true;
    initTraining();
    if (typeof makeFloor === 'function') makeFloor();
    lastTs = performance.now();
    requestAnimationFrame(gameLoop);
  }
});
