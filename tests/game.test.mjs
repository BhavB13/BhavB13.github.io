import assert from 'node:assert/strict';
import test from 'node:test';

let now = 0;
let nextFrame = 1;
let frames = new Map();
let contexts = [];

class FakeContext {
  constructor() {
    this.fillStyle = '';
    this.rects = [];
  }

  clearRect() {}
  save() {}
  restore() {}
  translate() {}
  beginPath() {}
  moveTo() {}
  lineTo() {}
  stroke() {}
  strokeRect() {}
  fillText() {}
  drawImage() {}
  createLinearGradient() { return { addColorStop() {} }; }
  createRadialGradient() { return { addColorStop() {} }; }

  fillRect(x, y, w, h) {
    if ((x === 0 && y === 0 && w >= 320 && h >= 180 && this.fillStyle === '#0b0a16')
      || (x === -8 && y === -8)) this.rects = [];
    this.rects.push({ x, y, w, h, color: this.fillStyle });
  }
}

class FakeCanvas extends EventTarget {
  constructor() {
    super();
    this.width = 640;
    this.height = 360;
    this.style = { touchAction: '' };
    this.attributes = new Set();
    this.attributeValues = new Map();
    this.context = new FakeContext();
    contexts.push(this.context);
  }

  getContext() { return this.context; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 640, height: 360 }; }
  hasAttribute(name) { return this.attributes.has(name); }
  getAttribute(name) { return this.attributeValues.get(name) ?? null; }
  setAttribute(name, value) { this.attributes.add(name); this.attributeValues.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); this.attributeValues.delete(name); }
  setPointerCapture() {}
  focus() { document.activeElement = this; }
  set tabIndex(value) { this.attributes.add('tabindex'); this._tabIndex = value; }
  get tabIndex() { return this._tabIndex ?? -1; }
}

class FakeObserver {
  observe() {}
  disconnect() {}
}

const windowTarget = new EventTarget();
windowTarget.devicePixelRatio = 1;
windowTarget.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

const documentTarget = new EventTarget();
documentTarget.hidden = false;
documentTarget.activeElement = null;
documentTarget.createElement = (name) => {
  assert.equal(name, 'canvas');
  return new FakeCanvas();
};

Object.assign(globalThis, {
  window: windowTarget,
  document: documentTarget,
  HTMLCanvasElement: FakeCanvas,
  ResizeObserver: FakeObserver,
  IntersectionObserver: FakeObserver,
  localStorage: { getItem: () => null, setItem() {} },
  requestAnimationFrame(callback) {
    const id = nextFrame++;
    frames.set(id, callback);
    return id;
  },
  cancelAnimationFrame(id) { frames.delete(id); },
});
Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now } });

const { createGame } = await import('../js/game.js');

function resetHarness() {
  now = 0;
  nextFrame = 1;
  frames = new Map();
  contexts = [];
  document.activeElement = null;
  localStorage = { getItem: () => null, setItem() {} };
}

function step(milliseconds = 1000 / 60) {
  now += milliseconds;
  const current = [...frames.values()];
  frames.clear();
  current.forEach((callback) => callback(now));
}

function advance(seconds) {
  const count = Math.ceil(seconds * 60);
  for (let i = 0; i < count; i += 1) step();
}

function key(type, code) {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, 'code', { value: code });
  window.dispatchEvent(event);
  return event;
}

function heartCount(context) {
  const centers = [311, 300, 289];
  return centers.filter((center) => context.rects.filter((rect) => (
    rect.color === '#ff4f9a'
      && rect.w === 1
      && rect.h === 1
      && rect.x >= center - 4
      && rect.x <= center + 4
      && rect.y >= 4
      && rect.y <= 10
  )).length >= 20).length;
}

test('a Space tap between animation frames fires once', () => {
  resetHarness();
  const sounds = [];
  const canvas = new FakeCanvas();
  const game = createGame(canvas, { sfx: { play: (name) => sounds.push(name) } });
  game.start();

  key('keydown', 'Space');
  key('keyup', 'Space');
  step();

  assert.equal(sounds.filter((name) => name === 'shoot').length, 1);
  game.destroy();
});

test('an idle player still has at least two hearts after the opening 15 seconds', () => {
  resetHarness();
  const originalRandom = Math.random;
  Math.random = () => 0.5;
  try {
    const canvas = new FakeCanvas();
    const game = createGame(canvas);
    game.start();
    advance(15);

    const hearts = heartCount(contexts[1]);
    assert.ok(hearts >= 2, `opening wave left ${hearts} heart(s)`);
    game.destroy();
  } finally {
    Math.random = originalRandom;
  }
});

test('onGameOver fires once per completed round', () => {
  resetHarness();
  const originalRandom = Math.random;
  Math.random = () => 0.5;
  try {
    const finals = [];
    const game = createGame(new FakeCanvas(), { onGameOver: (score) => finals.push(score) });
    game.start();
    advance(30);
    advance(5);

    assert.equal(finals.length, 1);
    game.destroy();
  } finally {
    Math.random = originalRandom;
  }
});

test('Space and arrow keys keep their browser defaults while the game is idle or stopped', () => {
  resetHarness();
  const canvas = new FakeCanvas();
  const game = createGame(canvas);
  canvas.focus();

  assert.equal(key('keydown', 'ArrowDown').defaultPrevented, false);
  assert.equal(key('keydown', 'Space').defaultPrevented, true, 'focused Space should start the idle game');
  game.stop();
  assert.equal(key('keydown', 'ArrowDown').defaultPrevented, false);
  game.destroy();
});

test('storage failures do not prevent a round from starting', () => {
  resetHarness();
  localStorage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  };
  const game = createGame(new FakeCanvas());
  assert.doesNotThrow(() => { game.start(); step(); });
  game.destroy();
});

test('the canvas label exposes running and game-over states', () => {
  resetHarness();
  const originalRandom = Math.random;
  Math.random = () => 0.5;
  try {
    const canvas = new FakeCanvas();
    canvas.setAttribute('aria-label', 'Bug Blaster mini-game');
    const game = createGame(canvas);
    game.start();
    assert.match(canvas.getAttribute('aria-label'), /running/i);

    advance(30);
    assert.match(canvas.getAttribute('aria-label'), /retry/i);
    game.destroy();
  } finally {
    Math.random = originalRandom;
  }
});
