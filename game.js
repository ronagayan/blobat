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
const ENEMY_DODGE_SPEED  = 200;
const ENEMY_BAT_LENGTH   = 48;
const ENEMY_BAT_WIDTH    = 14;
const TRN_WALL           = 40;
const TRN_MAX_SPEED      = 800;    // ball speed = 100% momentum
const TRN_DEBUG          = false;
const GOALS_TO_WIN         = 5;
const GOAL_FREEZE_DURATION = 1.0;   // seconds
const ENEMY_COUNT          = 3;

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

  // Push ball out of entity
  const nx = (trainingBall.x - entity.x) / d;
  const ny = (trainingBall.y - entity.y) / d;
  const overlap = (trainingBall.radius + entity.radius) - d;
  trainingBall.x += nx * (overlap + 2);
  trainingBall.y += ny * (overlap + 2);

  // Trigger game over for player when hp bottoms out
  if (entity === player && entity.hp < 0.5) {
    entity.hp = 0;
    gameState = 'won'; winner = 'RED';
  }

  // Trigger splat for dead enemies
  if (entity !== player && entity.hp < 0.5 && entity.splatTimer < 0) {
    entity.hp = 0;
    entity.splatTimer = 0;
  }

  return true;
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

function trnSpawnEnemy() {
  if (trnEnemies.length >= ENEMY_MAX_COUNT) return;
  let ex, ey;
  let best = null, bestDist = -1;
  for (let attempt = 0; attempt < 10; attempt++) {
    const θ = Math.random() * Math.PI * 2;
    let tx = WW / 2 + Math.cos(θ) * (WW / 2 - 120);
    let ty = WH / 2 + Math.sin(θ) * (WH / 2 - 120);
    tx = clamp(tx, TRN_L + 80, TRN_R - 80);
    ty = clamp(ty, TRN_T + 80, TRN_B - 80);
    const d = Math.hypot(tx - player.x, ty - player.y);
    if (d >= 300) { ex = tx; ey = ty; break; }
    if (d > bestDist) { bestDist = d; best = { x: tx, y: ty }; }
  }
  if (ex === undefined && best) { ex = best.x; ey = best.y; }
  if (ex === undefined) return;

  const angle = Math.atan2(trainingBall.y - ey, trainingBall.x - ex);
  const seg = _getEnemyBatSegment({ x: ex, y: ey, radius: 26 }, angle);
  trnEnemies.push({
    x: ex, y: ey,
    vx: 0, vy: 0,
    radius: 26,
    angle,
    hp: ENEMY_MAX_HP, maxHp: ENEMY_MAX_HP,
    flashTimer: 0,
    splatTimer: -1,
    swingCooldown: 0,
    swingProgress: -1,
    swingStartAngle: 0,
    swingDir: 1,
    prevBatBase: { x: seg.bx, y: seg.by },
    prevBatTip:  { x: seg.tx, y: seg.ty },
    hitThisSwing: false,
    color: '#E74C3C',
  });
}

function checkTrainingSpawnClick() {
  // +ENEMY button: x=125,y=20,w=90,h=30 (canvas-space)
  if (mouse.justDown &&
      mouse.screenX >= 125 && mouse.screenX <= 215 &&
      mouse.screenY >= 20  && mouse.screenY <= 50) {
    trnSpawnEnemy();
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
let damageNumbers = [];

function restart() {
  gameState = 'playing'; winner = null;
  scores = { BLUE: 0, RED: 0 };
  scoreAnimBlue = 0; scoreAnimRed = 0;
  goalFreezeTimer = 0; playerRespawnTimer = 0;
  damageNumbers = [];
  initTraining();
}

// ── initTraining ─────────────────────────────────
function initTraining() {
  calcTrainingBounds();
  const mapCY = (TRN_T + TRN_B) / 2;

  trainingBall.x = WW / 2;
  trainingBall.y = mapCY - 150;
  trainingBall.vx = 0; trainingBall.vy = 0;
  trainingBall.speed = 0; trainingBall.stopped = true;
  trainingBall.trail = []; trainingBall.squash = 1;

  bat.hitThisSwing = true;
  bat.hitCooldown  = 0.5;
  bat._initFrames  = 30;

  momentumDisplay  = 0;
  bounceParticles  = [];
  impactFlashes    = [];
  shakeTimer       = 0;
  trnEnemies       = [];
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

  const angleDelta = normalizeAngle(player.angle - bat.prevAngle);
  const angularVel = dt > 0 ? angleDelta / dt : 0;

  // Current bat segment
  const currSeg = _getBatSegment(player.angle);
  const currBase = { x: currSeg.bx, y: currSeg.by };
  const currTip = { x: currSeg.tx, y: currSeg.ty };

  // Reset hit flag when angular velocity is low (swing ended)
  if (Math.abs(angularVel) < 0.5) {
    bat.hitThisSwing = false;
  }

  if (!bat.hitThisSwing && bat.hitCooldown <= 0 && !player.rolling) {
    const bx = trainingBall.x, by = trainingBall.y;
    const hitRadius = trainingBall.radius + bat.width;
    let contactPoint = null;

    // Test 1: Current frame — closest point on current bat segment to ball
    const currTest = segmentCircleTest(currBase.x, currBase.y, currTip.x, currTip.y, bx, by, hitRadius);
    if (currTest.hit) {
      contactPoint = currTest.closest;
    }

    // Test 2: CCD — check if ball passed through the swept quad
    // Only run CCD if ball is within max bat reach distance from player
    const ballPlayerDist = Math.hypot(bx - player.x, by - player.y);
    const maxCCDDist = (player.radius + 10 + bat.length) * 2; // generous reach
    const skipCCD = (bat._initFrames > 0) || (ballPlayerDist > maxCCDDist);
    if (!contactPoint && !skipCCD) {
      const pb = bat.prevBase, pt = bat.prevTip;
      // Check all 4 edges of the swept quad against the ball's position
      // Use a "fat" point test: does the ball center's path cross any swept edge?
      // Since ball may not move much, check if ball center is inside the swept quad
      // OR if any swept edge comes close enough to the ball

      // Edge 1: prevBase → currBase (base sweep)
      const e1 = segmentCircleTest(pb.x, pb.y, currBase.x, currBase.y, bx, by, hitRadius);
      if (e1.hit) {
        contactPoint = e1.closest;
      }
      // Edge 2: prevTip → currTip (tip sweep)
      if (!contactPoint) {
        const e2 = segmentCircleTest(pt.x, pt.y, currTip.x, currTip.y, bx, by, hitRadius);
        if (e2.hit) {
          contactPoint = e2.closest;
        }
      }
      // Edge 3: previous bat segment
      if (!contactPoint) {
        const e3 = segmentCircleTest(pb.x, pb.y, pt.x, pt.y, bx, by, hitRadius);
        if (e3.hit) {
          contactPoint = e3.closest;
        }
      }

      // If still no hit, check if ball center is inside the swept quad
      // (winding number / cross product test for convex quad)
      if (!contactPoint) {
        const qx = [pb.x, pt.x, currTip.x, currBase.x];
        const qy = [pb.y, pt.y, currTip.y, currBase.y];
        let inside = true;
        for (let i = 0; i < 4; i++) {
          const j = (i + 1) % 4;
          const cross = (qx[j] - qx[i]) * (by - qy[i]) - (qy[j] - qy[i]) * (bx - qx[i]);
          if (cross < 0) { inside = false; break; }
        }
        if (!inside) {
          // Try opposite winding
          inside = true;
          for (let i = 0; i < 4; i++) {
            const j = (i + 1) % 4;
            const cross = (qx[j] - qx[i]) * (by - qy[i]) - (qy[j] - qy[i]) * (bx - qx[i]);
            if (cross > 0) { inside = false; break; }
          }
        }
        if (inside) {
          // Use midpoint of swept bat as contact
          const midBase = { x: (pb.x + currBase.x) / 2, y: (pb.y + currBase.y) / 2 };
          const midTip = { x: (pt.x + currTip.x) / 2, y: (pt.y + currTip.y) / 2 };
          contactPoint = closestPointOnSegment(bx, by, midBase.x, midBase.y, midTip.x, midTip.y);
        }
      }
    }

    // ── Process hit ──
    if (contactPoint) {
      // Fix 1: Hit direction = normalize(ball_center - contact_point)
      let hitDx = bx - contactPoint.x;
      let hitDy = by - contactPoint.y;
      let hitLen = Math.hypot(hitDx, hitDy);
      if (hitLen > 0.01) {
        hitDx /= hitLen;
        hitDy /= hitLen;
      } else {
        // Ball exactly on contact point — use bat outward normal
        hitDx = Math.cos(player.angle);
        hitDy = Math.sin(player.angle);
      }

      // Fix 1 cont: Dot product sanity check
      // Bat velocity direction at contact (perpendicular to bat, in swing direction)
      const batOutward = { x: Math.cos(player.angle), y: Math.sin(player.angle) };
      // Bat swing velocity is perpendicular to bat direction, in the direction of angular velocity
      const swingDir = {
        x: -Math.sin(player.angle) * (angularVel >= 0 ? 1 : -1),
        y:  Math.cos(player.angle) * (angularVel >= 0 ? 1 : -1),
      };
      const dot = hitDx * swingDir.x + hitDy * swingDir.y;

      // If hit direction opposes swing direction AND we have significant swing,
      // flip the hit direction
      if (dot < 0 && Math.abs(angularVel) > 1) {
        hitDx = -hitDx;
        hitDy = -hitDy;
      }

      // Fix 3: Clamp launch angle — no more than 90° from bat outward direction
      const hitAngle = Math.atan2(hitDy, hitDx);
      const outAngle = Math.atan2(batOutward.y, batOutward.x);
      let angleDiff = normalizeAngle(hitAngle - outAngle);
      if (Math.abs(angleDiff) > Math.PI / 2) {
        // Clamp to nearest 90° boundary
        const clampedAngle = outAngle + Math.sign(angleDiff) * Math.PI / 2;
        hitDx = Math.cos(clampedAngle);
        hitDy = Math.sin(clampedAngle);
      }

      // Swing speed at contact point
      const pivotDist = contactPoint.t !== undefined
        ? player.radius + 10 + contactPoint.t * bat.length
        : Math.hypot(contactPoint.x - player.x, contactPoint.y - player.y);
      const swingSpeed = Math.abs(angularVel) * pivotDist;
      const effectiveSpeed = Math.max(swingSpeed, 120);

      // Launch
      const powerMultiplier = 1.5;
      trainingBall.vx = hitDx * effectiveSpeed * powerMultiplier;
      trainingBall.vy = hitDy * effectiveSpeed * powerMultiplier;

      // Cap
      const launchSpeed = Math.hypot(trainingBall.vx, trainingBall.vy);
      if (launchSpeed > 1000) {
        trainingBall.vx *= 1000 / launchSpeed;
        trainingBall.vy *= 1000 / launchSpeed;
      }

      trainingBall.stopped = false;
      trainingBall.speed = Math.hypot(trainingBall.vx, trainingBall.vy);

      // Fix 4: Set hit flag and 200ms minimum cooldown
      bat.hitThisSwing = true;
      bat.hitCooldown = 0.2;

      // Push ball out of bat
      trainingBall.x = contactPoint.x + hitDx * (trainingBall.radius + bat.width + 2);
      trainingBall.y = contactPoint.y + hitDy * (trainingBall.radius + bat.width + 2);

      // Screen shake
      if (trainingBall.speed > 100) {
        shakeTimer = 0.15;
        shakeIntensity = Math.min(trainingBall.speed * 0.008, 8);
      }

      // Impact particles
      if (trainingBall.speed > 80) {
        for (let i = 0; i < 6; i++) {
          const a = Math.random() * Math.PI * 2;
          const spd = 60 + Math.random() * 120;
          bounceParticles.push({
            x: contactPoint.x, y: contactPoint.y,
            vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
            life: 0.3 + Math.random() * 0.2,
            maxLife: 0.3 + Math.random() * 0.2,
            radius: 3 + Math.random() * 5,
          });
        }
        impactFlashes.push({ x: contactPoint.x, y: contactPoint.y, radius: 5, maxRadius: 35, alpha: 0.5 });
      }

      // Squash
      trainingBall.squash = 0.7;
      trainingBall.squashTimer = 0.13;
      trainingBall.squashAngle = Math.atan2(hitDy, hitDx);
    }
  }

  // Store current bat segment as previous for next frame's CCD
  bat.prevBase = { x: currBase.x, y: currBase.y };
  bat.prevTip = { x: currTip.x, y: currTip.y };
  bat.prevAngle = player.angle;
  if (bat._initFrames > 0) bat._initFrames--;
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

    if (trainingBall.speed < 30) {
      trainingBall.vx = 0;
      trainingBall.vy = 0;
      trainingBall.speed = 0;
      trainingBall.stopped = true;
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
}

// ── Player movement ──────────────────────────────
function _updatePlayer(dt) {
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
  // ── Ball damage ──
  applyBallDamage(player);
  for (const enemy of trnEnemies) {
    if (enemy.splatTimer < 0) applyBallDamage(enemy);
  }

  // ── Enemy AI update ──
  for (const enemy of trnEnemies) {
    if (enemy.flashTimer > 0) enemy.flashTimer -= dt;
    if (enemy.splatTimer >= 0) {
      enemy.splatTimer += dt;
      continue;
    }

    // State priority: SWING_ACTIVE > IDLE > DODGE > SWING_INIT > CHASE
    if (enemy.swingProgress >= 0) {
      // SWING_ACTIVE
      enemy.swingProgress += dt / 0.4;
      if (enemy.swingProgress >= 1) {
        enemy.swingProgress = -1;
        enemy.swingCooldown = 1.5 + Math.random() * 0.5;
      } else {
        const swingAngle = enemy.swingStartAngle + enemy.swingDir * (enemy.swingProgress * (Math.PI * 2 / 3));
        const currSeg = _getEnemyBatSegment(enemy, swingAngle);
        // CCD bat-ball check
        if (!enemy.hitThisSwing) {
          const bx = trainingBall.x, by = trainingBall.y;
          const hitRadius = trainingBall.radius + ENEMY_BAT_WIDTH;
          let contactPoint = null;
          const currTest = segmentCircleTest(currSeg.bx, currSeg.by, currSeg.tx, currSeg.ty, bx, by, hitRadius);
          if (currTest.hit) contactPoint = currTest.closest;
          if (!contactPoint) {
            const e1 = segmentCircleTest(enemy.prevBatBase.x, enemy.prevBatBase.y, currSeg.bx, currSeg.by, bx, by, hitRadius);
            if (e1.hit) contactPoint = e1.closest;
          }
          if (!contactPoint) {
            const e2 = segmentCircleTest(enemy.prevBatTip.x, enemy.prevBatTip.y, currSeg.tx, currSeg.ty, bx, by, hitRadius);
            if (e2.hit) contactPoint = e2.closest;
          }
          if (contactPoint) {
            let hitDx = bx - contactPoint.x;
            let hitDy = by - contactPoint.y;
            const hitLen = Math.hypot(hitDx, hitDy);
            if (hitLen > 0.01) { hitDx /= hitLen; hitDy /= hitLen; }
            else { hitDx = Math.cos(swingAngle); hitDy = Math.sin(swingAngle); }
            const swingSpeed = 300;
            trainingBall.vx = hitDx * swingSpeed;
            trainingBall.vy = hitDy * swingSpeed;
            trainingBall.stopped = false;
            trainingBall.speed = Math.hypot(trainingBall.vx, trainingBall.vy);
            trainingBall.squash = 0.75; trainingBall.squashTimer = 0.13;
            trainingBall.squashAngle = Math.atan2(hitDy, hitDx);
            trainingBall.x = contactPoint.x + hitDx * (trainingBall.radius + ENEMY_BAT_WIDTH + 2);
            trainingBall.y = contactPoint.y + hitDy * (trainingBall.radius + ENEMY_BAT_WIDTH + 2);
            enemy.hitThisSwing = true;
          }
        }
        enemy.prevBatBase = { x: currSeg.bx, y: currSeg.by };
        enemy.prevBatTip  = { x: currSeg.tx, y: currSeg.ty };
        enemy.angle = swingAngle;
      }
    } else if (trainingBall.stopped) {
      // IDLE
      enemy.vx = 0; enemy.vy = 0;
    } else if (trainingBall.speed > 200) {
      // DODGE: sidestep perpendicular to ball velocity, away from ball
      const bvLen = Math.hypot(trainingBall.vx, trainingBall.vy);
      const perpX = -trainingBall.vy / bvLen;
      const perpY =  trainingBall.vx / bvLen;
      const dot = perpX * (enemy.x - trainingBall.x) + perpY * (enemy.y - trainingBall.y);
      const side = dot >= 0 ? 1 : -1;
      enemy.vx = perpX * side * ENEMY_DODGE_SPEED;
      enemy.vy = perpY * side * ENEMY_DODGE_SPEED;
    } else {
      const edx = trainingBall.x - enemy.x, edy = trainingBall.y - enemy.y;
      const ed = Math.hypot(edx, edy);
      if (ed < 150 && enemy.swingCooldown <= 0 && !enemy.hitThisSwing) {
        // SWING_INIT
        const toBall   = Math.atan2(trainingBall.y - enemy.y, trainingBall.x - enemy.x);
        const toPlayer = Math.atan2(player.y - enemy.y, player.x - enemy.x);
        const cwMid   = toBall + Math.PI * (1 / 3);
        const ccwMid  = toBall - Math.PI * (1 / 3);
        const cwDiff  = normalizeAngle(toPlayer - cwMid);
        const ccwDiff = normalizeAngle(toPlayer - ccwMid);
        enemy.swingDir = Math.abs(cwDiff) < Math.abs(ccwDiff) ? 1 : -1;
        enemy.swingStartAngle = toBall;
        enemy.swingProgress = 0;
        enemy.hitThisSwing = false;
        enemy.vx = 0; enemy.vy = 0;
        const seg0 = _getEnemyBatSegment(enemy, toBall);
        enemy.prevBatBase = { x: seg0.bx, y: seg0.by };
        enemy.prevBatTip  = { x: seg0.tx, y: seg0.ty };
      } else {
        // CHASE
        if (ed > 0.1) {
          enemy.vx = (edx / ed) * ENEMY_SPEED;
          enemy.vy = (edy / ed) * ENEMY_SPEED;
          enemy.angle = Math.atan2(edy, edx);
        }
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

    if (enemy.swingCooldown > 0) enemy.swingCooldown -= dt;
  }

  // Remove dead enemies
  for (let i = trnEnemies.length - 1; i >= 0; i--) {
    if (trnEnemies[i].splatTimer >= 0.4) trnEnemies.splice(i, 1);
  }
}

// ── updateTraining ───────────────────────────────
function updateTraining(dt) {
  if (gameState !== 'playing') return;

  updateTrainingCamera();
  _updatePlayer(dt);
  _updateBatBallCCD(dt);
  _updateBallPhysics(dt);
  _updateEnemies(dt);
  checkTrainingSpawnClick();
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
  if (player.flashTimer > 0) player.flashTimer -= dt;

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

  // +ENEMY button
  const atMax = trnEnemies.length >= ENEMY_MAX_COUNT;
  ctx.save();
  ctx.globalAlpha = atMax ? 0.4 : 1;
  ctx.globalAlpha *= 0.2; ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.roundRect(127, 23, 90, 30, 10); ctx.fill();
  ctx.globalAlpha = atMax ? 0.4 : 1;
  ctx.fillStyle = 'rgba(40,40,80,0.6)';
  ctx.beginPath(); ctx.roundRect(125, 20, 90, 30, 10); ctx.fill();
  ctx.strokeStyle = 'rgba(121,134,203,0.4)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(125, 20, 90, 30, 10); ctx.stroke();
  ctx.fillStyle = '#9FA8DA'; ctx.font = 'bold 13px Segoe UI,sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('+ ENEMY', 170, 40);
  ctx.restore();

  // Mode label
  ctx.save();
  ctx.fillStyle = 'rgba(200,160,100,0.5)';
  ctx.font = 'bold 14px Segoe UI,sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('TRAINING GROUNDS', WW / 2, 35);
  ctx.restore();

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
    const r = 255, g = Math.round(255 * t + 156 * (1 - t)), b = Math.round(255 * t + 18 * (1 - t));
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 3;
    ctx.strokeText('-' + dn.value, dn.x, dn.y);
    ctx.fillText('-' + dn.value, dn.x, dn.y);
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
      ctx.beginPath(); ctx.roundRect(barX + 3, barY + 2, barW * hpPct - 6, barH / 2 - 2, barH / 4); ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, barH / 2); ctx.stroke();
    ctx.restore();
  }

  // ── YOU LOST overlay (new) ──
  if (gameState === 'won') {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, WW, WH);

    ctx.font = 'bold 96px Segoe UI,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#E74C3C';
    ctx.shadowColor = 'rgba(231,76,60,0.6)'; ctx.shadowBlur = 40;
    ctx.fillText('YOU LOST', WW / 2, WH / 2 - 30);
    ctx.shadowBlur = 0;

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
    ctx.fillText('↺  RESTART', bx + bw / 2, by + bh / 2 + 7);

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
