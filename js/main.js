import { player, stats, about, inventory, quests, levels, achievements } from './data.js';
import { sfx } from './audio.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// --- Persistence (best effort; private windows may block storage) -------------
const store = {
  get(k, d) { try { const v = localStorage.getItem('bhav:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('bhav:' + k, JSON.stringify(v)); } catch { /* ignore */ } },
};

function storedNumber(key) {
  const value = Number(store.get(key, 0));
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function storedList(key) {
  const value = store.get(key, []);
  return Array.isArray(value) ? value : [];
}

const state = {
  score: storedNumber('score'),
  unlocked: new Set(storedList('ach')),
  played: new Set(storedList('played')),
  seen: new Set(),
};

// --- Score + achievements ------------------------------------------------------
const scoreEl = $('#score');
function renderScore() { scoreEl.textContent = String(state.score).padStart(6, '0'); }
function addScore(n, x, y) {
  state.score += n;
  store.set('score', state.score);
  renderScore();
  scoreEl.classList.remove('bump');
  void scoreEl.offsetWidth;
  scoreEl.classList.add('bump');
  if (x != null) floatPoints(`+${n}`, x, y);
  world?.setHiScore(state.score);
}
function floatPoints(text, x, y) {
  const el = document.createElement('div');
  el.className = 'float-pts';
  el.textContent = text;
  el.style.left = `${x - 20}px`;
  el.style.top = `${y - 20}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 950);
}

const toasts = $('.toasts');
function toast(kicker, text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span class="toast-icon"></span><span><span class="toast-k"></span><span class="toast-t"></span></span>`;
  $('.toast-k', el).textContent = kicker;
  $('.toast-t', el).textContent = text;
  toasts.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 3200);
}

function unlock(id, label) {
  if (state.unlocked.has(id)) return;
  state.unlocked.add(id);
  store.set('ach', [...state.unlocked]);
  toast('Achievement unlocked', label || achievements[id] || id);
  sfx.play('achievement');
  addScore(500);
  renderTrophies();
}
function renderTrophies() {
  $('#trophy-count').textContent = state.unlocked.size;
  $('#ach-count').textContent = state.unlocked.size;
  $('.ach-list').innerHTML = '';
  Object.entries(achievements).forEach(([id, label]) => {
    const li = document.createElement('li');
    const got = state.unlocked.has(id);
    li.className = got ? 'got' : '';
    li.textContent = got ? label : '???';
    $('.ach-list').appendChild(li);
  });
}

// --- Pixel sprites -----------------------------------------------------------------
function drawPixels(canvas, rows, palette, scale, ox = 0, oy = 0, clear = true) {
  const g = canvas.getContext('2d');
  if (clear) g.clearRect(0, 0, canvas.width, canvas.height);
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const c = palette[ch];
      if (!c) return;
      g.fillStyle = c;
      g.fillRect(ox + x * scale, oy + y * scale, scale, scale);
    });
  });
}

// A visored "dev knight": helmet, glowing visor, gold cape, laptop in hand.
const HERO = [
  '......kkkk......',
  '....kkHHHHkk....',
  '...kHHhhhhHHk...',
  '..kHhhhhhhhhHk..',
  '..khvvvvvvvvhk..',
  '..khvvvvvvvvhk..',
  '..khhhhhhhhhhk..',
  '...kkhhhhhhkk...',
  '..kccbbbbbbcck..',
  '.kcCbbbbbbbbCck.',
  '.kcCbBbbbbBbCck.',
  '.kckkkkkkkkkkck.',
  '.kckllllllllkck.',
  '.kcklgglllllkck.',
  '.kckkkkkkkkkkck.',
  '.kCcbbBBBBbbcCk.',
  '..kkbbbkkbbbkk..',
  '...kBBk..kBBk...',
  '...kBBk..kBBk...',
  '..kkkkk..kkkkk..',
];
const HERO_PAL = {
  k: '#0b0a16', H: '#6b62a8', h: '#3a3460', v: '#3cf0ff', w: '#f3efe6',
  c: '#ffc93c', C: '#b8860b', b: '#ff4f9a', B: '#b8336e', l: '#a6a1c4', g: '#7dff8a',
};

function animateHero(canvas) {
  const scale = 9;
  const ox = (canvas.width - 16 * scale) / 2;
  let t = 0;
  const tick = () => {
    t++;
    const bob = reduceMotion ? 0 : (Math.floor(t / 30) % 2) * scale * 0.5;
    const rows = HERO.slice();
    // visor scan: a white glint sweeping across the visor
    const gx = 4 + (Math.floor(t / 6) % 14);
    if (gx < 12) rows[4] = rows[4].slice(0, gx) + 'w' + rows[4].slice(gx + 1);
    // cape flutter
    if (!reduceMotion && Math.floor(t / 20) % 2) rows[15] = '.CCcbbBBBBbbcCC.';
    drawPixels(canvas, rows, HERO_PAL, scale, ox, 8 + bob);
    if (!reduceMotion || t < 2) requestAnimationFrame(tick);
  };
  tick();
}

const CART_ART = {
  wgdss: ['....XXXX..', '...XXXX...', '..XXXX....', '.XXXXXXXX.', '....XXXX..', '...XXXX...', '..XXX.....', '.XX.......', 'X.........'],
  gridbridge: ['X........X', 'XX......XX', 'X.XX..XX.X', 'X...XX...X', 'XXXXXXXXXX', 'X..X..X..X', 'X..X..X..X', 'wwwwwwwwww'],
  agentproof: ['.XXXXXXXX.', 'X........X', 'X......X.X', 'X.....XX.X', 'X.X..XX..X', 'X.XXXX...X', 'X..XX....X', 'X........X', '.XXXXXXXX.'],
  storm: ['...wwww...', '.wwwwwwww.', 'wwwwwwwwww', '.wwwwwwww.', '....XX....', '...XX.....', '..XXXX....', '....XX....', '...XX.....'],
  media: ['XXXX......', 'XXXXXXXXXX', 'X........X', 'X.ww..ww.X', 'X.ww..ww.X', 'X........X', 'X........X', 'XXXXXXXXXX'],
  faithquote: ['..XXXXXX..', '..X....X..', '..X.ww.X..', '..XwwwwX..', '..X.ww.X..', '..X....X..', '..X....X..', '..XXXXXX..'],
  nailcove: ['....ww....', '....ww....', '...wwww...', '...wwww...', '..XXXXXX..', '.XXXXXXXX.', '.XXwXXXXX.', '.XXwXXXXX.', '.XXXXXXXX.', '..XXXXXX..'],
  football: ['...wwww...', '..wwkkww..', '.wwkkkkww.', '.wwwkkwww.', '.kwwwwwwk.', '.kkwwwwkk.', '..wwwwww..', '...wwww...'],
};

// --- Boot screen ---------------------------------------------------------------------
const boot = $('#boot');
const BOOT_LINES = ['BHAV-OS v2.6 (c) 2026', 'CHECKING RAM ....... 64K OK', 'LOADING SPRITES .... OK', 'CALIBRATING NEON ... OK', 'SPAWNING PLAYER 1 .. OK', ''];
const bootSiblings = [...document.body.children].filter((el) => el !== boot && el.tagName !== 'SCRIPT');

function setPageInert(inert) {
  bootSiblings.forEach((el) => { el.inert = inert; });
}

function runBoot() {
  let seen = false;
  try { seen = sessionStorage.getItem('bhav:booted') === '1'; } catch { /* ignore */ }
  if (seen || reduceMotion) {
    boot.classList.add('hidden');
    return Promise.resolve();
  }
  setPageInert(true);
  document.body.style.overflow = 'hidden';
  const log = $('.boot-log');
  let i = 0;
  let finished = false;
  let stepTimer = 0;
  return new Promise((resolve) => {
    const step = () => {
      if (finished) return;
      if (i < BOOT_LINES.length) {
        log.textContent += BOOT_LINES[i++] + '\n';
        stepTimer = setTimeout(step, 180);
      } else {
        boot.classList.add('ready');
        $('.boot-start').focus({ preventScroll: true });
      }
    };
    step();
    const start = () => {
      if (finished) return;
      finished = true;
      clearTimeout(stepTimer);
      try { sessionStorage.setItem('bhav:booted', '1'); } catch { /* ignore */ }
      document.removeEventListener('keydown', onKey);
      $('.boot-start').removeEventListener('click', start);
      boot.classList.add('done');
      setPageInert(false);
      document.body.style.overflow = '';
      $('.hero-ctas .btn').focus({ preventScroll: true });
      sfx.play('start');
      world?.kick(2.5);
      setTimeout(() => boot.classList.add('hidden'), 650);
      unlock('start');
      resolve();
    };
    const onKey = (e) => {
      if (!boot.classList.contains('ready')) return;
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); start(); }
    };
    document.addEventListener('keydown', onKey);
    $('.boot-start').addEventListener('click', start, { once: true });
  });
}

// --- Hero ----------------------------------------------------------------------------------
function typeTagline() {
  const el = $('.hero-sub');
  const text = player.tagline;
  if (reduceMotion) { el.textContent = text; return; }
  let i = 0;
  const caret = '<span class="caret" aria-hidden="true"></span>';
  el.setAttribute('aria-label', text);
  const step = () => {
    el.innerHTML = '';
    el.append(text.slice(0, i));
    el.insertAdjacentHTML('beforeend', caret);
    if (i++ < text.length) setTimeout(step, 22 + Math.random() * 30);
  };
  step();
}

// --- About -------------------------------------------------------------------------------
function renderAbout() {
  $('.char-name').textContent = player.name;
  $('.char-class').textContent = player.title;
  $('.about-text').append(...about.map((p) => Object.assign(document.createElement('p'), { textContent: p })));
  const dl = $('.stat-list');
  stats.forEach(({ label, value }) => {
    const d = document.createElement('div');
    d.innerHTML = '<dt></dt><dd></dd>';
    d.firstChild.textContent = label;
    d.lastChild.textContent = value;
    dl.appendChild(d);
  });
  animateHero($('.char-sprite'));
}

// --- Inventory ----------------------------------------------------------------------------
function renderInventory() {
  const tabs = $('.inv-tabs');
  const grid = $('.inv-grid');
  const detail = {
    icon: $('.inv-detail-icon'), name: $('.inv-detail-name'), lvl: $('.inv-detail-lvl'), hint: $('.inv-detail-hint'),
  };
  const LV = ['', 'Novice', 'Apprentice', 'Adept', 'Expert', 'Main weapon'];

  function show(item, slot) {
    $$('.slot', grid).forEach((s) => s.classList.toggle('sel', s === slot));
    detail.icon.textContent = item.glyph;
    detail.name.textContent = item.name;
    detail.lvl.textContent = `${'■'.repeat(item.lvl)}${'□'.repeat(5 - item.lvl)} ${LV[item.lvl]}`;
    detail.hint.textContent = '';
  }

  function openGroup(gi) {
    $$('.inv-tab', tabs).forEach((t, i) => {
      const selected = i === gi;
      t.setAttribute('aria-selected', String(selected));
      t.tabIndex = selected ? 0 : -1;
    });
    grid.setAttribute('aria-labelledby', `inventory-tab-${gi}`);
    grid.innerHTML = '';
    inventory[gi].items.forEach((item, i) => {
      const b = document.createElement('button');
      b.className = 'slot';
      b.type = 'button';
      b.style.setProperty('--i', i);
      b.setAttribute('aria-label', `${item.name}, ${LV[item.lvl]}`);
      b.innerHTML = `<span class="slot-glyph"></span><span class="slot-pips">${Array.from({ length: 5 }, (_, k) => `<i class="${k < item.lvl ? 'on' : ''}"></i>`).join('')}</span>`;
      $('.slot-glyph', b).textContent = item.glyph;
      b.addEventListener('mouseenter', () => { show(item, b); sfx.play('hover'); });
      b.addEventListener('focus', () => show(item, b));
      b.addEventListener('click', () => { show(item, b); sfx.play('select'); });
      grid.appendChild(b);
    });
    const first = inventory[gi].items[0];
    show(first, grid.firstChild);
  }

  inventory.forEach((g, i) => {
    const t = document.createElement('button');
    t.className = 'inv-tab';
    t.type = 'button';
    t.role = 'tab';
    t.id = `inventory-tab-${i}`;
    t.setAttribute('aria-controls', 'inventory-panel');
    t.textContent = g.group;
    t.addEventListener('click', () => { openGroup(i); sfx.play('select'); });
    t.addEventListener('keydown', (e) => {
      const last = inventory.length - 1;
      const next = e.key === 'ArrowRight' ? (i + 1) % inventory.length
        : e.key === 'ArrowLeft' ? (i + last) % inventory.length
          : e.key === 'Home' ? 0 : e.key === 'End' ? last : null;
      if (next == null) return;
      e.preventDefault();
      openGroup(next);
      tabs.children[next].focus();
    });
    tabs.appendChild(t);
  });
  openGroup(0);
}

// --- Quests ---------------------------------------------------------------------------------
function renderQuests() {
  const list = $('.quest-list');
  quests.forEach((q, i) => {
    const li = document.createElement('li');
    li.className = 'quest reveal' + (i < 2 ? ' open' : '');
    li.dataset.status = q.status;
    li.style.setProperty('--i', i);
    const id = `quest-${i}`;
    li.innerHTML = `
      <button class="quest-btn" type="button" aria-expanded="${i < 2}" aria-controls="${id}">
        <span class="quest-badge"></span>
        <span class="quest-when"></span>
        <span class="quest-title"></span>
        <span class="quest-org"></span>
        <span class="quest-toggle"></span>
      </button>
      <div class="quest-loot" id="${id}"><div><ul></ul></div></div>`;
    $('.quest-badge', li).textContent = q.status;
    $('.quest-when', li).textContent = q.when;
    $('.quest-title', li).textContent = q.title;
    $('.quest-org', li).textContent = q.org;
    const toggle = $('.quest-toggle', li);
    const setLabel = () => { toggle.textContent = li.classList.contains('open') ? '- Hide loot' : `+ Show loot (${q.loot.length})`; };
    setLabel();
    q.loot.forEach((l) => $('ul', li).appendChild(Object.assign(document.createElement('li'), { textContent: l })));
    $('.quest-btn', li).addEventListener('click', (e) => {
      const open = li.classList.toggle('open');
      e.currentTarget.setAttribute('aria-expanded', String(open));
      setLabel();
      sfx.play(open ? 'select' : 'back');
    });
    list.appendChild(li);
  });
}

// --- Level select -----------------------------------------------------------------------------
const modal = $('#level-modal');
let levelOpening = false;

function renderLevels() {
  const wrap = $('.carts');
  $('#levels-total').textContent = levels.length;
  levels.forEach((lv, i) => {
    const holder = document.createElement('div');
    holder.className = 'cart-wrap reveal';
    holder.role = 'listitem';
    holder.style.setProperty('--i', i);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cart' + (state.played.has(lv.id) ? ' played' : '');
    b.style.setProperty('--c', lv.color);
    b.setAttribute('aria-label', `${lv.name}: ${lv.subtitle}. Open details.`);
    b.innerHTML = `
      <span class="cart-shell">
        <span class="cart-label">
          <canvas class="cart-art" width="100" height="100" aria-hidden="true"></canvas>
          <span class="cart-world"></span>
          <span class="cart-played">Cleared</span>
          <span class="cart-text"><span class="cart-name"></span><span class="cart-sub"></span></span>
        </span>
        <span class="cart-shine"></span>
      </span>
      <span class="cart-shadow"></span>`;
    $('.cart-world', b).textContent = `W ${lv.world}`;
    $('.cart-name', b).textContent = lv.name;
    $('.cart-sub', b).textContent = lv.subtitle;
    const art = CART_ART[lv.id];
    const cv = $('.cart-art', b);
    const sc = Math.floor(100 / Math.max(art.length, art[0].length));
    drawPixels(cv, art, { X: lv.color, w: '#f3efe6', k: '#0b0a16' }, sc,
      (100 - art[0].length * sc) / 2, (100 - art.length * sc) / 2);

    // 3D tilt following the pointer
    if (!reduceMotion) {
      b.addEventListener('pointermove', (e) => {
        const r = b.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        b.style.setProperty('--ry', `${(px - 0.5) * 22}deg`);
        b.style.setProperty('--rx', `${(0.5 - py) * 18}deg`);
        b.style.setProperty('--mx', `${px * 100}%`);
        b.style.setProperty('--my', `${py * 100}%`);
      });
      b.addEventListener('pointerleave', () => {
        b.style.setProperty('--rx', '0deg');
        b.style.setProperty('--ry', '0deg');
      });
    }
    b.addEventListener('pointerenter', () => sfx.play('hover'));
    b.addEventListener('click', () => openLevel(lv, b));
    holder.appendChild(b);
    wrap.appendChild(holder);
  });
  updatePlayed();
}

function updatePlayed() {
  $('#levels-played').textContent = state.played.size;
}

function openLevel(lv, cartEl) {
  if (levelOpening || modal.open) return;
  levelOpening = true;
  sfx.play('coin');
  const go = () => {
    const inner = $('.lm-inner', modal);
    inner.style.setProperty('--c', lv.color);
    $('.lm-world', modal).textContent = `World ${lv.world}`;
    $('.lm-name', modal).textContent = lv.name;
    $('.lm-sub', modal).textContent = lv.subtitle;
    $('.lm-blurb', modal).textContent = lv.blurb;
    const det = $('.lm-details', modal);
    det.innerHTML = '';
    lv.details.forEach((d) => det.appendChild(Object.assign(document.createElement('li'), { textContent: d })));
    const st = $('.lm-stack', modal);
    st.innerHTML = '';
    lv.stack.forEach((s) => st.appendChild(Object.assign(document.createElement('li'), { textContent: s })));
    $('.lm-boss', modal).innerHTML = '<b>Final boss:</b> ';
    $('.lm-boss', modal).append(lv.boss);
    const links = $('.lm-links', modal);
    links.innerHTML = '';
    lv.links.forEach((l) => {
      const a = Object.assign(document.createElement('a'), { className: 'btn btn-coin', href: l.href, target: '_blank', rel: 'noopener', textContent: l.label });
      links.appendChild(a);
    });
    if (lv.note) links.appendChild(Object.assign(document.createElement('p'), { className: 'lm-note', textContent: lv.note }));
    modal.showModal();
    levelOpening = false;

    if (!state.played.has(lv.id)) {
      state.played.add(lv.id);
      store.set('played', [...state.played]);
      cartEl.classList.add('played');
      addScore(250);
      updatePlayed();
      unlock('cartridge');
      if (state.played.size === levels.length) unlock('all_levels');
    }
  };
  if (reduceMotion) return go();
  cartEl.classList.add('inserting');
  setTimeout(() => { cartEl.classList.remove('inserting'); go(); }, 420);
}

function wireModals() {
  [modal, $('#ach-modal')].forEach((d) => {
    $('.lm-close', d).addEventListener('click', () => { d.close(); sfx.play('back'); });
    d.addEventListener('click', (e) => { if (e.target === d) { d.close(); sfx.play('back'); } });
  });
  $('#trophies').addEventListener('click', () => { renderTrophies(); $('#ach-modal').showModal(); sfx.play('select'); });
}

// --- Contact / continue -------------------------------------------------------------------------
function renderContact() {
  const email = $('#email-btn');
  email.href = `mailto:${player.email}`;
  email.addEventListener('click', async () => {
    sfx.play('coin');
    try {
      await navigator.clipboard.writeText(player.email);
      $('.copy-note').textContent = `${player.email} copied to clipboard`;
    } catch {
      $('.copy-note').textContent = player.email;
    }
  });
  $('#gh-btn').href = player.github;
  $('#li-btn').href = player.linkedin;
  $('#year').textContent = new Date().getFullYear();

  // the classic continue countdown, played once each time the section comes into view
  const cd = $('.countdown');
  let timer = null;
  const run = () => {
    clearInterval(timer);
    let n = 9;
    cd.classList.remove('done');
    cd.textContent = n;
    if (reduceMotion) { cd.textContent = 'Press Email to continue'; cd.classList.add('done'); return; }
    timer = setInterval(() => {
      n--;
      if (n < 0) {
        clearInterval(timer);
        cd.textContent = 'No game over here. Say hi anyway.';
        cd.classList.add('done');
        return;
      }
      cd.textContent = n;
      cd.classList.remove('tick');
      void cd.offsetWidth;
      cd.classList.add('tick');
      sfx.play('hover');
    }, 800);
  };
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting) run(); else clearInterval(timer);
  }, { threshold: 0.5 }).observe(cd);
}

// Section titles "decode" from random glyphs as they arrive, like a cartridge loading.
const GLYPHS = '#$%&*+=?@ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
function scramble(el) {
  if (reduceMotion) return;
  const final = el.textContent;
  el.setAttribute('aria-label', final);
  let frame = 0;
  const total = 18;
  const tick = () => {
    frame++;
    const done = Math.floor((frame / total) * final.length);
    el.textContent = [...final].map((ch, i) => (i < done || ch === ' ' ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0])).join('');
    if (frame < total) setTimeout(tick, 32); else el.textContent = final;
  };
  tick();
}

// --- Nav, reveal, section tracking ------------------------------------------------------------------
function wireNav() {
  const links = $$('.hud-nav a');
  const mobile = $('#mobile-nav');
  mobile.append(...links.map((a) => a.cloneNode(true)));
  const menu = $('#menu');
  menu.addEventListener('click', () => {
    const open = mobile.hidden;
    mobile.hidden = !open;
    menu.setAttribute('aria-expanded', String(open));
    sfx.play(open ? 'select' : 'back');
  });
  mobile.addEventListener('click', (e) => { if (e.target.closest('a')) { mobile.hidden = true; menu.setAttribute('aria-expanded', 'false'); } });
  mobile.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    mobile.hidden = true;
    menu.setAttribute('aria-expanded', 'false');
    menu.focus();
  });

  const sectionObs = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const id = e.target.dataset.section;
      links.forEach((a) => a.classList.toggle('active', a.dataset.nav === id));
      if (!state.seen.has(id)) {
        state.seen.add(id);
        if (id !== 'start') { addScore(100); unlock(id); }
      }
    });
  }, { rootMargin: '-45% 0px -45% 0px' });
  $$('[data-section]').forEach((s) => sectionObs.observe(s));

  const revealObs = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      revealObs.unobserve(e.target);
      const title = e.target.querySelector('.sec-title');
      if (title) scramble(title);
    });
  }, { threshold: 0.12 });
  $$('.reveal').forEach((el) => revealObs.observe(el));

  $$('a[href^="#"]').forEach((a) => a.addEventListener('click', () => { sfx.play('select'); world?.kick(1.5); }));
}

// --- Sound -----------------------------------------------------------------------------------------
function wireSound() {
  const btn = $('#sound');
  const set = (on) => {
    sfx.setEnabled(on);
    btn.setAttribute('aria-pressed', String(sfx.enabled));
    store.set('sound', sfx.enabled);
  };
  btn.addEventListener('click', () => {
    set(!sfx.enabled);
    if (sfx.enabled) { sfx.play('coin'); unlock('sound'); }
  });
  // remembered preference applies after the first user gesture (autoplay policy)
  if (store.get('sound', false)) {
    btn.setAttribute('aria-pressed', 'true');
    addEventListener('pointerdown', () => set(true), { once: true });
  }
}

// --- Konami code ----------------------------------------------------------------------------------
function wireKonami() {
  const seq = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  let pos = 0;
  addEventListener('keydown', (e) => {
    if (gameActive) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    pos = k === seq[pos] ? pos + 1 : (k === seq[0] ? 1 : 0);
    if (pos === seq.length) {
      pos = 0;
      const on = !document.documentElement.classList.contains('konami');
      document.documentElement.classList.toggle('konami', on);
      world?.setPalette(on ? 'konami' : 'normal');
      world?.kick(3);
      sfx.play('konami');
      toast(on ? 'Cheat activated' : 'Cheat off', on ? 'Turbo mode. Enter it again to turn it off.' : 'Back to normal');
      unlock('konami');
    }
  });
}

// --- 3D world ---------------------------------------------------------------------------------------
let world = null;
async function startWorld() {
  try {
    const { initScene } = await import('./scene.js');
    world = initScene($('#world'), {
      reducedMotion: reduceMotion,
      onCoin: (n, x, y) => {
        sfx.play('coin');
        addScore(50, x, y);
        if (n === 1) toast('Coin get', 'Coins are worth 50 points');
        if (n === 8) unlock('coins', 'Collected 8 coins');
      },
    });
    world?.setHiScore(state.score);
    if (document.documentElement.classList.contains('konami')) world?.setPalette('konami');
  } catch (err) {
    // WebGL or CDN unavailable: the CSS gradient behind #world still looks fine.
    console.warn('3D world unavailable', err);
  }
  setTimeout(() => $('.coin-hint').classList.add('show'), 4000);

  addEventListener('click', (e) => {
    if (!world || e.target.closest('a, button, input, dialog, .dialog, .inv-wrap, .quest, .cabinet-screen, .cart')) return;
    world.click(e);
  });
}

// --- Mini game ---------------------------------------------------------------------------------------
let gameActive = false;
async function startGame() {
  const canvas = $('#game');
  const best = $('#best');
  best.textContent = storedNumber('best');
  try {
    const { createGame } = await import('./game.js');
    const game = createGame(canvas, {
      sfx,
      onScore: () => { gameActive = true; },
      onGameOver: (final) => {
        gameActive = false;
        if (final > storedNumber('best')) { store.set('best', final); best.textContent = final; }
        if (final > 0) addScore(Math.round(final / 10));
      },
      onAchievement: (id, label) => unlock(id, label),
    });
    // first time the cabinet scrolls into view counts as finding the bonus stage
    new IntersectionObserver(([e], o) => { if (e.isIntersecting) { unlock('bonus'); o.disconnect(); } }, { threshold: 0.6 }).observe(canvas);
    window.__game = game;
  } catch (err) {
    console.warn('Mini-game unavailable', err);
    const g = canvas.getContext('2d');
    canvas.width = 640; canvas.height = 360;
    g.fillStyle = '#05040c'; g.fillRect(0, 0, 640, 360);
    g.fillStyle = '#ffc93c'; g.font = '20px monospace'; g.textAlign = 'center';
    g.fillText('BONUS STAGE OUT OF ORDER', 320, 180);
  }
}

// --- Boot it all ------------------------------------------------------------------------------------------
renderScore();
renderTrophies();
renderAbout();
renderInventory();
renderQuests();
renderLevels();
renderContact();
wireModals();
wireNav();
wireSound();
wireKonami();
startWorld();
startGame();
runBoot().then(typeTagline);
