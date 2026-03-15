'use strict';
// draw.js — CLAY helpers + makeFloor + drawBlobBody + drawTraining (world-space)
// Loaded after game.js. Reads globals: ctx, WW, WH, TRN_L/R/T/B, TRN_RECTS,
// trainingBall, bat, bounceParticles, impactFlashes, shakeTimer, shakeIntensity,
// trnEnemies, player, myPlayerColor, TILE, CLAY, ENEMY_BAT_LENGTH, ENEMY_BAT_WIDTH.
let floorPat = null;

// ── Clay palette ────────────────────────────────
const CLAY = {
  player:     '#9B59B6',   // purple
  enemy:      '#E74C3C',   // red
  bullet:     '#F39C12',   // amber
  bg:         '#2ECC71',   // green
  bgDark:     '#1a9c54',
  wallBase:   '#D4A574',   // warm tan
  wallHi:     '#E8C9A0',
  wallDark:   '#A07850',
  floorBase:  '#7DCEA0',   // soft mint
  floorDark:  '#5DB880',
  pillar:     '#C19A6B',
  cover:      '#B0846A',
  coverHi:    '#D4A88C',
  coverStroke:'#8B6550',
  divider:    '#C19A6B',
  dividerHi:  '#D4B896',
};

// ── Helper: hex to RGB ──────────────────────────
function clayHexToRgb(hex) {
  const n = parseInt(hex.replace('#',''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ── Helper: clay gradient on a circle ───────────
function clayCircleGradient(cx, cy, r, baseHex) {
  const [br, bg, bb] = clayHexToRgb(baseHex);
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.05, cx, cy, r);
  // Light top-left highlight
  g.addColorStop(0, `rgba(${Math.min(br+80,255)},${Math.min(bg+80,255)},${Math.min(bb+80,255)},1)`);
  // Base color mid
  g.addColorStop(0.5, baseHex);
  // Darker bottom-right shadow
  g.addColorStop(1, `rgba(${Math.max(br-60,0)},${Math.max(bg-60,0)},${Math.max(bb-60,0)},1)`);
  return g;
}

// ── Helper: white inner highlight ───────────────
function clayInnerHighlight(cx, cy, r) {
  ctx.save();
  ctx.globalAlpha = 0.25;
  const hl = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, 0, cx - r * 0.15, cy - r * 0.15, r * 0.55);
  hl.addColorStop(0, 'rgba(255,255,255,0.9)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl;
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.12, cy - r * 0.18, r * 0.45, r * 0.32, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ── Helper: clay drop shadow ────────────────────
function clayDropShadow(enable) {
  if (enable) {
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;
  } else {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }
}

// ── Helper: lighten/darken a hex color for clay gradients ───
function clayLighten(hex, amt) {
  const [r, g, b] = clayHexToRgb(hex);
  return `rgb(${Math.min(r + Math.round(amt * 255), 255)},${Math.min(g + Math.round(amt * 255), 255)},${Math.min(b + Math.round(amt * 255), 255)})`;
}
function clayDarken(hex, amt) {
  const [r, g, b] = clayHexToRgb(hex);
  return `rgb(${Math.max(r - Math.round(amt * 255), 0)},${Math.max(g - Math.round(amt * 255), 0)},${Math.max(b - Math.round(amt * 255), 0)})`;
}
function clayStroke(hex) {
  const [r, g, b] = clayHexToRgb(hex);
  return `rgba(${Math.max(r - 60, 0)},${Math.max(g - 60, 0)},${Math.max(b - 60, 0)},0.6)`;
}

// ── makeFloor ───────────────────────────────────
function makeFloor() {
  const tc = document.createElement('canvas');
  tc.width = TILE; tc.height = TILE;
  const t = tc.getContext('2d');
  // Warm pastel green floor tile
  t.fillStyle = CLAY.floorBase;
  t.fillRect(0, 0, TILE, TILE);
  // Subtle clay texture bumps
  t.strokeStyle = 'rgba(255,255,255,0.08)';
  t.lineWidth = 1;
  t.strokeRect(0.5, 0.5, TILE - 1, TILE - 1);
  // Small light specks for clay grain
  t.fillStyle = 'rgba(255,255,255,0.04)';
  for (let i = 0; i < 5; i++) {
    const sx = Math.random() * TILE, sy = Math.random() * TILE;
    t.beginPath();
    t.arc(sx, sy, 2 + Math.random() * 3, 0, Math.PI * 2);
    t.fill();
  }
  // Darker edge/groove lines
  t.strokeStyle = 'rgba(0,0,0,0.06)';
  t.lineWidth = 1.5;
  t.strokeRect(1, 1, TILE - 2, TILE - 2);
  floorPat = ctx.createPattern(tc, 'repeat');
}

// ── drawBlobBody ────────────────────────────────
function drawBlobBody(x, y, r, sx, sy, col) {
  const baseCol = col || CLAY.player;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sx, sy);

  // Clay drop shadow (ellipse beneath)
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = 'rgba(60,30,15,0.7)';
  ctx.beginPath();
  ctx.ellipse(3, r * 0.7, r * 0.75, r * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Outer rim – slightly darker
  const [br, bg, bb] = clayHexToRgb(baseCol);
  ctx.fillStyle = `rgb(${Math.max(br-40,0)},${Math.max(bg-40,0)},${Math.max(bb-40,0)})`;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();

  // Main clay body with radial gradient
  ctx.fillStyle = clayCircleGradient(0, 0, r * 0.96, baseCol);
  ctx.beginPath(); ctx.arc(0, 0, r * 0.96, 0, Math.PI * 2); ctx.fill();

  // Inner white highlight (clay shine)
  clayInnerHighlight(0, 0, r);

  // Soft drop shadow on the shape itself
  ctx.save();
  clayDropShadow(true);
  ctx.globalAlpha = 0;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.96, 0, Math.PI * 2); ctx.fill();
  clayDropShadow(false);
  ctx.restore();

  // Eyes – softer clay style
  ctx.fillStyle = '#2C1810';
  ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.2, r * 0.14, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(r * 0.3, -r * 0.2, r * 0.14, 0, Math.PI * 2); ctx.fill();
  // Eye shine
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath(); ctx.arc(-r * 0.25, -r * 0.25, r * 0.06, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(r * 0.35, -r * 0.25, r * 0.06, 0, Math.PI * 2); ctx.fill();

  ctx.restore();
}

// ── drawGate ────────────────────────────────────
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

// ── drawTraining (world-space) ──────────────────
function drawTraining() {
    // Apply screen shake
    if (shakeTimer > 0) {
      const sx = (Math.random() - 0.5) * shakeIntensity * 2;
      const sy = (Math.random() - 0.5) * shakeIntensity * 2;
      ctx.translate(sx, sy);
    }

    // ── Background beyond map (visible when zoomed out) ──
    ctx.fillStyle = CLAY.wallDark;
    ctx.fillRect(-500, -500, WW + 1000, WH + 1000);

    // ── Floor (training-specific: solid base + subtle dot grain, no noisy grid) ──
    ctx.fillStyle = CLAY.wallDark;
    ctx.fillRect(0, 0, WW, WH);
    ctx.fillStyle = floorPat || CLAY.floorBase;
    ctx.fillRect(TRN_L, TRN_T, TRN_R - TRN_L, TRN_B - TRN_T);
    // Subtle dot grain instead of grid
    ctx.save();
    ctx.beginPath(); ctx.rect(TRN_L, TRN_T, TRN_R - TRN_L, TRN_B - TRN_T); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    for (let gx = TRN_L + 32; gx < TRN_R; gx += 64) {
      for (let gy = TRN_T + 32; gy < TRN_B; gy += 64) {
        ctx.beginPath(); ctx.arc(gx, gy, 2.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();

    // ── Walls (directional gradients for clay depth) ──
    const _M = 500;
    // Top wall
    {
      const g = ctx.createLinearGradient(0, TRN_T, 0, 0);
      g.addColorStop(0, CLAY.wallBase); g.addColorStop(1, CLAY.wallDark);
      ctx.fillStyle = g; ctx.fillRect(-_M, -_M, WW + _M * 2, TRN_T + _M);
      ctx.fillStyle = CLAY.wallHi; ctx.fillRect(-_M, TRN_T - 5, WW + _M * 2, 5);
    }
    // Bottom wall
    {
      const g = ctx.createLinearGradient(0, TRN_B, 0, WH);
      g.addColorStop(0, CLAY.wallBase); g.addColorStop(1, CLAY.wallDark);
      ctx.fillStyle = g; ctx.fillRect(-_M, TRN_B, WW + _M * 2, WH - TRN_B + _M);
      ctx.fillStyle = CLAY.wallHi; ctx.fillRect(-_M, TRN_B, WW + _M * 2, 5);
    }
    // Left wall
    {
      const g = ctx.createLinearGradient(TRN_L, 0, 0, 0);
      g.addColorStop(0, CLAY.wallBase); g.addColorStop(1, CLAY.wallDark);
      ctx.fillStyle = g; ctx.fillRect(-_M, -_M, TRN_L + _M, WH + _M * 2);
      ctx.fillStyle = CLAY.wallHi; ctx.fillRect(TRN_L - 5, -_M, 5, WH + _M * 2);
    }
    // Right wall
    {
      const g = ctx.createLinearGradient(TRN_R, 0, WW, 0);
      g.addColorStop(0, CLAY.wallBase); g.addColorStop(1, CLAY.wallDark);
      ctx.fillStyle = g; ctx.fillRect(TRN_R, -_M, WW - TRN_R + _M, WH + _M * 2);
      ctx.fillStyle = CLAY.wallHi; ctx.fillRect(TRN_R, -_M, 5, WH + _M * 2);
    }

    // Corner pillars
    const P = 20;
    ctx.fillStyle = CLAY.pillar;
    [[TRN_L - 2, TRN_T - 2], [TRN_R - P + 2, TRN_T - 2], [TRN_L - 2, TRN_B - P + 2], [TRN_R - P + 2, TRN_B - P + 2]].forEach(([px, py]) => {
      ctx.save();
      clayDropShadow(true);
      ctx.beginPath(); ctx.roundRect(px, py, P, P, 5); ctx.fill();
      clayDropShadow(false);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.roundRect(px + 2, py + 2, P - 8, P / 2 - 2, 3); ctx.fill();
      ctx.fillStyle = CLAY.pillar;
      ctx.restore();
    });

    // ── Gates ──
  if (GATE_LEFT)  drawGate(GATE_LEFT,  'rgba(52,152,219,1)');
  if (GATE_RIGHT) drawGate(GATE_RIGHT, 'rgba(231,76,60,1)');

    // ── Training obstacles (same clay cover blocks) ──
    for (const r of TRN_RECTS) {
      ctx.save(); ctx.globalAlpha = 0.2; ctx.fillStyle = 'rgba(80,40,20,0.6)';
      ctx.beginPath(); ctx.roundRect(r.x + 3, r.y + r.h - 3, r.w, 8, 4); ctx.fill();
      ctx.restore();
      ctx.save();
      clayDropShadow(true);
      ctx.fillStyle = CLAY.cover; ctx.strokeStyle = CLAY.coverStroke; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 8); ctx.fill(); ctx.stroke();
      clayDropShadow(false);
      ctx.fillStyle = CLAY.coverHi;
      ctx.beginPath(); ctx.roundRect(r.x + 3, r.y + 3, r.w - 6, 14, [6, 6, 0, 0]); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath(); ctx.roundRect(r.x + 4, r.y + 4, r.w * 0.4, r.h * 0.3, 4); ctx.fill();
      ctx.restore();
    }

    // ── Impact flashes (white expanding rings) ──
    for (const f of impactFlashes) {
      ctx.save();
      ctx.globalAlpha = f.alpha;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2); ctx.stroke();
      // Inner glow
      ctx.globalAlpha = f.alpha * 0.4;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.arc(f.x, f.y, f.radius * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // ── Ball trail (clay) ──
    for (const t of trainingBall.trail) {
      ctx.save();
      ctx.globalAlpha = t.alpha * 0.35;
      ctx.fillStyle = clayCircleGradient(t.x, t.y, trainingBall.radius * 0.7, '#F39C12');
      ctx.beginPath(); ctx.arc(t.x, t.y, trainingBall.radius * 0.7, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // ── Ball (clay styled) ──
    ctx.save();
    ctx.translate(trainingBall.x, trainingBall.y);
    if (trainingBall.squash < 1) {
      ctx.rotate(trainingBall.squashAngle);
      const stretchAlong = 1 + (1 - trainingBall.squash) * 0.8;
      ctx.scale(stretchAlong, trainingBall.squash);
    }
    // Drop shadow
    ctx.save(); ctx.globalAlpha = 0.3; ctx.fillStyle = 'rgba(60,30,15,0.7)';
    ctx.beginPath(); ctx.ellipse(4, 5, trainingBall.radius * 1.1, trainingBall.radius * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // Outer rim
    const [bbr, bbg, bbb] = clayHexToRgb('#F39C12');
    ctx.fillStyle = `rgb(${Math.max(bbr-40,0)},${Math.max(bbg-40,0)},${Math.max(bbb-40,0)})`;
    ctx.beginPath(); ctx.arc(0, 0, trainingBall.radius, 0, Math.PI * 2); ctx.fill();
    // Body
    ctx.fillStyle = clayCircleGradient(0, 0, trainingBall.radius * 0.96, '#F39C12');
    ctx.beginPath(); ctx.arc(0, 0, trainingBall.radius * 0.96, 0, Math.PI * 2); ctx.fill();
    clayInnerHighlight(0, 0, trainingBall.radius);
    // Bright white specular dot (top-left)
    ctx.save();
    ctx.globalAlpha = 0.6;
    const specR = trainingBall.radius * 0.22;
    const specG = ctx.createRadialGradient(
      -trainingBall.radius * 0.38, -trainingBall.radius * 0.38, 0,
      -trainingBall.radius * 0.38, -trainingBall.radius * 0.38, specR);
    specG.addColorStop(0, 'rgba(255,255,255,1)');
    specG.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = specG;
    ctx.beginPath(); ctx.arc(-trainingBall.radius * 0.38, -trainingBall.radius * 0.38, specR, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.restore();

    // ── Bounce particles (clay dust / goal celebration) ──
    for (const p of bounceParticles) {
      ctx.save();
      ctx.globalAlpha = (p.life / p.maxLife) * 0.5;
      ctx.fillStyle = clayCircleGradient(p.x, p.y, p.radius, p.color || CLAY.wallBase);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // ── Enemies (clay styled) ──
    for (const enemy of trnEnemies) {
      ctx.save();
      if (enemy.splatTimer >= 0) {
        const t = enemy.splatTimer / 0.4;
        ctx.globalAlpha = 1 - t;
        ctx.translate(enemy.x, enemy.y);
        ctx.scale(1 + t * 1.25, 1 + t * 1.25);
        ctx.translate(-enemy.x, -enemy.y);
      }

      // Body (clay style)
      drawBlobBody(enemy.x, enemy.y, enemy.radius, 1, 1, enemy.color);

      // Flash overlay on damage
      if (enemy.flashTimer > 0) {
        ctx.save();
        ctx.globalAlpha = (enemy.flashTimer / 0.2) * 0.55;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // Health bar
      if (enemy.splatTimer < 0) {
        const bw = 44, bh = 5;
        const bx = enemy.x - bw / 2, by = enemy.y - enemy.radius - 14;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 2); ctx.fill();
        ctx.fillStyle = enemy.color;
        ctx.beginPath(); ctx.roundRect(bx, by, bw * (enemy.hp / enemy.maxHp), bh, 2); ctx.fill();
      }

      // Bat (clay styled)
      if (enemy.splatTimer < 0) {
        const swingAngle = enemy.swingProgress >= 0
          ? enemy.swingStartAngle + enemy.swingDir * (enemy.swingProgress * Math.PI * 2 / 3)
          : enemy.angle;
        ctx.save();
        ctx.translate(enemy.x, enemy.y);
        ctx.rotate(swingAngle);
        // Arm
        ctx.fillStyle = clayCircleGradient(enemy.radius + 5, 0, 6, enemy.color);
        ctx.beginPath(); ctx.ellipse(enemy.radius + 5, 0, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
        // Bat club
        const batX  = enemy.radius + 10;
        const bL    = ENEMY_BAT_LENGTH;
        const hh    = ENEMY_BAT_WIDTH / 2;
        const th    = ENEMY_BAT_WIDTH * 0.95;
        const ts    = batX + bL * 0.45;
        const tipCx = batX + bL;
        ctx.save();
        clayDropShadow(true);
        ctx.beginPath();
        ctx.moveTo(batX + 5, -hh);
        ctx.lineTo(ts, -hh);
        ctx.lineTo(tipCx - th, -th);
        ctx.arc(tipCx - th, 0, th, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(ts, hh);
        ctx.lineTo(batX + 5, hh);
        ctx.arcTo(batX, hh, batX, -hh, 5);
        ctx.arcTo(batX, -hh, batX + 5, -hh, 5);
        ctx.closePath();
        const bg = ctx.createRadialGradient(batX + bL * 0.3, -hh * 0.6, 1, batX + bL * 0.55, 0, bL * 0.75);
        bg.addColorStop(0,   CLAY.wallHi);
        bg.addColorStop(0.4, CLAY.wallBase);
        bg.addColorStop(1,   CLAY.wallDark);
        ctx.fillStyle   = bg;
        ctx.strokeStyle = CLAY.coverStroke; ctx.lineWidth = 1.5;
        ctx.fill(); ctx.stroke();
        clayDropShadow(false);
        ctx.restore();
        ctx.restore();
      }

      ctx.restore();
    }

    // ── Player ghosts ──
    for (const g of player.ghosts) {
      ctx.save();
      ctx.globalAlpha = g.alpha * 0.3;
      ctx.fillStyle = clayCircleGradient(g.x, g.y, player.radius, myPlayerColor);
      ctx.beginPath(); ctx.arc(g.x, g.y, player.radius, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // ── Player blob (clay) ──
    const pbsx = player.rolling ? 1.3 : 1;
    const pbsy = player.rolling ? 0.8 : 1;
    drawBlobBody(player.x, player.y, player.radius, pbsx, pbsy, myPlayerColor);

    // ── Bat (clay styled) ──
    if (!player.rolling) {
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.rotate(player.angle);
      // Arm
      ctx.fillStyle = clayCircleGradient(player.radius + 5, 0, 6, myPlayerColor);
      ctx.beginPath(); ctx.ellipse(player.radius + 5, 0, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
      // Bat body — tapered club shape (narrow handle → wide hitting end)
      const batX = player.radius + 10;
      const bL = bat.length;             // 48
      const hh = bat.width / 2;          // handle half-height = 7
      const th = bat.width * 0.95;       // tip half-height = ~13
      const taperStart = batX + bL * 0.45; // where widening begins
      const tipCx = batX + bL;           // arc center for rounded tip

      ctx.save();
      clayDropShadow(true);

      // Club path: narrow handle → tapered body → rounded tip
      ctx.beginPath();
      ctx.moveTo(batX + 5, -hh);
      ctx.lineTo(taperStart, -hh);
      ctx.lineTo(tipCx - th, -th);
      ctx.arc(tipCx - th, 0, th, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(taperStart, hh);
      ctx.lineTo(batX + 5, hh);
      ctx.arcTo(batX, hh, batX, -hh, 5);
      ctx.arcTo(batX, -hh, batX + 5, -hh, 5);
      ctx.closePath();

      // Radial gradient: bright highlight top-left → base mid → dark edge
      const batGrad = ctx.createRadialGradient(
        batX + bL * 0.3, -hh * 0.6, 1,
        batX + bL * 0.55, 0, bL * 0.75);
      batGrad.addColorStop(0,   CLAY.wallHi);
      batGrad.addColorStop(0.4, CLAY.wallBase);
      batGrad.addColorStop(1,   CLAY.wallDark);
      ctx.fillStyle = batGrad;
      ctx.strokeStyle = CLAY.coverStroke; ctx.lineWidth = 1.5;
      ctx.fill(); ctx.stroke();
      clayDropShadow(false);

      // Handle wrap (dark grip band)
      ctx.fillStyle = CLAY.wallDark;
      ctx.beginPath(); ctx.roundRect(batX + 1, -hh + 2, 10, (hh - 2) * 2, 3); ctx.fill();
      // Tip specular highlight
      ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(tipCx - th * 0.6, -th * 0.55, th * 0.35, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      ctx.restore();
      ctx.restore();
    }
}

makeFloor();
