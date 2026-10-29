const W = 320;
const H = 180;
const ROUND_TIME = 60;

const C = {
  ink: '#0b0a16',
  ink2: '#141229',
  ink3: '#1e1a3a',
  paper: '#f3efe6',
  muted: '#a6a1c4',
  coin: '#ffc93c',
  neon: '#3cf0ff',
  hot: '#ff4f9a',
  lime: '#7dff8a',
};

const ART = {
  ship: [
    '...22...',
    '...22...',
    '..2112..',
    '.211112.',
    '21133112',
    '11111111',
    '.11..11.',
  ],
  zigzag: [
    '.1...1.',
    '..111..',
    '.12221.',
    '1122211',
    '1.222.1',
    '..1.1..',
  ],
  diver: [
    '..1.1..',
    '.12221.',
    '1122211',
    '.23332.',
    '..2.2..',
    '.1...1.',
  ],
  tank: [
    '.1...1.',
    '1111111',
    '1222221',
    '1233321',
    '1222221',
    '.11.11.',
  ],
  power: [
    '11111111',
    '12222221',
    '12333321',
    '12333321',
    '12333321',
    '12333321',
    '12222221',
    '11111111',
  ],
  heart: [
    '.11.11.',
    '1111111',
    '1111111',
    '.11111.',
    '..111..',
    '...1...',
  ],
};

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function hit(a, b, pad = 0) {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 + pad
    && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + pad;
}

function safeCall(fn, ...args) {
  if (typeof fn === 'function') {
    try { fn(...args); } catch (_) { /* The host callback should not stop play. */ }
  }
}

export function createGame(canvas, opts = {}) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new TypeError('createGame requires a canvas element');
  }

  const out = canvas.getContext('2d', { alpha: false });
  const buffer = document.createElement('canvas');
  buffer.width = W;
  buffer.height = H;
  const g = buffer.getContext('2d', { alpha: false });
  g.imageSmoothingEnabled = false;
  out.imageSmoothingEnabled = false;

  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const previousTouchAction = canvas.style.touchAction;
  const addedTabIndex = !canvas.hasAttribute('tabindex');
  if (addedTabIndex) canvas.tabIndex = 0;
  let reducedMotion = media.matches;
  let destroyed = false;
  let frame = 0;
  let last = performance.now();
  let state = 'idle';
  let inView = true;
  let tabVisible = !document.hidden;
  let manualPaused = false;
  let cssW = 1;
  let cssH = 1;
  let fit = { x: 0, y: 0, w: 1, h: 1 };

  let score = 0;
  let highScore = loadHighScore();
  let timeLeft = ROUND_TIME;
  let elapsed = 0;
  let spawnClock = 0;
  let powerClock = 8;
  let bossSpawned = false;
  let flash = 0;
  let shake = 0;
  let combo = 0;
  let comboClock = 0;
  let slowClock = 0;
  let spreadClock = 0;
  let achievements = new Set();

  const keys = new Set();
  const bullets = [];
  const bugs = [];
  const powers = [];
  const particles = [];
  const popups = [];
  const stars = makeStars();
  const player = {
    x: W / 2,
    y: H - 23,
    w: 12,
    h: 10,
    speed: 105,
    fireClock: 0,
    lives: 3,
    shield: 0,
    invuln: 0,
    pointer: false,
  };

  function loadHighScore() {
    try { return Number(localStorage.getItem('bug-blaster-high-score')) || 0; }
    catch (_) { return 0; }
  }

  function saveHighScore(value) {
    try { localStorage.setItem('bug-blaster-high-score', String(value)); }
    catch (_) { /* Storage may be unavailable in privacy modes. */ }
  }

  function play(name) {
    if (opts.sfx && typeof opts.sfx.play === 'function') {
      try { opts.sfx.play(name); } catch (_) { /* Audio is optional. */ }
    }
  }

  function setScore(next) {
    next = Math.max(0, Math.round(next));
    if (next === score) return;
    score = next;
    safeCall(opts.onScore, score);
  }

  function unlock(id, label) {
    if (achievements.has(id)) return;
    achievements.add(id);
    safeCall(opts.onAchievement, id, label);
  }

  function makeStars() {
    const list = [];
    for (let i = 0; i < 68; i += 1) {
      list.push({
        x: Math.random() * W,
        y: Math.random() * H,
        speed: 3 + Math.random() * 14,
        layer: 1 + Math.floor(Math.random() * 3),
      });
    }
    return list;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    cssW = Math.max(1, rect.width);
    cssH = Math.max(1, rect.height);
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const pixelW = Math.max(1, Math.round(cssW * dpr));
    const pixelH = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== pixelW || canvas.height !== pixelH) {
      canvas.width = pixelW;
      canvas.height = pixelH;
      out.imageSmoothingEnabled = false;
    }
    const scale = Math.min(pixelW / W, pixelH / H);
    fit.w = Math.max(1, Math.floor(W * scale));
    fit.h = Math.max(1, Math.floor(H * scale));
    fit.x = Math.floor((pixelW - fit.w) / 2);
    fit.y = Math.floor((pixelH - fit.h) / 2);
    render(performance.now() / 1000);
  }

  function pointerToGame(event) {
    const rect = canvas.getBoundingClientRect();
    const px = (event.clientX - rect.left) * (canvas.width / rect.width);
    const py = (event.clientY - rect.top) * (canvas.height / rect.height);
    return {
      x: (px - fit.x) * W / fit.w,
      y: (py - fit.y) * H / fit.h,
    };
  }

  function begin() {
    if (destroyed) return;
    try { canvas.focus({ preventScroll: true }); } catch (_) { canvas.focus(); }
    bullets.length = 0;
    bugs.length = 0;
    powers.length = 0;
    particles.length = 0;
    popups.length = 0;
    keys.clear();
    score = 0;
    safeCall(opts.onScore, score);
    timeLeft = ROUND_TIME;
    elapsed = 0;
    spawnClock = 0.65;
    powerClock = 7 + Math.random() * 3;
    bossSpawned = false;
    flash = 0;
    shake = 0;
    combo = 0;
    comboClock = 0;
    slowClock = 0;
    spreadClock = 0;
    achievements = new Set();
    Object.assign(player, {
      x: W / 2,
      y: H - 23,
      fireClock: 0,
      lives: 3,
      shield: 0,
      invuln: 0,
      pointer: false,
    });
    state = 'running';
    manualPaused = false;
    last = performance.now();
    play('start');
    ensureLoop();
  }

  function stop() {
    if (destroyed) return;
    state = 'idle';
    manualPaused = false;
    player.pointer = false;
    keys.clear();
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    render(performance.now() / 1000);
  }

  function active() {
    return state === 'running' && inView && tabVisible && !manualPaused;
  }

  function ensureLoop() {
    if (!frame && !destroyed) frame = requestAnimationFrame(loop);
  }

  function loop(now) {
    frame = 0;
    if (destroyed) return;
    const dt = Math.min(0.033, Math.max(0, (now - last) / 1000));
    last = now;
    if (active()) update(dt);
    render(now / 1000);
    if (state === 'running') ensureLoop();
  }

  function update(dt) {
    elapsed += dt;
    timeLeft = Math.max(0, ROUND_TIME - elapsed);
    flash = Math.max(0, flash - dt);
    shake = Math.max(0, shake - dt * 12);
    comboClock -= dt;
    slowClock = Math.max(0, slowClock - dt);
    spreadClock = Math.max(0, spreadClock - dt);
    player.invuln = Math.max(0, player.invuln - dt);
    player.fireClock -= dt;

    if (combo > 0 && comboClock <= 0) combo = 0;

    updateStars(dt);
    updatePlayer(dt);
    updateSpawns(dt);
    updateBullets(dt);
    updateBugs(dt);
    updatePowers(dt);
    updateEffects(dt);
    collisions();

    if (elapsed >= 40 && !bossSpawned) spawnBoss();
    if (timeLeft <= 0) finish(true);
  }

  function updateStars(dt) {
    for (const star of stars) {
      star.y += star.speed * dt * (slowClock > 0 ? 0.55 : 1);
      if (star.y > H) {
        star.y = -2;
        star.x = Math.random() * W;
      }
    }
  }

  function updatePlayer(dt) {
    let dx = 0;
    let dy = 0;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) dx -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) dx += 1;
    if (keys.has('ArrowUp') || keys.has('KeyW')) dy -= 1;
    if (keys.has('ArrowDown') || keys.has('KeyS')) dy += 1;
    if (dx && dy) {
      dx *= 0.707;
      dy *= 0.707;
    }
    player.x = clamp(player.x + dx * player.speed * dt, 10, W - 10);
    player.y = clamp(player.y + dy * player.speed * dt, H - 61, H - 15);
    if ((keys.has('Space') || player.pointer) && player.fireClock <= 0) fire();
  }

  function fire() {
    player.fireClock = spreadClock > 0 ? 0.12 : 0.16;
    if (spreadClock > 0) {
      bullets.push(makeBullet(player.x - 4, player.y - 8, -32));
      bullets.push(makeBullet(player.x, player.y - 9, 0));
      bullets.push(makeBullet(player.x + 4, player.y - 8, 32));
    } else {
      bullets.push(makeBullet(player.x, player.y - 9, 0));
    }
    play('shoot');
  }

  function makeBullet(x, y, vx) {
    return { x, y, vx, vy: -168, w: 2, h: 5, dead: false };
  }

  function updateSpawns(dt) {
    spawnClock -= dt;
    powerClock -= dt;
    if (spawnClock <= 0) {
      const roll = Math.random();
      const type = elapsed > 18 && roll > 0.76 ? 'tank'
        : elapsed > 8 && roll > 0.46 ? 'diver' : 'zigzag';
      spawnBug(type);
      const pace = Math.max(0.38, 1.03 - elapsed * 0.009);
      spawnClock = pace * (0.75 + Math.random() * 0.55);
    }
    if (powerClock <= 0) {
      spawnPower();
      powerClock = 10 + Math.random() * 5;
    }
  }

  function spawnBug(type) {
    const data = {
      zigzag: { hp: 1, speed: 20, score: 100, w: 11, h: 9 },
      diver: { hp: 1, speed: 28, score: 160, w: 11, h: 10 },
      tank: { hp: 3, speed: 11, score: 350, w: 13, h: 11 },
    }[type];
    bugs.push({
      ...data,
      type,
      maxHp: data.hp,
      x: 18 + Math.random() * (W - 36),
      y: -12,
      age: 0,
      phase: Math.random() * Math.PI * 2,
      baseX: 0,
      hurt: 0,
      dead: false,
    });
    bugs[bugs.length - 1].baseX = bugs[bugs.length - 1].x;
  }

  function spawnBoss() {
    bossSpawned = true;
    bugs.push({
      type: 'boss',
      x: W / 2,
      y: -25,
      w: 58,
      h: 26,
      hp: 45,
      maxHp: 45,
      score: 5000,
      speed: 8,
      age: 0,
      phase: 0,
      hurt: 0,
      dead: false,
    });
    popups.push({ x: W / 2, y: 46, text: 'MEMORY LEAK', color: C.hot, life: 2, max: 2, big: true });
  }

  function spawnPower() {
    const kind = ['PY', 'TS', 'SQL'][Math.floor(Math.random() * 3)];
    powers.push({
      kind,
      x: 20 + Math.random() * (W - 40),
      y: -10,
      w: kind === 'SQL' ? 19 : 15,
      h: 15,
      age: 0,
      dead: false,
    });
  }

  function updateBullets(dt) {
    for (const bullet of bullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      if (bullet.y < -8 || bullet.x < -4 || bullet.x > W + 4) bullet.dead = true;
    }
  }

  function updateBugs(dt) {
    const slow = slowClock > 0 ? 0.48 : 1;
    for (const bug of bugs) {
      bug.age += dt;
      bug.hurt = Math.max(0, bug.hurt - dt);
      if (bug.type === 'zigzag') {
        bug.y += bug.speed * dt * slow;
        bug.x = bug.baseX + Math.sin(bug.age * 5.2 + bug.phase) * 19;
      } else if (bug.type === 'diver') {
        bug.y += (bug.speed + bug.age * 3.2) * dt * slow;
        const steer = clamp(player.x - bug.x, -1, 1);
        bug.x += steer * 22 * dt * slow + Math.sin(bug.age * 8 + bug.phase) * 0.5;
      } else if (bug.type === 'tank') {
        bug.y += bug.speed * dt * slow;
        bug.x += Math.sin(bug.age * 2.2 + bug.phase) * 7 * dt;
      } else {
        bug.y = Math.min(38, bug.y + bug.speed * dt);
        bug.x = W / 2 + Math.sin(bug.age * 1.35) * 96;
      }
      if (bug.y > H + 18) {
        bug.dead = true;
        if (bug.type !== 'boss') hurtPlayer();
      }
    }
  }

  function updatePowers(dt) {
    const slow = slowClock > 0 ? 0.48 : 1;
    for (const power of powers) {
      power.age += dt;
      power.y += 21 * dt * slow;
      power.x += Math.sin(power.age * 3) * 8 * dt;
      if (power.y > H + 12) power.dead = true;
    }
  }

  function updateEffects(dt) {
    for (const p of particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
    }
    for (const popup of popups) {
      popup.life -= dt;
      popup.y -= 10 * dt;
    }
    prune(bullets);
    prune(bugs);
    prune(powers);
    prune(particles, (p) => p.life <= 0);
    prune(popups, (p) => p.life <= 0);
  }

  function prune(list, test = (item) => item.dead) {
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (test(list[i])) list.splice(i, 1);
    }
  }

  function collisions() {
    for (const bullet of bullets) {
      if (bullet.dead) continue;
      for (const bug of bugs) {
        if (bug.dead || !hit(bullet, bug, -1)) continue;
        bullet.dead = true;
        bug.hp -= 1;
        bug.hurt = 0.09;
        flash = 0.035;
        shake = reducedMotion ? 0 : Math.min(2.2, shake + 0.55);
        burst(bullet.x, bullet.y, bug.type === 'boss' ? C.hot : C.neon, 5);
        play('hit');
        if (bug.hp <= 0) killBug(bug);
        break;
      }
    }

    for (const power of powers) {
      if (!power.dead && hit(player, power, -1)) collectPower(power);
    }

    if (player.invuln <= 0) {
      for (const bug of bugs) {
        if (!bug.dead && hit(player, bug, bug.type === 'boss' ? -5 : -2)) {
          bug.dead = bug.type !== 'boss';
          hurtPlayer();
          break;
        }
      }
    }
  }

  function killBug(bug) {
    bug.dead = true;
    combo += 1;
    comboClock = 2.35;
    const earned = bug.score * combo;
    setScore(score + earned);
    const color = bug.type === 'boss' ? C.hot : C.coin;
    burst(bug.x, bug.y, color, bug.type === 'boss' ? 36 : 12);
    popups.push({
      x: bug.x,
      y: bug.y,
      text: combo > 1 ? `+${earned}  x${combo}` : `+${earned}`,
      color: combo >= 5 ? C.lime : C.coin,
      life: 1,
      max: 1,
    });
    if (!achievements.has('first_blood')) unlock('first_blood', 'Squashed your first bug');
    if (combo >= 10) {
      unlock('combo_10', 'Built a 10x combo');
      play('coin');
    }
    if (bug.type === 'boss') {
      unlock('boss_down', 'Patched the memory leak');
      popups.push({ x: W / 2, y: 64, text: 'LEAK PATCHED!', color: C.lime, life: 2.2, max: 2.2, big: true });
      shake = reducedMotion ? 0 : 5;
      play('coin');
    }
  }

  function collectPower(power) {
    power.dead = true;
    if (power.kind === 'PY') spreadClock = 12;
    if (power.kind === 'TS') player.shield = Math.min(2, player.shield + 1);
    if (power.kind === 'SQL') slowClock = 7;
    const label = power.kind === 'PY' ? 'SPREAD SHOT'
      : power.kind === 'TS' ? 'TYPE SHIELD' : 'SLOW QUERY';
    popups.push({ x: player.x, y: player.y - 13, text: label, color: C.lime, life: 1.4, max: 1.4 });
    burst(power.x, power.y, C.lime, 16);
    setScore(score + 250);
    play('power');
  }

  function hurtPlayer() {
    if (player.invuln > 0 || state !== 'running') return;
    if (player.shield > 0) {
      player.shield -= 1;
      player.invuln = 1;
      popups.push({ x: player.x, y: player.y - 12, text: 'SHIELD BLOCK', color: C.neon, life: 1, max: 1 });
      burst(player.x, player.y, C.neon, 14);
      play('hit');
      return;
    }
    player.lives -= 1;
    player.invuln = 1.65;
    combo = 0;
    shake = reducedMotion ? 0 : 4;
    burst(player.x, player.y, C.hot, 22);
    play('die');
    if (player.lives <= 0) finish(false);
  }

  function burst(x, y, color, amount) {
    const count = reducedMotion ? Math.min(4, amount) : amount;
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 18 + Math.random() * 58;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: 34,
        color,
        size: Math.random() > 0.7 ? 2 : 1,
        life: 0.28 + Math.random() * 0.42,
      });
    }
  }

  function finish(survived) {
    if (state !== 'running') return;
    state = 'over';
    player.pointer = false;
    keys.clear();
    if (survived) {
      unlock('survivor', 'Survived the 60 second round');
      setScore(score + player.lives * 1000);
      play('coin');
    }
    if (score > highScore) {
      highScore = score;
      saveHighScore(highScore);
    }
    safeCall(opts.onGameOver, score);
    render(performance.now() / 1000);
  }

  function render(now) {
    if (destroyed || !g || !out) return;
    g.save();
    g.fillStyle = C.ink;
    g.fillRect(0, 0, W, H);

    const sx = shake > 0 ? Math.round((Math.random() - 0.5) * shake * 2) : 0;
    const sy = shake > 0 ? Math.round((Math.random() - 0.5) * shake * 2) : 0;
    g.translate(sx, sy);
    drawBackground(now);

    if (state === 'idle') drawStart(now);
    else {
      drawWorld(now);
      drawHud();
      if (state === 'over') drawGameOver();
      else if (!active()) drawPaused();
    }
    g.restore();

    if (flash > 0) {
      g.fillStyle = 'rgba(243,239,230,0.18)';
      g.fillRect(0, 0, W, H);
    }
    drawScanlines();

    out.save();
    out.imageSmoothingEnabled = false;
    out.fillStyle = C.ink;
    out.fillRect(0, 0, canvas.width, canvas.height);
    out.drawImage(buffer, 0, 0, W, H, fit.x, fit.y, fit.w, fit.h);
    out.restore();
  }

  function drawBackground(now) {
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, C.ink);
    grd.addColorStop(1, C.ink2);
    g.fillStyle = grd;
    g.fillRect(-8, -8, W + 16, H + 16);

    for (const star of stars) {
      const twinkle = Math.sin(now * (2 + star.layer) + star.x) > 0.25;
      g.fillStyle = star.layer === 3 ? C.neon : star.layer === 2 ? C.muted : C.ink3;
      const size = star.layer === 3 && twinkle ? 2 : 1;
      g.fillRect(Math.floor(star.x), Math.floor(star.y), size, size);
    }

    g.strokeStyle = 'rgba(60,240,255,0.10)';
    g.lineWidth = 1;
    const horizon = 118;
    for (let x = -40; x < W + 40; x += 20) {
      g.beginPath();
      g.moveTo(W / 2, horizon);
      g.lineTo(x, H);
      g.stroke();
    }
    const drift = (now * 10) % 12;
    for (let y = horizon + drift; y < H + 12; y += 12) {
      g.beginPath();
      g.moveTo(0, Math.floor(y));
      g.lineTo(W, Math.floor(y));
      g.stroke();
    }
  }

  function drawWorld(now) {
    for (const bullet of bullets) {
      g.fillStyle = C.coin;
      g.fillRect(Math.round(bullet.x - 1), Math.round(bullet.y - 3), 2, 5);
      g.fillStyle = C.paper;
      g.fillRect(Math.round(bullet.x), Math.round(bullet.y - 3), 1, 2);
    }

    for (const bug of bugs) drawBug(bug, now);
    for (const power of powers) drawPower(power, now);
    for (const p of particles) {
      g.globalAlpha = clamp(p.life * 3, 0, 1);
      g.fillStyle = p.color;
      g.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    g.globalAlpha = 1;
    drawPlayer(now);

    for (const popup of popups) {
      const alpha = Math.min(1, popup.life * 3);
      text(popup.text, popup.x, popup.y, popup.color, popup.big ? 9 : 6, 'center', alpha);
    }
  }

  function drawBug(bug, now) {
    if (bug.type === 'boss') {
      drawBoss(bug, now);
      return;
    }
    const sprite = ART[bug.type];
    const palette = bug.hurt > 0
      ? [C.paper, C.paper, C.paper]
      : bug.type === 'tank'
        ? [C.hot, C.coin, C.paper]
        : bug.type === 'diver'
          ? [C.hot, C.neon, C.paper]
          : [C.hot, C.paper, C.coin];
    drawSprite(sprite, bug.x, bug.y, 2, palette);
    if (bug.type === 'tank') {
      const bw = 12;
      g.fillStyle = C.ink3;
      g.fillRect(Math.round(bug.x - bw / 2), Math.round(bug.y - 12), bw, 2);
      g.fillStyle = C.lime;
      g.fillRect(Math.round(bug.x - bw / 2), Math.round(bug.y - 12), Math.ceil(bw * bug.hp / bug.maxHp), 2);
    }
  }

  function drawBoss(boss, now) {
    const x = Math.round(boss.x);
    const y = Math.round(boss.y);
    const pulse = Math.sin(now * 5) > 0 ? 1 : 0;
    g.fillStyle = boss.hurt > 0 ? C.paper : C.hot;
    g.fillRect(x - 23, y - 9, 46, 18);
    g.fillRect(x - 27 - pulse, y - 5, 54 + pulse * 2, 10);
    g.fillRect(x - 18, y - 13, 36, 26);
    g.fillStyle = C.ink2;
    g.fillRect(x - 11, y - 4, 7, 6);
    g.fillRect(x + 5, y - 4, 7, 6);
    g.fillStyle = C.neon;
    g.fillRect(x - 9, y - 3, 3, 3);
    g.fillRect(x + 7, y - 3, 3, 3);
    g.fillStyle = C.ink;
    g.fillRect(x - 7, y + 6, 14, 2);
    for (let i = -2; i <= 2; i += 1) {
      const drip = ((now * (9 + i) + i * 3) % 8);
      g.fillStyle = i % 2 ? C.hot : C.ink3;
      g.fillRect(x + i * 10 - 2, y + 10, 5, 4 + drip);
    }
    g.fillStyle = C.ink3;
    g.fillRect(82, 16, 156, 4);
    g.fillStyle = C.hot;
    g.fillRect(83, 17, Math.floor(154 * boss.hp / boss.maxHp), 2);
    text('MEMORY LEAK', W / 2, 12, C.hot, 7, 'center');
  }

  function drawPower(power, now) {
    const colors = power.kind === 'PY' ? [C.coin, C.ink2, C.paper]
      : power.kind === 'TS' ? [C.neon, C.ink2, C.paper]
        : [C.lime, C.ink2, C.paper];
    const bob = Math.sin(now * 6 + power.x) > 0 ? 0 : 1;
    drawSprite(ART.power, power.x, power.y + bob, 2, colors);
    text(power.kind, power.x, power.y + 2 + bob, colors[2], power.kind === 'SQL' ? 4 : 5, 'center');
  }

  function drawPlayer(now) {
    if (player.invuln > 0 && Math.floor(now * 12) % 2 === 0) return;
    drawSprite(ART.ship, player.x, player.y, 2, [C.neon, C.paper, C.hot]);
    const flame = Math.floor(now * 12) % 2;
    g.fillStyle = flame ? C.coin : C.hot;
    g.fillRect(Math.round(player.x - 3), Math.round(player.y + 8), 2, 3 + flame * 2);
    g.fillRect(Math.round(player.x + 2), Math.round(player.y + 8), 2, 3 + flame * 2);
    if (player.shield > 0) {
      g.strokeStyle = C.neon;
      g.lineWidth = 1;
      g.strokeRect(Math.round(player.x - 11), Math.round(player.y - 10), 22, 21);
      g.fillStyle = C.paper;
      g.fillRect(Math.round(player.x - 11), Math.round(player.y - 10), 2, 2);
      g.fillRect(Math.round(player.x + 9), Math.round(player.y + 9), 2, 2);
    }
  }

  function drawHud() {
    g.fillStyle = 'rgba(11,10,22,0.76)';
    g.fillRect(0, 0, W, 12);
    text(String(score).padStart(6, '0'), 7, 8, C.coin, 7, 'left');
    text(`${Math.ceil(timeLeft).toString().padStart(2, '0')}s`, W / 2, 8, timeLeft < 10 ? C.hot : C.paper, 7, 'center');
    for (let i = 0; i < player.lives; i += 1) {
      drawSprite(ART.heart, W - 9 - i * 11, 7, 1, [C.hot, C.hot, C.hot]);
    }
    if (combo > 1) text(`COMBO x${combo}`, 7, 21, combo >= 10 ? C.lime : C.coin, 6, 'left');

    let statusX = W - 6;
    if (spreadClock > 0) {
      text(`PY ${Math.ceil(spreadClock)}`, statusX, 21, C.coin, 5, 'right');
      statusX -= 39;
    }
    if (slowClock > 0) text(`SQL ${Math.ceil(slowClock)}`, statusX, 21, C.lime, 5, 'right');
  }

  function panel(x, y, w, h) {
    g.fillStyle = 'rgba(11,10,22,0.92)';
    g.fillRect(x, y, w, h);
    g.strokeStyle = C.neon;
    g.lineWidth = 1;
    g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    g.fillStyle = C.coin;
    g.fillRect(x + 3, y + 3, 5, 2);
    g.fillRect(x + w - 8, y + h - 5, 5, 2);
  }

  function drawStart(now) {
    const titleY = 49;
    text('BUG', W / 2 - 1, titleY, C.hot, 18, 'center');
    text('BLASTER', W / 2, titleY + 19, C.neon, 18, 'center');
    text('60 SECOND DEBUG RUN', W / 2, titleY + 34, C.muted, 6, 'center');
    const blink = reducedMotion || Math.floor(now * 2) % 2 === 0;
    if (blink) text('PRESS SPACE / TAP TO START', W / 2, 125, C.coin, 7, 'center');
    text('MOVE: ARROWS / WASD     FIRE: SPACE', W / 2, 145, C.paper, 5, 'center');
    text('PY SPREAD   TS SHIELD   SQL SLOW', W / 2, 158, C.lime, 5, 'center');
    drawSprite(ART.zigzag, 42, 57, 2, [C.hot, C.paper, C.coin]);
    drawSprite(ART.ship, 277, 58, 2, [C.neon, C.paper, C.hot]);
  }

  function drawPaused() {
    panel(100, 69, 120, 39);
    text('PAUSED', W / 2, 85, C.coin, 11, 'center');
    text(manualPaused ? 'PRESS P TO RESUME' : 'RETURN TO RESUME', W / 2, 99, C.paper, 5, 'center');
  }

  function drawGameOver() {
    panel(70, 39, 180, 108);
    text(player.lives > 0 ? 'ROUND CLEAR' : 'SYSTEM CRASH', W / 2, 59, player.lives > 0 ? C.lime : C.hot, 11, 'center');
    text('SCORE', W / 2, 78, C.muted, 5, 'center');
    text(String(score).padStart(6, '0'), W / 2, 91, C.coin, 10, 'center');
    text(`HIGH  ${String(highScore).padStart(6, '0')}`, W / 2, 108, C.neon, 6, 'center');
    text('TAP / SPACE TO RETRY', W / 2, 129, C.paper, 6, 'center');
  }

  function drawSprite(matrix, cx, cy, scale, colors) {
    const rows = matrix.length;
    const cols = matrix[0].length;
    const ox = Math.round(cx - cols * scale / 2);
    const oy = Math.round(cy - rows * scale / 2);
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const n = Number(matrix[y][x]);
        if (!n) continue;
        g.fillStyle = colors[n - 1] || colors[0];
        g.fillRect(ox + x * scale, oy + y * scale, scale, scale);
      }
    }
  }

  function text(value, x, y, color, size, align = 'left', alpha = 1) {
    g.save();
    g.globalAlpha = alpha;
    g.fillStyle = color;
    g.font = `bold ${size}px monospace`;
    g.textAlign = align;
    g.textBaseline = 'alphabetic';
    g.fillText(value, Math.round(x), Math.round(y));
    g.restore();
  }

  function drawScanlines() {
    g.save();
    g.fillStyle = 'rgba(11,10,22,0.16)';
    for (let y = 1; y < H; y += 3) g.fillRect(0, y, W, 1);
    const vignette = g.createRadialGradient(W / 2, H / 2, 45, W / 2, H / 2, 190);
    vignette.addColorStop(0, 'rgba(11,10,22,0)');
    vignette.addColorStop(1, 'rgba(11,10,22,0.54)');
    g.fillStyle = vignette;
    g.fillRect(0, 0, W, H);
    g.restore();
  }

  function onKeyDown(event) {
    const controls = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyA', 'KeyD', 'KeyW', 'KeyS'];
    if (state === 'idle' || state === 'over') {
      if ((event.code === 'Space' || event.code === 'Enter')
        && document.activeElement === canvas && inView && tabVisible) {
        event.preventDefault();
        begin();
      }
      return;
    }
    if (state !== 'running' || !inView || !tabVisible || document.activeElement !== canvas) return;
    if (event.code === 'KeyP') {
      manualPaused = !manualPaused;
      keys.clear();
      player.pointer = false;
      last = performance.now();
      event.preventDefault();
      ensureLoop();
      return;
    }
    if (manualPaused) return;
    if (controls.includes(event.code)) {
      if (event.code.startsWith('Arrow') || event.code === 'Space') event.preventDefault();
      keys.add(event.code);
    }
  }

  function onKeyUp(event) {
    keys.delete(event.code);
  }

  function onPointerDown(event) {
    if (!inView || !tabVisible) return;
    try { canvas.focus({ preventScroll: true }); } catch (_) { canvas.focus(); }
    if (state === 'idle' || state === 'over') begin();
    if (!active()) return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    player.pointer = true;
    movePointer(event);
  }

  function movePointer(event) {
    if (!player.pointer || !active()) return;
    event.preventDefault();
    const p = pointerToGame(event);
    player.x = clamp(p.x, 10, W - 10);
    player.y = clamp(p.y, H - 61, H - 15);
  }

  function onPointerUp(event) {
    if (player.pointer) event.preventDefault();
    player.pointer = false;
  }

  function onBlur() {
    keys.clear();
    player.pointer = false;
  }

  function onVisibility() {
    tabVisible = !document.hidden;
    keys.clear();
    player.pointer = false;
    last = performance.now();
    if (tabVisible && state === 'running') ensureLoop();
  }

  function onMotionChange(event) {
    reducedMotion = event.matches;
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  const intersectionObserver = new IntersectionObserver((entries) => {
    inView = Boolean(entries[0] && entries[0].isIntersecting && entries[0].intersectionRatio > 0.05);
    keys.clear();
    player.pointer = false;
    last = performance.now();
    if (inView && state === 'running') ensureLoop();
  }, { threshold: [0, 0.05, 0.25] });
  intersectionObserver.observe(canvas);

  window.addEventListener('keydown', onKeyDown, { passive: false });
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisibility);
  canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  canvas.addEventListener('pointermove', movePointer, { passive: false });
  canvas.addEventListener('pointerup', onPointerUp, { passive: false });
  canvas.addEventListener('pointercancel', onPointerUp, { passive: false });
  canvas.addEventListener('blur', onBlur);
  media.addEventListener?.('change', onMotionChange);
  canvas.style.touchAction = 'none';
  resize();

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('visibilitychange', onVisibility);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', movePointer);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    canvas.removeEventListener('blur', onBlur);
    media.removeEventListener?.('change', onMotionChange);
    canvas.style.touchAction = previousTouchAction;
    if (addedTabIndex) canvas.removeAttribute('tabindex');
    keys.clear();
  }

  return { start: begin, stop, destroy };
}
