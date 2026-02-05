window.platformer = (function() {
  let canvas, ctx;
  let W = 800, H = 600;
  const keys = {};
  const prevKeys = {};

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  const TARGET_FPS = 60;
  const FIXED_DT = 1 / TARGET_FPS;
  const MAX_ACCUM_MS = 250;

  const cfg = {
    gravity: 2200,
    speed: 360,
    jumpSpeed: -740,
    tileColor: '#2d6cdf',
    bgTop: '#8fd3ff',
    bgBottom: '#071126',
    flameSpeedCoefficient: 140
  };

  const world = { width: 4800, height: 3200 };
  let platforms = [];
  let goal = { x: 2200, y: 200, w: 80, h: 80 };

  const player = {
    x: 100, y: 0, w: 36, h: 72, vx: 0, vy: 0,
    onGround: false, facing: 1, crouched: false,
    originalW: 36, originalH: 72, jumpCount: 2
  };

  const bullets = [];
  const cam = { x: 0, y: 0 };
  let flame = { height: 0 };
  let lastTime = 0, accum = 0;
  let fps = 60, frames = 0, fpsTimer = 0;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function shadeColor(hex, fraction) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    const nr = Math.min(255, Math.max(0, Math.floor(r + (255 - r) * fraction)));
    const ng = Math.min(255, Math.max(0, Math.floor(g + (255 - g) * fraction)));
    const nb = Math.min(255, Math.max(0, Math.floor(b + (255 - b) * fraction)));
    return '#' + nr.toString(16).padStart(2, '0') + ng.toString(16).padStart(2, '0') + nb.toString(16).padStart(2, '0');
  }

  function drawPlayer(ctx, p) {
    const skin = '#ffcc99';
    const cloth = '#3b82f6';
    const trim = '#1e40af';
    const outline = '#220000';

    const w = p.w, h = p.h;
    const headH = Math.max(6, Math.floor(h * 0.28));
    const torsoH = Math.max(8, Math.floor(h * 0.38));
    const legH = Math.max(8, Math.floor(h * 0.34));
    const armW = Math.max(4, Math.floor(w * 0.22));
    const x = Math.floor(p.x), y = Math.floor(p.y);

    ctx.fillStyle = '#2b2b2b';
    const legW = Math.max(6, Math.floor(w * 0.34));
    ctx.fillRect(x + Math.floor(w * 0.12), y + headH + torsoH, legW, legH);
    ctx.fillRect(x + Math.floor(w * 0.52), y + headH + torsoH, legW, legH);

    ctx.fillStyle = cloth;
    ctx.fillRect(x + Math.floor(w * 0.08), y + headH, Math.floor(w * 0.84), torsoH);
    ctx.fillStyle = trim;
    ctx.fillRect(x + Math.floor(w * 0.08), y + headH, Math.floor(w * 0.84), Math.max(2, Math.floor(torsoH * 0.18)));

    ctx.fillStyle = cloth;
    ctx.fillRect(x - armW + 2, y + headH + 2, armW, Math.max(6, torsoH - 4));
    ctx.fillRect(x + w - 2, y + headH + 2, armW, Math.max(6, torsoH - 4));

    ctx.fillStyle = skin;
    ctx.fillRect(x + Math.floor(w * 0.18), y, Math.floor(w * 0.64), headH);
    ctx.fillStyle = '#111827';
    const eyeY = y + Math.floor(headH * 0.45);
    ctx.fillRect(x + Math.floor(w * 0.30), eyeY, Math.max(2, Math.floor(w * 0.08)), 2);
    ctx.fillRect(x + Math.floor(w * 0.58), eyeY, Math.max(2, Math.floor(w * 0.08)), 2);

    ctx.strokeStyle = outline;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + Math.floor(w * 0.18), y, Math.floor(w * 0.64), headH);
    ctx.strokeRect(x + Math.floor(w * 0.08), y + headH, Math.floor(w * 0.84), torsoH);
    ctx.strokeRect(x + Math.floor(w * 0.12), y + headH + torsoH, legW, legH);
    ctx.strokeRect(x + Math.floor(w * 0.52), y + headH + torsoH, legW, legH);
  }

  function buildLevel() {
    const groundH = Math.max(28, Math.floor(player.originalH * 0.6));
    const groundY = world.height - groundH;
    platforms = [];
    platforms.push({ x: 0, y: groundY, w: world.width, h: groundH, color: '#0f1724', solid: true });

    const V = Math.abs(cfg.jumpSpeed);
    const maxJumpHeight = (V * V) / (2 * cfg.gravity);
    const totalAirTime = 2 * V / cfg.gravity;
    const horizReach = cfg.speed * totalAirTime * 0.95;

    const vSpaceMin = Math.ceil(player.originalH * 1.25);
    const vSpaceMaxUnder = Math.floor(player.originalH * 10);

    let x = 120;
    let y = groundY - Math.floor(player.originalH * 1.0);
    const minBarW = Math.max(80, Math.floor(player.originalW * 4));
    const maxBarW = Math.max(140, Math.floor(minBarW * 2.2));

    while (x < world.width - 400) {
      const barW = Math.floor(minBarW + Math.random() * (maxBarW - minBarW + 1));
      const barH = Math.max(10, Math.floor(player.originalH * 0.25));
      const bar = { x: x, y: y, w: barW, h: barH, color: '#22c55e', solid: true, fadeTimer: null, isFading: false };
      platforms.push(bar);

      const underGap = Math.floor(vSpaceMin + Math.random() * (vSpaceMaxUnder - vSpaceMin + 1));
      const barY2 = bar.y + bar.h + underGap;
      const barW2 = Math.max(minBarW, Math.floor(barW * (0.9 + Math.random() * 0.4)));
      const bar2 = { x: x + Math.floor((barW2 - barW2) / 2), y: barY2, w: barW2, h: Math.max(12, Math.floor(player.originalH * 0.33)), color: '#22c55e', solid: true, fadeTimer: null, isFading: false };
      platforms.push(bar2);

      const minStep = Math.floor(player.originalW * 1.0);
      const maxStep = Math.max(minStep + 20, Math.floor(horizReach * 0.9));
      const step = Math.floor(minStep + Math.random() * (maxStep - minStep + 1));
      const xNext = x + step + Math.floor(Math.random() * Math.floor(barW * 0.5));

      const minRise = vSpaceMin;
      const maxRise = Math.floor(Math.max(minRise, Math.min(maxJumpHeight * 0.9, player.originalH * 8)));
      const rise = Math.floor(minRise + Math.random() * (maxRise - minRise + 1));
      const yNext = Math.max(80, y - rise);

      x = xNext;
      y = yNext;
    }

    goal = { x: world.width - 360, y: Math.max(80, Math.floor(groundY - 6 * player.originalH)), w: Math.max(64, Math.floor(player.originalW * 2.5)), h: Math.max(64, Math.floor(player.originalH * 0.9)) };
  }

  function physicsStep(dt) {
    let move = 0;
    if (keys['a'] || keys['arrowleft']) move -= 1;
    if (keys['d'] || keys['arrowright']) move += 1;

    const jumpHeld = !!(keys['w'] || keys['arrowup'] || keys[' ']);
    const prevJumpHeld = !!(prevKeys['w'] || prevKeys['arrowup'] || prevKeys[' ']);
    const jumpPressedEdge = jumpHeld && !prevJumpHeld;

    const crouch = keys['s'] || keys['arrowdown'];
    if (crouch && !player.crouched) {
      const side = Math.max(12, Math.floor(player.originalH * 0.5));
      player.x += (player.w - side) / 2;
      player.y += (player.h - side);
      player.w = side;
      player.h = side;
      player.crouched = true;
    } else if (!crouch && player.crouched) {
      const prevW = player.w, prevH = player.h;
      player.w = player.originalW;
      player.h = player.originalH;
      player.crouched = false;
      player.x += (prevW - player.w) / 2;
      player.y += (prevH - player.h);
    }

    player.vx = move * cfg.speed * (player.crouched ? 0.6 : 1);

    if (jumpPressedEdge && player.jumpCount > 0) {
      player.vy = cfg.jumpSpeed;
      player.onGround = false;
      player.jumpCount -= 1;
    }

    if ((keys['z'] || keys['k']) && (!player._lastShoot || performance.now() - player._lastShoot > 180)) {
      bullets.push({ x: player.x + player.w / 2, y: player.y + player.h / 2, vx: (player.facing || 1) * 900, vy: 0, w: 8, h: 4, life: 2 });
      player._lastShoot = performance.now();
    }

    player.vy += cfg.gravity * dt;
    player.x += player.vx * dt;
    player.y += player.vy * dt;

    if (player.x < 0) player.x = 0;
    if (player.x + player.w > world.width) player.x = world.width - player.w;
    if (player.y > world.height + 200) respawn();

    player.onGround = false;
    for (let p of platforms) {
      if (!p.solid) continue;
      if (rectsOverlap(player, p)) {
        const dx = (player.x + player.w / 2) - (p.x + p.w / 2);
        const px = (p.w + player.w) / 2 - Math.abs(dx);
        const dy = (player.y + player.h / 2) - (p.y + p.h / 2);
        const py = (p.h + player.h) / 2 - Math.abs(dy);
        if (px > 0 && py > 0) {
          if (px < py) {
            if (dx > 0) player.x += px;
            else player.x -= px;
            player.vx = 0;
          } else {
            if (dy > 0) { player.y += py; player.vy = 0; }
            else { player.y -= py; player.vy = 0; player.onGround = true; }
            if (player.onGround && (p.color === '#22c55e') && p.fadeTimer === null) {
              p.fadeTimer = 1.0;
            }
          }
        }
      }
    }

    if (player.onGround && !prevKeys.__onGround) player.jumpCount = 2;
    prevKeys.__onGround = player.onGround;

    for (let p of platforms) {
      if (p.fadeTimer !== null) {
        p.fadeTimer -= dt;
        p.isFading = true;
        if (p.fadeTimer <= 0) {
          p.fadeTimer = null;
          p.solid = false;
          p.isFading = false;
        }
      }
    }

    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.x < 0 || b.x > world.width || b.life <= 0) { bullets.splice(i, 1); continue; }
      for (let p of platforms) { if (rectsOverlap(b, p) && p.solid) { bullets.splice(i, 1); break; } }
    }

    for (const k in keys) prevKeys[k] = keys[k];

    flame.height += cfg.flameSpeedCoefficient * dt;

    const flameTop = world.height - flame.height;
    if (player.y + player.h > flameTop) {
      respawn();
    }
  }

  function respawn() {
    const start = platforms[1] || platforms[0];
    player.x = start.x + 16;
    player.y = start.y - player.h - 2;
    player.vx = 0;
    player.vy = 0;
    player.onGround = false;
    player.crouched = false;
    player.jumpCount = 2;
    flame.height = 0;
    const win = document.getElementById('winOverlay');
    if (win) win.style.display = 'none';
  }

  function render() {
    const targetX = clamp(player.x + player.w / 2 - W / 2, 0, world.width - W);
    const targetY = clamp(player.y + player.h / 2 - H / 2, 0, world.height - H);
    cam.x += (targetX - cam.x) * 0.14;
    cam.y += (targetY - cam.y) * 0.14;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, cfg.bgTop);
    g.addColorStop(1, cfg.bgBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(-Math.floor(cam.x), -Math.floor(cam.y));

    for (let p of platforms) {
      const color = p.color || cfg.tileColor;
      let alpha = 1.0;
      if (p.isFading && p.fadeTimer !== null) {
        alpha = Math.max(0, p.fadeTimer);
      }
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = shadeColor(color, 0.18);
      ctx.fillRect(p.x, p.y, p.w, Math.min(6, p.h));
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(p.x, p.y, p.w, p.h);
      ctx.globalAlpha = 1.0;
    }

    ctx.fillStyle = '#ffd700';
    ctx.fillRect(goal.x, goal.y, goal.w, goal.h);

    drawPlayer(ctx, player);

    ctx.fillStyle = '#ff6b6b';
    for (let b of bullets) ctx.fillRect(b.x, b.y, b.w, b.h);

    ctx.restore();

    const flameBottomWorldY = world.height;
    const flameTopWorldY = world.height - flame.height;
    const flameBottomScreenY = flameBottomWorldY - cam.y;
    const flameTopScreenY = flameTopWorldY - cam.y;

    if (flameBottomScreenY > 0) {
      ctx.fillStyle = 'rgba(220, 20, 20, 0.8)';
      const triW = 80;
      const triH = 100;
      const triangleSpacing = triW * 0.8;
      const startScreenY = Math.max(0, flameTopScreenY);
      const endScreenY = Math.min(H, flameBottomScreenY);
      
      for (let x = -triangleSpacing; x < W + triangleSpacing; x += triangleSpacing) {
        for (let screenY = startScreenY - triH; screenY < endScreenY + triH; screenY += triH * 1.2) {
          if (screenY > -triH && screenY < H) {
            ctx.beginPath();
            ctx.moveTo(x, screenY + triH);
            ctx.lineTo(x - triW / 2, screenY);
            ctx.lineTo(x + triW / 2, screenY);
            ctx.closePath();
            ctx.fill();
          }
        }
      }
    }

    const showFps = document.getElementById('showFps')?.checked;
    const showPos = document.getElementById('showPos')?.checked;

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(10, 10, 520, 34);
    ctx.font = '15px monospace';
    ctx.fillStyle = '#fff';
    ctx.fillText('Controls: A/D or ←/→ to move • W/↑/Space to jump • S to crouch • Z to shoot', 16, 32);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(W - 260, 10, 250, 56);
    ctx.fillStyle = '#fff';
    if (showPos) ctx.fillText(`Pos: ${Math.round(player.x)}, ${Math.round(player.y)}`, W - 250, 30);
    ctx.fillText(`Size: ${player.w}x${player.h}`, W - 250, 52);
    if (showFps) ctx.fillText(`FPS: ${fps.toFixed(0)}`, W - 120, 52);
  }

  function checkWin() {
    if (rectsOverlap(player, goal)) {
      const win = document.getElementById('winOverlay');
      if (win) win.style.display = 'block';
      player.vx = 0;
      player.vy = 0;
      return true;
    }
    return false;
  }

  function frame(now) {
    if (!lastTime) lastTime = now;
    let ms = now - lastTime;
    if (ms > MAX_ACCUM_MS) ms = MAX_ACCUM_MS;
    lastTime = now;
    accum += ms;
    fpsTimer += ms;
    frames++;
    if (fpsTimer >= 500) { fps = frames * 1000 / fpsTimer; frames = 0; fpsTimer = 0; }

    while (accum >= FIXED_DT * 1000) { physicsStep(FIXED_DT); accum -= FIXED_DT * 1000; }
    checkWin();
    render();
    requestAnimationFrame(frame);
  }

  return {
    init: function() {
      window.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
      window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

      canvas = document.getElementById('gameCanvas');
      ctx = canvas.getContext('2d');

      function resize() {
        const rect = canvas.getBoundingClientRect();
        canvas.width = Math.max(300, Math.floor(rect.width));
        canvas.height = Math.max(200, Math.floor(rect.height));
        W = canvas.width;
        H = canvas.height;
        player.originalH = Math.max(28, Math.floor(H * 0.12));
        player.originalW = Math.max(14, Math.floor(player.originalH * 0.5));
        if (!player.crouched) { player.w = player.originalW; player.h = player.originalH; }
        buildLevel();
      }

      window.addEventListener('resize', resize);
      resize();

      const start = platforms[1] || platforms[0];
      player.x = start.x + 16;
      player.y = start.y - player.h - 2;

      canvas.addEventListener('click', () => canvas.focus());
      canvas.setAttribute('tabindex', '0');
      canvas.focus();

      window.addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 'r') respawn(); });

      lastTime = 0;
      accum = 0;
      frames = 0;
      fpsTimer = 0;
      requestAnimationFrame(frame);
    }
  };
})();
