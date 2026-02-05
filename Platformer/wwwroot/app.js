window.game = (function() {
  let canvas, ctx;
  let W = 800, H = 600;

  const world = { width: 2400, height: 1600 };

  const keys = {};
  window.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  const platforms = [
    { x: 0, y: 760, w: 2400, h: 40 },
    { x: 300, y: 620, w: 200, h: 20 },
    { x: 700, y: 500, w: 300, h: 20 },
    { x: 1200, y: 380, w: 200, h: 20 },
    { x: 1700, y: 240, w: 300, h: 20 },
    { x: 200, y: 920, w: 400, h: 20 },
    { x: 1000, y: 1100, w: 600, h: 20 },
    { x: 1800, y: 1400, w: 400, h: 20 }
  ];

  const player = {
    x: 100, y: 0, w: 36, h: 72, vx: 0, vy: 0,
    speed: 360, jumpSpeed: -720, gravity: 2200, onGround: false, facing: 1, crouched: false,
    originalW: 36, originalH: 72
  };

  const bullets = [];

  let last = performance.now();

  // camera state for smooth follow
  const cam = { x: 0, y: 0 };

  function update(dt) {
    // input
    let move = 0;
    if (keys['arrowleft'] || keys['a']) move -= 1;
    if (keys['arrowright'] || keys['d']) move += 1;

    // crouch: shrink to a square half the size (visually) when pressing S or ArrowDown
    const crouch = keys['arrowdown'] || keys['s'];
    if (crouch) {
      if (!player.crouched) {
        // compute crouch square side as half the original height to make a visible square
        const side = Math.floor(player.originalH / 2);
        // keep bottom aligned and center x
        player.x += (player.w - side) / 2;
        player.y += (player.h - side);
        player.w = side;
        player.h = side;
        player.crouched = true;
      }
    } else {
      if (player.crouched) {
        // restore size and keep bottom aligned
        const prevW = player.w, prevH = player.h;
        player.w = player.originalW;
        player.h = player.originalH;
        player.x += (prevW - player.w) / 2;
        player.y += (prevH - player.h);
        player.crouched = false;
      }
    }

    player.vx = move * player.speed * (player.crouched ? 0.6 : 1);
    if (move !== 0) player.facing = Math.sign(move);

    // jump (allow space or up)
    if ((keys['arrowup'] || keys['w'] || keys[' ']) && player.onGround) {
      player.vy = player.jumpSpeed;
      player.onGround = false;
    }

    // shooting (Z or k)
    if (keys['z'] || keys['k']) {
      if (!this._lastShoot || performance.now() - this._lastShoot > 180) {
        bullets.push({ x: player.x + player.w/2, y: player.y + player.h/2, vx: player.facing * 900, vy: 0, w:8, h:4, life: 2.0 });
        this._lastShoot = performance.now();
      }
    }

    // physics
    player.vy += player.gravity * dt;
    player.x += player.vx * dt;
    player.y += player.vy * dt;

    // world bounds
    if (player.x < 0) player.x = 0;
    if (player.x + player.w > world.width) player.x = world.width - player.w;
    if (player.y + player.h > world.height) { player.y = world.height - player.h; player.vy = 0; player.onGround = true; }

    // collisions with platforms
    player.onGround = false;
    for (let p of platforms) {
      const a = { x: player.x, y: player.y, w: player.w, h: player.h };
      const b = { x: p.x, y: p.y, w: p.w, h: p.h };
      if (rectsOverlap(a,b)) {
        // simple resolution: push player up to previous position y
        // move back vertically
        if (player.vy > 0 && (player.y + player.h) - p.y < 60) {
          player.y = p.y - player.h;
          player.vy = 0;
          player.onGround = true;
        } else if (player.vy < 0 && (p.y + p.h) - player.y < 60) {
          player.y = p.y + p.h;
          player.vy = 0;
        } else if (player.vx > 0) {
          player.x = p.x - player.w;
        } else if (player.vx < 0) {
          player.x = p.x + p.w;
        }
      }
    }

    // bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      // remove if out of world or hit platform
      if (b.x < 0 || b.x > world.width || b.life <= 0) { bullets.splice(i,1); continue; }
      for (let p of platforms) {
        if (rectsOverlap(b, p)) { bullets.splice(i,1); break; }
      }
    }
  }

  function render() {
    // camera centers on player (smooth)
    const targetCamX = player.x + player.w/2 - W/2;
    const targetCamY = player.y + player.h/2 - H/2;
    cam.x += (Math.max(0, Math.min(targetCamX, world.width - W)) - cam.x) * 0.14;
    cam.y += (Math.max(0, Math.min(targetCamY, world.height - H)) - cam.y) * 0.14;

    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,W,H);

    // sky gradient background for better contrast
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#8fd3ff');
    g.addColorStop(1, '#071126');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,W,H);

    ctx.save();
    ctx.translate(-Math.floor(cam.x), -Math.floor(cam.y));

    // draw platforms
    ctx.fillStyle = '#2d6cdf';
    for (let p of platforms) {
      ctx.fillRect(p.x, p.y, p.w, p.h);
    }

    // draw player (red rectangle)
    ctx.fillStyle = '#ff3333';
    ctx.fillRect(player.x, player.y, player.w, player.h);

    // draw player outline
    ctx.strokeStyle = '#220000';
    ctx.lineWidth = 2;
    ctx.strokeRect(player.x, player.y, player.w, player.h);

    // draw bullets
    ctx.fillStyle = '#ff6b6b';
    for (let b of bullets) ctx.fillRect(b.x, b.y, b.w, b.h);

    // HUD - instructions panel (fixed to screen)
    ctx.restore();
    const pad = 10;
    const lines = [
      'Controls: A/D or ←/→ to move • W/↑/Space to jump • S to crouch • Z to shoot'
    ];
    ctx.font = '15px monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(10, 10, 520, 34);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(lines[0], 16, 32);

    // small status
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(W - 260, 10, 250, 56);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`Pos: ${Math.round(player.x)}, ${Math.round(player.y)}`, W - 250, 30);
    ctx.fillText(`Size: ${player.w}x${player.h}`, W - 250, 52);
  }

  function loop(now) {
    const dt = Math.min(0.032, (now - last) / 1000);
    update(dt);
    render();
    last = now;
    requestAnimationFrame(loop);
  }

  return {
    init: function() {
      // obtain canvas and context (responsive)
      canvas = document.getElementById('gameCanvas');
      ctx = canvas.getContext('2d');

      function resize() {
        // match CSS size
        const rect = canvas.getBoundingClientRect();
        canvas.width = Math.max(300, Math.floor(rect.width));
        canvas.height = Math.max(200, Math.floor(rect.height));
        W = canvas.width; H = canvas.height;
      }
      window.addEventListener('resize', resize);
      resize();

      // place player on the first platform
      const p0 = platforms[1] || platforms[0];
      player.x = p0.x + 16;
      player.y = p0.y - player.h;

      // ensure canvas is focused to receive key events
      canvas.addEventListener('click', () => canvas.focus());
      canvas.focus();
      last = performance.now();
      requestAnimationFrame(loop);
    }
  };
})();