window.platformer = (function () {
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

    // 30% faster movement
    speed: 360 * 1.3, // 468

    jumpSpeed: -740,
    tileColor: "#2d6cdf",
    bgTop: "#4a1a1a",
    bgBottom: "#1a0a0a",
    flameSpeedCoefficient: 75,
  };

  const world = { width: 24000, height: 16000 };
  let platforms = [];
  let goal = { x: 2200, y: 200, w: 80, h: 80 };

  const player = {
    x: 100,
    y: 0,
    w: 36,
    h: 72,
    vx: 0,
    vy: 0,
    onGround: false,
    facing: 1,
    originalW: 36,
    originalH: 72,
    jumpCount: 2,

    // feel
    coyote: 0,
    jumpBuffer: 0,
  };

  const cam = { x: 0, y: 0 };
  let flame = { height: 0 };
  let flameDelayTimer = 1.5;
  let lastTime = 0,
    accum = 0;
  let fps = 60,
    frames = 0,
    fpsTimer = 0;

  // 'playing' | 'fire-pause' | 'won'
  let gameState = "playing";

  let platformImg = null;
  let fireImg = null;
  let headImg = null;
  let bgMusic = null;

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function shadeColor(hex, fraction) {
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    const nr = Math.min(255, Math.max(0, Math.floor(r + (255 - r) * fraction)));
    const ng = Math.min(255, Math.max(0, Math.floor(g + (255 - g) * fraction)));
    const nb = Math.min(255, Math.max(0, Math.floor(b + (255 - b) * fraction)));
    return (
      "#" +
      nr.toString(16).padStart(2, "0") +
      ng.toString(16).padStart(2, "0") +
      nb.toString(16).padStart(2, "0")
    );
  }

  function drawPlayer(ctx, p) {
    const skin = "#ffcc99";
    const cloth = "#3b82f6";
    const trim = "#1e40af";
    const outline = "#220000";

    const w = p.w,
      h = p.h;
    const headH = Math.max(6, Math.floor(h * 0.28));
    const torsoH = Math.max(8, Math.floor(h * 0.38));
    const legH = Math.max(8, Math.floor(h * 0.34));
    const armW = Math.max(4, Math.floor(w * 0.22));
    const x = Math.floor(p.x),
      y = Math.floor(p.y);

    ctx.fillStyle = "#2b2b2b";
    const legW = Math.max(6, Math.floor(w * 0.34));
    ctx.fillRect(x + Math.floor(w * 0.12), y + headH + torsoH, legW, legH);
    ctx.fillRect(x + Math.floor(w * 0.52), y + headH + torsoH, legW, legH);

    ctx.fillStyle = cloth;
    ctx.fillRect(x + Math.floor(w * 0.08), y + headH, Math.floor(w * 0.84), torsoH);
    ctx.fillStyle = trim;
    ctx.fillRect(
      x + Math.floor(w * 0.08),
      y + headH,
      Math.floor(w * 0.84),
      Math.max(2, Math.floor(torsoH * 0.18))
    );

    ctx.fillStyle = cloth;
    ctx.fillRect(x - armW + 2, y + headH + 2, armW, Math.max(6, torsoH - 4));
    ctx.fillRect(x + w - 2, y + headH + 2, armW, Math.max(6, torsoH - 4));

    const canDrawHeadImg = headImg && headImg.complete && headImg.naturalWidth > 0;
    if (canDrawHeadImg) {
      ctx.drawImage(headImg, x - Math.floor(w * 0.32), y - Math.floor(headH * 1.2), Math.floor(w * 1.28), headH * 2);
    } else {
      ctx.fillStyle = skin;
      ctx.fillRect(x + Math.floor(w * 0.18), y, Math.floor(w * 0.64), headH);
      ctx.fillStyle = "#111827";
      const eyeY = y + Math.floor(headH * 0.45);
      ctx.fillRect(x + Math.floor(w * 0.30), eyeY, Math.max(2, Math.floor(w * 0.08)), 2);
      ctx.fillRect(x + Math.floor(w * 0.58), eyeY, Math.max(2, Math.floor(w * 0.08)), 2);
    }

    ctx.strokeStyle = outline;
    ctx.lineWidth = 1;
    if (!canDrawHeadImg) {
      ctx.strokeRect(x + Math.floor(w * 0.18), y, Math.floor(w * 0.64), headH);
    }
    ctx.strokeRect(x + Math.floor(w * 0.08), y + headH, Math.floor(w * 0.84), torsoH);
    ctx.strokeRect(x + Math.floor(w * 0.12), y + headH + torsoH, legW, legH);
    ctx.strokeRect(x + Math.floor(w * 0.52), y + headH + torsoH, legW, legH);
  }

  // --- Hitbox shrink for sprite platforms (width only) ---
  function platformHitRect(p) {
    // Only shrink the green sprite platforms. Ground stays full width.
    if (p.color !== "#22c55e") return p;

    // Reduce width by ~50% (pad 25% on each side)
    const padX = Math.floor(p.w * 0.25);

    // Don't let it collapse too small
    const minW = Math.max(18, Math.floor(player.originalW * 1.2));
    const w2 = Math.max(minW, p.w - padX * 2);

    const x2 = p.x + Math.floor((p.w - w2) / 2);
    return { x: x2, y: p.y, w: w2, h: p.h };
  }

  // -------------------------
  // LEVEL GENERATION (terrace: early ramp + variable flats/ramps)
  // -------------------------
  function buildLevel() {
    const groundH = Math.max(28, Math.floor(player.originalH * 0.6));
    const groundY = world.height - groundH;

    platforms = [];
    platforms.push({ x: 0, y: groundY, w: world.width, h: groundH, color: "#0f1724", solid: true });

    const V = Math.abs(cfg.jumpSpeed);
    const maxJumpHeight = (V * V) / (2 * cfg.gravity);
    const totalAirTime = (2 * V) / cfg.gravity;
    const horizReach = cfg.speed * totalAirTime * 0.95;

    const vSpaceMin = Math.ceil(player.originalH * 1.25);

    let x = 120;
    let y = groundY - Math.floor(player.originalH * 1.0);

    const minBarW = Math.max(60, Math.floor(player.originalW * 2.6));
    const maxBarW = Math.max(100, Math.floor(minBarW * 1.9));

    // wave feel
    let wavePhase = Math.random() * Math.PI * 2;
    const waveStep = 0.85;
    const amp = clamp(maxJumpHeight * 0.85, player.originalH * 2.0, player.originalH * 6.5);

    const topBand = 60;
    const bottomBand = groundY - player.originalH * 1.4;

    // horizontal density
    const comfortReach = horizReach * 0.56;
    const dxMin = Math.floor(player.originalW * 1.0);
    const dxMax = Math.floor(Math.max(dxMin + 60, comfortReach));

    // per-step vertical limits (safety rails)
    const dyUpMax = Math.floor(maxJumpHeight * 0.85);
    const dyDownMax = Math.floor(maxJumpHeight * 0.55);

    // movement toward target
    const chase = 0.85;

    // smoothstep
    const ease = (u) => u * u * (3 - 2 * u);

    // base midline and terrace params
    const baseMidY = groundY - player.originalH * 7.5;

    // Early ramp (always happens)
    const earlyRampX = world.width * 0.18;
    const earlyRampClimb = player.originalH * 4.5;

    // Flats / ramps frequency
    const minFlatX = world.width * 0.025;
    const maxFlatX = world.width * 0.05;

    const minRampX = world.width * 0.045;
    const maxRampX = world.width * 0.085; // fixed length range

    // Ramp steepness
    const minRampClimb = player.originalH * 1.8;
    const maxRampClimb = player.originalH * 4.8;

    // segment state
    let segMode = "earlyRamp"; // "earlyRamp" | "flat" | "ramp"
    let segStartX = x;
    let segLenX = earlyRampX;
    let segStartClimb = 0;
    let segClimbAmt = earlyRampClimb;

    let totalClimbed = 0;

    function startFlat(nowX) {
      segMode = "flat";
      segStartX = nowX;
      segLenX = minFlatX + Math.random() * (maxFlatX - minFlatX);
      segStartClimb = totalClimbed;
      segClimbAmt = 0;
    }

    function startRamp(nowX) {
      segMode = "ramp";
      segStartX = nowX;
      segLenX = minRampX + Math.random() * (maxRampX - minRampX);
      segStartClimb = totalClimbed;
      segClimbAmt = minRampClimb + Math.random() * (maxRampClimb - minRampClimb);
    }

    // init early ramp segment
    segMode = "earlyRamp";
    segStartX = x;
    segLenX = earlyRampX;
    segStartClimb = 0;
    segClimbAmt = earlyRampClimb;

    while (x < world.width - 400) {
      const barW = Math.floor(minBarW + Math.random() * (maxBarW - minBarW + 1));
      const barH = Math.max(18, Math.floor(player.originalH * 0.35));

      platforms.push({
        x,
        y,
        w: barW,
        h: barH,
        color: "#22c55e",
        solid: true,
        fadeTimer: null,
        isFading: false,
      });

      // optional under platform
      if (Math.random() < 0.32) {
        const underGapMin = Math.floor(player.originalH * 2.2);
        const underGapMax = Math.floor(player.originalH * 5.2);
        const underGap = Math.floor(underGapMin + Math.random() * (underGapMax - underGapMin + 1));

        const barY2 = y + barH + underGap;
        const barW2 = Math.max(minBarW, Math.floor(barW * (0.9 + Math.random() * 0.25)));
        const bar2x = x + Math.floor((barW - barW2) / 2);

        if (barY2 < groundY - player.originalH * 1.0) {
          platforms.push({
            x: bar2x,
            y: barY2,
            w: barW2,
            h: Math.max(16, Math.floor(player.originalH * 0.35)),
            color: "#22c55e",
            solid: true,
            fadeTimer: null,
            isFading: false,
          });
        }
      }

      // next x
      const dx = Math.floor(dxMin + Math.random() * (dxMax - dxMin + 1));
      x += dx + Math.floor(Math.random() * Math.floor(barW * 0.12));

      // segment progression
      const segProgress = clamp((x - segStartX) / Math.max(1, segLenX), 0, 1);

      if (segMode === "earlyRamp") {
        totalClimbed = segStartClimb + segClimbAmt * ease(segProgress);
        if (segProgress >= 1) startFlat(x);
      } else if (segMode === "flat") {
        totalClimbed = segStartClimb;
        if (segProgress >= 1) startRamp(x);
      } else if (segMode === "ramp") {
        totalClimbed = segStartClimb + segClimbAmt * ease(segProgress);
        if (segProgress >= 1) {
          totalClimbed = segStartClimb + segClimbAmt;
          startFlat(x);
        }
      }

      const midY = baseMidY - totalClimbed;

      // wave around midline
      wavePhase += waveStep;
      const waveTargetY = midY + Math.sin(wavePhase) * amp;
      const toward = waveTargetY - y;

      // Bias depends on segment mode
      const noise = (Math.random() - 0.5) * player.originalH * 0.65;
      const biasUp =
        segMode === "flat"
          ? -(player.originalH * 0.18)
          : -(player.originalH * 0.42);

      let dy = toward * chase + noise + biasUp;
      dy = clamp(dy, -dyUpMax, dyDownMax);

      if (dy < 0) dy = Math.min(dy, -vSpaceMin * 0.35);

      const bigClimbChance = segMode === "ramp" ? 0.16 : 0.08;
      if (Math.random() < bigClimbChance) {
        dy = -Math.floor(dyUpMax * (0.75 + Math.random() * 0.25));
      }

      y = clamp(y + Math.floor(dy), topBand, bottomBand);
    }

    goal = {
      x: world.width - 360,
      y: Math.max(80, Math.floor(groundY - 12 * player.originalH)),
      w: Math.max(64, Math.floor(player.originalW * 2.5)),
      h: Math.max(64, Math.floor(player.originalH * 0.9)),
    };
  }

  function hideOverlays() {
    const win = document.getElementById("winOverlay");
    if (win) win.style.display = "none";
    const pause = document.getElementById("fireOverlay");
    if (pause) pause.style.display = "none";
  }

  function showWin() {
    const win = document.getElementById("winOverlay");
    if (win) win.style.display = "flex";
  }

  function showFire() {
    const pause = document.getElementById("fireOverlay");
    if (pause) pause.style.display = "flex";
  }

  // -------------------------
  // PHYSICS
  // -------------------------
  function physicsStep(dt) {
    let move = 0;
    if (keys["a"] || keys["arrowleft"]) move -= 1;
    if (keys["d"] || keys["arrowright"]) move += 1;

    const jumpHeld = !!(keys["w"] || keys["arrowup"] || keys[" "]);
    const prevJumpHeld = !!(prevKeys["w"] || prevKeys["arrowup"] || prevKeys[" "]);
    const jumpPressedEdge = jumpHeld && !prevJumpHeld;

    // jump buffer / coyote time
    const COYOTE_TIME = 0.10;
    const JUMP_BUFFER = 0.10;
    player.coyote = Math.max(0, player.coyote - dt);
    player.jumpBuffer = Math.max(0, player.jumpBuffer - dt);

    if (jumpPressedEdge) player.jumpBuffer = JUMP_BUFFER;
    if (player.onGround) player.coyote = COYOTE_TIME;

    player.vx = move * cfg.speed;
    if (move !== 0) player.facing = move;

    // buffered ground jump
    const canGroundJump = (player.onGround || player.coyote > 0) && player.jumpCount > 0;
    if (player.jumpBuffer > 0 && canGroundJump) {
      player.vy = cfg.jumpSpeed;
      player.onGround = false;
      player.coyote = 0;
      player.jumpBuffer = 0;
      player.jumpCount -= 1;
    } else if (jumpPressedEdge && player.jumpCount > 0) {
      // air jump rescue
      player.vy = cfg.jumpSpeed;
      player.onGround = false;
      player.jumpCount -= 1;
      player.jumpBuffer = 0;
    }

    // gravity + integrate
    player.vy += cfg.gravity * dt;
    player.x += player.vx * dt;

    const prevPlayerY = player.y;
    player.y += player.vy * dt;

    // bounds
    if (player.x < 0) player.x = 0;
    if (player.x + player.w > world.width) player.x = world.width - player.w;
    if (player.y > world.height + 200) respawn();

    // collisions
    player.onGround = false;
    for (let p of platforms) {
      if (!p.solid) continue;

      const hit = platformHitRect(p);

      if (rectsOverlap(player, hit)) {
        const dx = player.x + player.w / 2 - (hit.x + hit.w / 2);
        const px = (hit.w + player.w) / 2 - Math.abs(dx);

        const dy = player.y + player.h / 2 - (hit.y + hit.h / 2);
        const py = (hit.h + player.h) / 2 - Math.abs(dy);

        if (px > 0 && py > 0) {
          if (px < py) {
            player.x += dx > 0 ? px : -px;
            player.vx = 0;
          } else {
            const wasAbovePlatform = prevPlayerY + player.h <= hit.y;
            if (wasAbovePlatform) {
              player.y -= py;
              player.vy = 0;
              player.onGround = true;
            } else if (dy > 0) {
              player.y += py;
              player.vy = 0;
            }

            if (player.onGround && p.color === "#22c55e" && p.fadeTimer === null) {
              p.fadeTimer = 1.0;
            }
          }
        }
      }
    }

    if (player.onGround && !prevKeys.__onGround) player.jumpCount = 2;
    prevKeys.__onGround = player.onGround;

    // platform fades
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

    // flame rise
    if (flameDelayTimer > 0) {
      flameDelayTimer -= dt;
    } else {
      flame.height += cfg.flameSpeedCoefficient * dt;
    }

    // fire death
    const flameTop = world.height - flame.height;
    if (player.y + player.h > flameTop) {
      gameState = "fire-pause";
      showFire();
    }

    for (const k in keys) prevKeys[k] = keys[k];
  }

  function respawn() {
    buildLevel();
    const start = platforms[1] || platforms[0];
    player.x = start.x + 16;
    player.y = start.y - player.h - 2;
    player.vx = 0;
    player.vy = 0;
    player.onGround = false;
    player.jumpCount = 2;
    player.coyote = 0;
    player.jumpBuffer = 0;

    flame.height = 0;
    flameDelayTimer = 1.5;

    gameState = "playing";
    
    if (bgMusic && bgMusic.paused) {
      bgMusic.play().catch(() => {});
    }
    
    hideOverlays();
  }

  function render() {
    const targetX = clamp(player.x + player.w / 2 - W / 2, 0, world.width - W);
    const targetY = clamp(player.y + player.h / 2 - H / 2, 0, world.height - H);

    // snappier camera
    cam.x += (targetX - cam.x) * 0.20;
    cam.y += (targetY - cam.y) * 0.20;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, cfg.bgTop);
    g.addColorStop(1, cfg.bgBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(-Math.floor(cam.x), -Math.floor(cam.y));

    // platforms
    for (let p of platforms) {
      const color = p.color || cfg.tileColor;

      let alpha = 1.0;
      if (p.isFading && p.fadeTimer !== null) alpha = Math.max(0, p.fadeTimer);
      if (alpha <= 0 || !p.solid) continue;

      ctx.globalAlpha = alpha;

      const canDrawImg = platformImg && platformImg.complete && platformImg.naturalWidth > 0;

      if (p.color === "#22c55e" && canDrawImg) {
        const spriteScale = 1.5;
        const spriteH = Math.floor(p.h * spriteScale);
        const spriteYOffset = spriteH - p.h;
        ctx.drawImage(platformImg, p.x, p.y - spriteYOffset, p.w, spriteH);
      } else {
        ctx.fillStyle = color;
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.fillStyle = shadeColor(color, 0.18);
        ctx.fillRect(p.x, p.y, p.w, Math.min(6, p.h));
        ctx.strokeStyle = "rgba(0,0,0,0.3)";
        ctx.lineWidth = 1;
        ctx.strokeRect(p.x, p.y, p.w, p.h);
      }

      ctx.globalAlpha = 1.0;
    }

    // goal
    ctx.fillStyle = "#ffd700";
    ctx.fillRect(goal.x, goal.y, goal.w, goal.h);

    drawPlayer(ctx, player);

    ctx.restore();

    // -------------------------
    // FIRE VISUALS (draw fire.png where each triangle used to be)
    // -------------------------
    if (flameDelayTimer <= 0) {
      const flameBottomWorldY = world.height;
      const flameTopWorldY = world.height - flame.height;
      const flameBottomScreenY = flameBottomWorldY - cam.y;
      const flameTopScreenY = flameTopWorldY - cam.y;

      if (flameBottomScreenY > 0) {
        const triW = 80;
        const triH = 100;
        const triangleSpacing = triW * 0.56;

        const startScreenY = Math.max(0, flameTopScreenY);
        const endScreenY = Math.min(H, flameBottomScreenY);

        const canDrawFire = fireImg && fireImg.complete && fireImg.naturalWidth > 0;

        // shrink sprite to match triangle footprint
        const fireW = triW;
        const fireH = triH;

        // slight flicker/scroll like old chaotic fire
        const jitter = Math.sin(performance.now() * 0.01) * 2;

        for (let x = -triangleSpacing; x < W + triangleSpacing; x += triangleSpacing) {
          for (let screenY = startScreenY - triH; screenY < endScreenY + triH; screenY += triH * 0.6) {
            if (screenY > -triH && screenY < H) {
              if (canDrawFire) {
                // center the sprite where the triangle would be
                ctx.drawImage(
                  fireImg,
                  x - fireW / 2,
                  screenY + jitter,
                  fireW,
                  fireH
                );
              } else {
                // fallback: original triangle if sprite not loaded
                ctx.fillStyle = "rgba(220, 20, 20, 0.8)";
                ctx.beginPath();
                ctx.moveTo(x, screenY);
                ctx.lineTo(x - triW / 2, screenY + triH);
                ctx.lineTo(x + triW / 2, screenY + triH);
                ctx.closePath();
                ctx.fill();
              }
            }
          }
        }
      }
    }

    // small HUD
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(10, 10, 280, 30);
    ctx.font = "15px monospace";
    ctx.fillStyle = "#fff";
    ctx.fillText("A/D or ←/→ move • W/↑/Space jump", 16, 31);
  }

  function checkWin() {
    if (rectsOverlap(player, goal)) {
      gameState = "won";
      showWin();
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

    if (gameState === "playing") accum += ms;

    fpsTimer += ms;
    frames++;
    if (fpsTimer >= 500) {
      fps = (frames * 1000) / fpsTimer;
      frames = 0;
      fpsTimer = 0;
    }

    while (accum >= FIXED_DT * 1000) {
      physicsStep(FIXED_DT);
      accum -= FIXED_DT * 1000;
    }

    if (gameState === "playing") checkWin();
    render();
    requestAnimationFrame(frame);
  }

  return {
    init: function () {
      window.addEventListener("keydown", (e) => {
        const k = e.key.toLowerCase();
        keys[k] = true;

        if (k === "r" && (gameState === "fire-pause" || gameState === "won")) {
          respawn();
        }
      });

      window.addEventListener("keyup", (e) => {
        keys[e.key.toLowerCase()] = false;
      });

      canvas = document.getElementById("gameCanvas");
      ctx = canvas.getContext("2d");

      platformImg = new Image();
      platformImg.src = "assets/sprites/platform.png";

      fireImg = new Image();
      fireImg.src = "assets/sprites/fire.png";

      headImg = new Image();
      headImg.src = "assets/sprites/BigHead.png";

      bgMusic = new Audio();
      bgMusic.src = "assets/music/Ring_of_fire.mp3";
      bgMusic.loop = true;
      bgMusic.volume = 0.3;

      // Play music on first user interaction
      const playMusic = () => {
        bgMusic.play().catch(() => {});
        window.removeEventListener("keydown", playMusic);
        window.removeEventListener("click", playMusic);
      };
      window.addEventListener("keydown", playMusic);
      window.addEventListener("click", playMusic);

      function resize() {
        const rect = canvas.getBoundingClientRect();
        canvas.width = Math.max(300, Math.floor(rect.width));
        canvas.height = Math.max(200, Math.floor(rect.height));
        W = canvas.width;
        H = canvas.height;

        player.originalH = Math.max(28, Math.floor(H * 0.12));
        player.originalW = Math.max(14, Math.floor(player.originalH * 0.5));
        player.w = player.originalW;
        player.h = player.originalH;

        buildLevel();
      }

      window.addEventListener("resize", resize);
      resize();

      const start = platforms[1] || platforms[0];
      player.x = start.x + 16;
      player.y = start.y - player.h - 2;

      canvas.addEventListener("click", () => canvas.focus());
      canvas.setAttribute("tabindex", "0");
      canvas.focus();

      lastTime = 0;
      accum = 0;
      frames = 0;
      fpsTimer = 0;
      hideOverlays();
      requestAnimationFrame(frame);
    },
  };
})();
