// The 3D world behind the page: synthwave terrain, a striped sun, a starfield and a
// floating low-poly arcade cabinet you can tilt with the mouse. Coins orbit the
// cabinet; clicking one collects it.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const PALETTES = {
  normal: { line: 0x3cf0ff, sunTop: 0xffc93c, sunBottom: 0xff4f9a, fog: 0x0b0a16, edge: 0x3cf0ff },
  konami: { line: 0x7dff8a, sunTop: 0x7dff8a, sunBottom: 0x3cf0ff, fog: 0x07140d, edge: 0xff4f9a },
};

const NOISE_GLSL = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float terrain(vec2 p) {
    // flat road in the middle, mountains rising on both sides
    float side = smoothstep(3.5, 13.0, abs(p.x));
    float n = vnoise(p * 0.18) * 0.65 + vnoise(p * 0.42) * 0.35;
    return side * (n * 7.0 + 0.6);
  }
`;

function makeTerrain(segments) {
  const geo = new THREE.PlaneGeometry(90, 180, segments, segments * 2);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uOffset: { value: 0 },
      uLine: { value: new THREE.Color(PALETTES.normal.line) },
      uFog: { value: new THREE.Color(PALETTES.normal.fog) },
    },
    vertexShader: /* glsl */ `
      uniform float uOffset;
      varying vec2 vGrid;
      varying float vDepth;
      varying float vHeight;
      ${NOISE_GLSL}
      void main() {
        vec3 p = position;
        vec2 g = vec2(p.x, p.z - uOffset);
        p.y = terrain(g);
        vGrid = g;
        vHeight = p.y;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uLine;
      uniform vec3 uFog;
      varying vec2 vGrid;
      varying float vDepth;
      varying float vHeight;
      void main() {
        vec2 cell = vGrid / 1.5;
        vec2 d = abs(fract(cell - 0.5) - 0.5) / fwidth(cell);
        float line = 1.0 - min(min(d.x, d.y), 1.0);
        vec3 base = mix(vec3(0.02, 0.015, 0.06), vec3(0.1, 0.03, 0.17), clamp(vHeight / 7.0, 0.0, 1.0));
        // fade the grid out with distance so far lines don't alias into a haze
        line *= 1.0 - smoothstep(25.0, 75.0, vDepth);
        vec3 col = mix(base, uLine, line);
        float fog = smoothstep(30.0, 90.0, vDepth);
        col = mix(col, uFog, fog);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    extensions: { derivatives: true },
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.z = -60;
  return mesh;
}

function makeSun() {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uTop: { value: new THREE.Color(PALETTES.normal.sunTop) },
      uBottom: { value: new THREE.Color(PALETTES.normal.sunBottom) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uTop;
      uniform vec3 uBottom;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv - 0.5;
        float r = length(p);
        float disc = smoothstep(0.34, 0.335, r);
        // retro stripes that thicken toward the bottom and drift downward
        float y = (p.y + 0.34) / 0.68;
        float band = fract(y * 11.0 + uTime * 0.25);
        float gap = smoothstep(0.55, 0.0, y) * 0.75;
        float stripes = step(gap, band);
        vec3 col = mix(uBottom, uTop, smoothstep(0.1, 0.85, y));
        float glow = pow(smoothstep(0.5, 0.33, r), 2.0) * 0.35;
        float a = disc * stripes + glow * (1.0 - disc);
        gl_FragColor = vec4(col * (0.9 + disc * 0.25), a);
      }
    `,
  });
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(94, 94), mat);
  sun.position.set(0, 12, -150);
  return sun;
}

function makeStars(count) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI - Math.PI / 2;
    const phi = Math.random() * Math.PI * 0.45 + 0.05;
    const r = 170;
    pos[i * 3] = Math.sin(theta) * Math.cos(phi) * r;
    pos[i * 3 + 1] = Math.sin(phi) * r * 0.6 + 4;
    pos[i * 3 + 2] = -Math.cos(theta) * Math.cos(phi) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xf3efe6, size: 0.55, sizeAttenuation: true, transparent: true, opacity: 0.85, fog: false });
  return new THREE.Points(geo, mat);
}

// --- Arcade cabinet ------------------------------------------------------------

function canvasTexture(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return { c, g: c.getContext('2d'), tex };
}

const INVADER = ['00100000100', '00010001000', '00111111100', '01101110110', '11111111111', '10111111101', '10100000101', '00011011000'];
const INVADER_FLIPPED = INVADER.map((row) => [...row].reverse().join(''));

function drawSprite(g, rows, x, y, s, color) {
  g.fillStyle = color;
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) if (row[i] === '1') g.fillRect(x + i * s, y + j * s, s, s);
  });
}

function makeCabinet() {
  const group = new THREE.Group();
  const W = 1.3;

  // side profile in (depth, height); extruded across the cabinet width
  const profile = [
    [0, 0], [1.2, 0], [1.2, 1.0], [1.58, 1.14], [1.4, 1.36], [1.06, 1.46],
    [0.86, 2.26], [1.02, 2.34], [1.02, 2.76], [0, 2.76],
  ];
  const shape = new THREE.Shape(profile.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: W, bevelEnabled: false });
  geo.rotateY(-Math.PI / 2);
  geo.translate(W / 2, 0, -0.75);

  const body = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x1a1236, roughness: 0.55, metalness: 0.2 }));
  group.add(body);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), new THREE.LineBasicMaterial({ color: PALETTES.normal.edge }));
  group.add(edges);

  // side art stripes (hot pink + gold) on both side panels
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xff4f9a });
  const stripeMat2 = new THREE.MeshBasicMaterial({ color: 0xffc93c });
  [-1, 1].forEach((side) => {
    const s1 = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.06), stripeMat);
    s1.position.set(side * (W / 2 + 0.002), 0.75, -0.2);
    s1.rotation.set(0, side * Math.PI / 2, -0.35);
    const s2 = s1.clone();
    s2.material = stripeMat2;
    s2.position.y = 0.6;
    group.add(s1, s2);
  });

  // screen
  const screen = canvasTexture(192, 144);
  const faceLen = Math.hypot(0.2, 0.8);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.86, faceLen * 0.9), new THREE.MeshBasicMaterial({ map: screen.tex }));
  scr.position.set(0, 1.86, 0.96 - 0.75 + 0.012);
  scr.rotation.x = -Math.atan2(0.2, 0.8);
  group.add(scr);

  // marquee
  const marquee = canvasTexture(256, 64);
  const mq = marquee.g;
  mq.fillStyle = '#140f2b';
  mq.fillRect(0, 0, 256, 64);
  mq.fillStyle = '#ffc93c';
  mq.font = 'bold 30px monospace';
  mq.textAlign = 'center';
  mq.textBaseline = 'middle';
  mq.fillText('B H A V', 128, 30);
  mq.fillStyle = '#ff4f9a';
  mq.fillRect(16, 52, 224, 4);
  marquee.tex.needsUpdate = true;
  const mqMesh = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.94, 0.38), new THREE.MeshBasicMaterial({ map: marquee.tex }));
  mqMesh.position.set(0, 2.55, 1.02 - 0.75 + 0.006);
  group.add(mqMesh);

  // control panel: joystick + buttons sit on the slanted panel top
  const panel = new THREE.Group();
  panel.position.set(0, 1.25 + 0.01, 1.49 - 0.75);
  panel.rotation.x = Math.atan2(0.22, 0.18) - Math.PI / 2 + 0.2;
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 8), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  stick.position.set(-0.3, 0.1, 0);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshStandardMaterial({ color: 0xff4f9a, emissive: 0xff4f9a, emissiveIntensity: 0.6 }));
  ball.position.set(-0.3, 0.21, 0);
  panel.add(stick, ball);
  [0xffc93c, 0x3cf0ff, 0x7dff8a].forEach((c, i) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 16), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.9 }));
    b.position.set(0.05 + i * 0.15, 0.02, i === 1 ? -0.05 : 0.02);
    panel.add(b);
  });
  group.add(panel);

  // glow ring under the hovering cabinet
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.0, 1.15, 48),
    new THREE.MeshBasicMaterial({ color: 0xff4f9a, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.35;
  group.add(ring);

  return { group, screen, edges, ring, joystick: ball };
}

// Attract-mode animation on the cabinet screen.
function drawScreen({ g, tex }, t, score) {
  const w = 192, h = 144;
  g.fillStyle = '#05040c';
  g.fillRect(0, 0, w, h);
  // marching invaders
  const ox = Math.sin(t * 0.8) * 18;
  const frame = Math.floor(t * 3) % 2;
  const rows = frame ? INVADER : INVADER_FLIPPED;
  for (let r = 0; r < 2; r++) {
    for (let i = 0; i < 4; i++) {
      drawSprite(g, rows, 30 + i * 34 + ox, 18 + r * 22, 2, r ? '#3cf0ff' : '#7dff8a');
    }
  }
  g.font = 'bold 16px monospace';
  g.textAlign = 'center';
  g.fillStyle = '#ffc93c';
  g.fillText('PLAYER 1', w / 2, 86);
  if (Math.floor(t * 2) % 2 === 0) {
    g.fillStyle = '#f3efe6';
    g.font = 'bold 12px monospace';
    g.fillText('INSERT COIN', w / 2, 108);
  }
  g.fillStyle = '#ff4f9a';
  g.font = '10px monospace';
  g.fillText(`HI ${String(score).padStart(6, '0')}`, w / 2, 130);
  // scanlines
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
  tex.needsUpdate = true;
}

function makeCoins(n) {
  const geo = new THREE.CylinderGeometry(0.22, 0.22, 0.05, 20);
  geo.rotateX(Math.PI / 2);
  // pixel coin face: gold disc, darker rim, embossed "B"
  const face = canvasTexture(16, 16);
  const F = ['....kkkkkk....', '..kkyyyyyykk..', '.kyyyyyyyyyyk.', '.kyyykkkkyyyk.', 'kyyyykyykyyyyk', 'kyyyykyykyyyyk',
    'kyyyykkkkyyyyk', 'kyyyykyykyyyyk', 'kyyyykyykyyyyk', '.kyyykkkkyyyk.', '.kyyyyyyyyyyk.', '..kkyyyyyykk..', '....kkkkkk....'];
  face.g.fillStyle = '#ffc93c';
  face.g.fillRect(0, 0, 16, 16);
  drawSprite(face.g, F.map((r) => r.replace(/y/g, '0').replace(/k/g, '1').replace(/\./g, '0')), 1, 1, 1, '#b8860b');
  face.tex.needsUpdate = true;
  const side = new THREE.MeshStandardMaterial({ color: 0xb8860b, emissive: 0x7a5200, emissiveIntensity: 0.5, metalness: 0.6, roughness: 0.4 });
  const cap = new THREE.MeshStandardMaterial({ map: face.tex, emissive: 0xffa21a, emissiveIntensity: 0.25, emissiveMap: face.tex, metalness: 0.3, roughness: 0.5 });
  const mat = [side, cap, cap];
  const coins = [];
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo, mat);
    // generous invisible hitbox so moving coins are easy to click
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData.coin = m;
    m.add(hit);
    m.userData = { a: (i / n) * Math.PI * 2, r: 1.8 + (i % 2) * 0.5, y: 0.6 + (i % 3) * 0.75, pop: 0 };
    coins.push(m);
  }
  return coins;
}

// --- Roadside level landmarks ------------------------------------------------

const LANDMARK_DEFS = [
  { id: 'stats', title: 'CHARACTER SELECT', side: -1, kind: 'gate' },
  { id: 'inventory', title: 'INVENTORY', side: 1, kind: 'chest' },
  { id: 'quests', title: 'QUEST LOG', side: -1, kind: 'map' },
  { id: 'levels', title: 'LEVEL SELECT', side: 1, kind: 'carts' },
  { id: 'bonus', title: 'BONUS STAGE', side: -1, kind: 'coin' },
  { id: 'continue', title: 'CONTINUE?', side: 1, kind: 'billboard' },
];

function cssHex(value) {
  return `#${value.toString(16).padStart(6, '0')}`;
}

function makeLandmarkMaterials() {
  return {
    fill: new THREE.MeshStandardMaterial({ color: 0x141229, roughness: 0.7, metalness: 0.15 }),
    edge: new THREE.LineBasicMaterial({ color: PALETTES.normal.edge }),
    accent: new THREE.MeshBasicMaterial({ color: PALETTES.normal.line }),
    hot: new THREE.MeshBasicMaterial({ color: PALETTES.normal.sunBottom }),
    gold: new THREE.MeshStandardMaterial({
      color: PALETTES.normal.sunTop,
      emissive: PALETTES.normal.sunTop,
      emissiveIntensity: 0.35,
      roughness: 0.45,
      metalness: 0.35,
    }),
  };
}

function outlined(parent, geometry, material, edgeMaterial) {
  const assembly = new THREE.Group();
  const mesh = new THREE.Mesh(geometry, material);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 18), edgeMaterial);
  assembly.add(mesh, edges);
  parent.add(assembly);
  return assembly;
}

function drawLandmarkSign(sign, title, paletteName) {
  const p = PALETTES[paletteName];
  const { c, g, tex } = sign;
  g.fillStyle = cssHex(p.fog);
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = cssHex(p.edge);
  g.lineWidth = 8;
  g.strokeRect(6, 6, c.width - 12, c.height - 12);
  g.fillStyle = cssHex(p.sunTop);
  g.font = `bold ${title.length > 13 ? 29 : 36}px monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(title, c.width / 2, c.height / 2 + 2);
  tex.needsUpdate = true;
}

function addLandmarkSign(group, title, signs, y = 4.35) {
  const sign = canvasTexture(512, 128);
  drawLandmarkSign(sign, title, 'normal');
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(4.8, 1.2),
    new THREE.MeshBasicMaterial({ map: sign.tex, transparent: true }),
  );
  mesh.position.set(0, y, 0.08);
  group.add(mesh);
  signs.push({ ...sign, title });
  return mesh;
}

function makeGate(group, mats, signs, title) {
  outlined(group, new THREE.BoxGeometry(0.55, 4.2, 0.55), mats.fill, mats.edge).position.set(-2.05, 2.1, 0);
  outlined(group, new THREE.BoxGeometry(0.55, 4.2, 0.55), mats.fill, mats.edge).position.set(2.05, 2.1, 0);
  outlined(group, new THREE.BoxGeometry(4.65, 0.55, 0.55), mats.fill, mats.edge).position.set(0, 4.05, 0);
  const gem = outlined(group, new THREE.OctahedronGeometry(0.48, 0), mats.hot, mats.edge);
  gem.position.set(0, 2.5, 0);
  group.userData.animated = gem;
  addLandmarkSign(group, title, signs, 4.85);
}

function makeChest(group, mats, signs, title) {
  const chest = new THREE.Group();
  outlined(chest, new THREE.BoxGeometry(3.2, 1.45, 1.65), mats.fill, mats.edge).position.y = 0.7;
  const lid = outlined(chest, new THREE.BoxGeometry(3.25, 0.65, 1.7), mats.gold, mats.edge);
  lid.position.set(0, 1.72, -0.18);
  lid.rotation.x = -0.2;
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.32, 2.15, 1.78), mats.hot);
  band.position.y = 0.95;
  chest.add(band);
  const lock = outlined(chest, new THREE.BoxGeometry(0.55, 0.65, 0.18), mats.gold, mats.edge);
  lock.position.set(0, 0.95, 0.92);
  chest.position.y = 1.0;
  group.add(chest);
  group.userData.animated = chest;
  addLandmarkSign(group, title, signs, 4.25);
}

function makeMapPylon(group, mats, signs, title) {
  outlined(group, new THREE.CylinderGeometry(0.75, 1.05, 0.5, 6), mats.fill, mats.edge).position.y = 0.25;
  outlined(group, new THREE.BoxGeometry(0.38, 3.6, 0.38), mats.fill, mats.edge).position.y = 2.1;
  const map = new THREE.Group();
  outlined(map, new THREE.BoxGeometry(2.8, 2.25, 0.18), mats.fill, mats.edge);
  const route = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.9, -0.55, 0.11),
      new THREE.Vector3(-0.25, 0.55, 0.11),
      new THREE.Vector3(0.3, -0.1, 0.11),
      new THREE.Vector3(0.95, 0.6, 0.11),
    ]),
    mats.edge,
  );
  map.add(route);
  map.position.set(0, 2.55, 0.08);
  group.add(map);
  group.userData.animated = map;
  addLandmarkSign(group, title, signs, 4.45);
}

function makeCartridges(group, mats, signs, title) {
  const row = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const cart = new THREE.Group();
    outlined(cart, new THREE.BoxGeometry(1.25, 2.35, 0.55), mats.fill, mats.edge);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.72), i === 1 ? mats.hot : mats.accent);
    label.position.set(0, 0.35, 0.286);
    cart.add(label);
    cart.position.set((i - 1) * 1.45, 1.5 + (i === 1 ? 0.45 : 0), i === 1 ? -0.2 : 0);
    cart.rotation.z = (i - 1) * -0.08;
    row.add(cart);
  }
  group.add(row);
  group.userData.animated = row;
  addLandmarkSign(group, title, signs, 4.35);
}

function makeBonusCoin(group, mats, signs, title, lowPower) {
  const coin = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.55, 0.34, lowPower ? 16 : 28), mats.gold);
  disc.rotation.x = Math.PI / 2;
  coin.add(disc);
  const rim = new THREE.LineSegments(new THREE.EdgesGeometry(disc.geometry), mats.edge);
  rim.rotation.copy(disc.rotation);
  coin.add(rim);
  const b = outlined(coin, new THREE.BoxGeometry(0.22, 1.45, 0.16), mats.fill, mats.edge);
  b.position.z = 0.19;
  const bTop = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.22, 0.16), mats.fill);
  bTop.position.set(0.2, 0.62, 0.19);
  coin.add(bTop);
  coin.position.y = 2.15;
  group.add(coin);
  group.userData.animated = coin;
  addLandmarkSign(group, title, signs, 4.45);
}

function makeBillboard(group, mats, signs, title) {
  outlined(group, new THREE.BoxGeometry(0.28, 3.7, 0.28), mats.fill, mats.edge).position.set(-1.65, 1.85, 0);
  outlined(group, new THREE.BoxGeometry(0.28, 3.7, 0.28), mats.fill, mats.edge).position.set(1.65, 1.85, 0);
  outlined(group, new THREE.BoxGeometry(4.5, 2.65, 0.28), mats.fill, mats.edge).position.set(0, 3.4, 0);
  const digit = canvasTexture(128, 128);
  digit.g.fillStyle = '#0b0a16';
  digit.g.fillRect(0, 0, 128, 128);
  digit.g.fillStyle = '#ff4f9a';
  digit.g.font = 'bold 104px monospace';
  digit.g.textAlign = 'center';
  digit.g.textBaseline = 'middle';
  digit.g.fillText('9', 64, 68);
  digit.tex.needsUpdate = true;
  const digitMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 1.55), new THREE.MeshBasicMaterial({ map: digit.tex }));
  digitMesh.position.set(0, 3.18, 0.16);
  group.add(digitMesh);
  signs.push({ ...digit, title: '9', digit: true });
  addLandmarkSign(group, title, signs, 5.05);
}

function makeLandmarks(lowPower, mats) {
  const root = new THREE.Group();
  const signs = [];
  const records = LANDMARK_DEFS.map((def) => {
    const group = new THREE.Group();
    if (def.kind === 'gate') makeGate(group, mats, signs, def.title);
    else if (def.kind === 'chest') makeChest(group, mats, signs, def.title);
    else if (def.kind === 'map') makeMapPylon(group, mats, signs, def.title);
    else if (def.kind === 'carts') makeCartridges(group, mats, signs, def.title);
    else if (def.kind === 'coin') makeBonusCoin(group, mats, signs, def.title, lowPower);
    else makeBillboard(group, mats, signs, def.title);
    group.visible = false;
    root.add(group);
    return { ...def, group, travel: 0 };
  });
  return { root, records, signs };
}

function updateLandmarkPalette(mats, signs, name) {
  const p = PALETTES[name];
  mats.fill.color.set(name === 'konami' ? 0x10261b : 0x141229);
  mats.edge.color.set(p.edge);
  mats.accent.color.set(p.line);
  mats.hot.color.set(p.sunBottom);
  mats.gold.color.set(p.sunTop);
  mats.gold.emissive.set(p.sunTop);
  for (const sign of signs) {
    if (sign.digit) {
      sign.g.fillStyle = cssHex(p.fog);
      sign.g.fillRect(0, 0, sign.c.width, sign.c.height);
      sign.g.fillStyle = cssHex(p.sunBottom);
      sign.g.font = 'bold 104px monospace';
      sign.g.textAlign = 'center';
      sign.g.textBaseline = 'middle';
      sign.g.fillText('9', 64, 68);
      sign.tex.needsUpdate = true;
    } else {
      drawLandmarkSign(sign, sign.title, name);
    }
  }
}

// --- Main --------------------------------------------------------------------

export function initScene(canvas, { onCoin = () => {}, reducedMotion = false } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
  const lowPower = Math.min(window.innerWidth, window.innerHeight) < 700 || (navigator.hardwareConcurrency || 8) <= 4;
  const motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
  let motionReduced = reducedMotion || motionMedia.matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowPower ? 1 : 1.5));
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTES.normal.fog);
  scene.fog = new THREE.Fog(PALETTES.normal.fog, 30, 160);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
  camera.position.set(0, 2.4, 8.5);

  const terrain = makeTerrain(lowPower ? 50 : 90);
  const sun = makeSun();
  const stars = makeStars(lowPower ? 600 : 1400);
  scene.add(terrain, sun, stars);

  scene.add(new THREE.HemisphereLight(0x6a5cff, 0x0b0a16, 0.7));
  const pink = new THREE.PointLight(0xff4f9a, 30, 20);
  pink.position.set(-4, 3, 4);
  const cyan = new THREE.PointLight(0x3cf0ff, 25, 20);
  cyan.position.set(5, 4, 3);
  const key = new THREE.DirectionalLight(0xffffff, 0.6);
  key.position.set(2, 6, 6);
  scene.add(pink, cyan, key);

  const cab = makeCabinet();
  const rig = new THREE.Group();
  rig.add(cab.group);
  const coins = makeCoins(8);
  coins.forEach((c) => rig.add(c));
  scene.add(rig);

  const landmarkMats = makeLandmarkMaterials();
  const landmarks = makeLandmarks(lowPower, landmarkMats);
  scene.add(landmarks.root);

  const sectionEls = Array.from(document.querySelectorAll('[data-section]'));
  const sectionOffsets = new Float32Array(sectionEls.length);
  const sectionIndexes = new Map(sectionEls.map((el, i) => [el.id, i]));
  let scrollRange = 1;
  let journeyLength = 140;
  let heroEnd = window.innerHeight;
  let measureFrame = 0;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), lowPower ? 0.5 : 0.65, 0.45, 0.62);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // Layout is remeasured on viewport and document-size changes. Scroll itself is
  // sampled in frame(), so no scroll listener is needed.
  let portrait = false;
  function measureSections() {
    measureFrame = 0;
    const pageY = window.scrollY;
    const doc = document.documentElement;
    scrollRange = Math.max(doc.scrollHeight - window.innerHeight, 1);
    journeyLength = portrait ? 108 : 148;
    for (let i = 0; i < sectionEls.length; i++) {
      sectionOffsets[i] = sectionEls[i].getBoundingClientRect().top + pageY;
    }
    const statsIndex = sectionIndexes.get('stats');
    heroEnd = statsIndex == null ? window.innerHeight : Math.max(sectionOffsets[statsIndex] - 1, 1);
    for (const landmark of landmarks.records) {
      const index = sectionIndexes.get(landmark.id);
      const sectionY = index == null ? 0 : sectionOffsets[index];
      const arrivalY = Math.max(0, sectionY - window.innerHeight * 0.22);
      landmark.travel = (arrivalY / scrollRange) * journeyLength;
      landmark.group.position.x = landmark.side * (portrait ? 2.8 : 7.4);
      landmark.group.scale.setScalar(portrait ? 0.36 : 1);
      landmark.group.rotation.y = landmark.side * (portrait ? -0.08 : -0.14);
    }
  }
  function scheduleMeasure() {
    if (!measureFrame) measureFrame = requestAnimationFrame(measureSections);
  }
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.setSize(w * 0.5, h * 0.5);
    camera.aspect = w / h;
    portrait = w / h < 0.9;
    camera.fov = portrait ? 70 : 55;
    camera.updateProjectionMatrix();
    scheduleMeasure();
  }
  resize();
  measureSections();
  window.addEventListener('resize', resize);
  const sizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleMeasure);
  sizeObserver?.observe(document.body);

  // input
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const mouse = new THREE.Vector2();
  const target = new THREE.Vector2();
  const coinHitboxes = [];
  const intersections = [];
  const hitboxes = () => {
    coinHitboxes.length = 0;
    for (const coin of coins) {
      if (coin.userData.pop === 0 && !coin.userData.respawn) coinHitboxes.push(coin.children[0]);
    }
    return coinHitboxes;
  };
  const pick = (x, y) => {
    if (window.scrollY >= heroEnd) return null;
    ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    intersections.length = 0;
    ray.intersectObjects(hitboxes(), false, intersections);
    const hit = intersections[0];
    return hit ? hit.object.userData.coin : null;
  };
  let hovering = false;
  const onMove = (e) => {
    target.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    if (e.pointerType !== 'mouse') return;
    const over = window.scrollY < heroEnd && !e.target.closest?.('a, button, dialog') && !!pick(e.clientX, e.clientY);
    if (over !== hovering) { hovering = over; document.body.style.cursor = over ? 'pointer' : ''; }
  };
  window.addEventListener('pointermove', onMove, { passive: true });

  let collected = 0;
  const onClick = (e) => {
    const coin = pick(e.clientX, e.clientY);
    if (coin) {
      coin.userData.pop = 1;
      collected++;
      onCoin(collected, e.clientX, e.clientY);
      return true;
    }
    return false;
  };

  let palette = 'normal';
  let speed = 1;
  let boost = 0;
  let hiScore = 0;
  let running = true;
  let visible = true;
  let lastRender = performance.now();
  let lastScroll = window.scrollY;
  let lastScrollChange = lastRender;
  let t = 0;
  let scrollTravel = (Math.max(0, window.scrollY) / scrollRange) * journeyLength;
  let scrollTarget = scrollTravel;
  let ambientOffset = 0;
  let lastDim = -1;
  let lastScreenFrame = -1;
  const cameraAim = new THREE.Vector3();

  function setPalette(name) {
    palette = name;
    const p = PALETTES[name];
    terrain.material.uniforms.uLine.value.set(p.line);
    terrain.material.uniforms.uFog.value.set(p.fog);
    sun.material.uniforms.uTop.value.set(p.sunTop);
    sun.material.uniforms.uBottom.value.set(p.sunBottom);
    cab.edges.material.color.set(p.edge);
    updateLandmarkPalette(landmarkMats, landmarks.signs, name);
    scene.background.set(p.fog);
    scene.fog.color.set(p.fog);
    speed = name === 'konami' ? 3 : 1;
  }

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const rawScroll = THREE.MathUtils.clamp(window.scrollY, 0, scrollRange);
    if (Math.abs(rawScroll - lastScroll) > 0.25) {
      lastScroll = rawScroll;
      lastScrollChange = now;
    }
    scrollTarget = (rawScroll / scrollRange) * journeyLength;
    const travelSettled = Math.abs(scrollTarget - scrollTravel) < 0.015;
    const journeyActive = now - lastScrollChange < 180 || !travelSettled;
    if (!visible) { lastRender = now; return; }
    // Keep full frame rate during scroll and damping. Once settled behind the
    // content, the scene returns to a roughly 30 fps backdrop cadence.
    if (rawScroll > window.innerHeight * 1.2 && !journeyActive && now - lastRender < 32) return;
    const dt = Math.min((now - lastRender) / 1000, 0.05);
    lastRender = now;
    t += dt;

    const heroProgress = THREE.MathUtils.clamp(rawScroll / heroEnd, 0, 1);
    const heroEase = heroProgress * heroProgress * (3 - 2 * heroProgress);
    const damping = motionReduced ? 1 : 1 - Math.exp(-dt * 7.5);
    scrollTravel += (scrollTarget - scrollTravel) * damping;
    if (Math.abs(scrollTarget - scrollTravel) < 0.001) scrollTravel = scrollTarget;
    boost *= Math.exp(-dt * 3.7);
    const motion = motionReduced ? 0 : 1;
    ambientOffset += dt * (3.2 + boost * 9) * speed * motion;
    terrain.material.uniforms.uOffset.value = scrollTravel + ambientOffset;
    sun.material.uniforms.uTime.value = t * motion;

    mouse.lerp(target, motionReduced ? 1 : 1 - Math.exp(-dt * 5));

    const baseX = portrait ? 0 : 2.7;
    const baseY = portrait ? 0.25 : -0.1;
    rig.position.set(
      baseX,
      baseY + Math.sin(t * 1.4) * 0.12 * motion,
      (portrait ? 3.6 : 0.5) - heroEase * (portrait ? 34 : 42),
    );
    rig.scale.setScalar((portrait ? 0.6 : 1) * (1 - heroEase * 0.34));
    rig.rotation.y = -0.45 + mouse.x * 0.5 + heroEase * 0.25;
    rig.rotation.x = -mouse.y * 0.12;
    cab.joystick.position.x = -0.3 + mouse.x * 0.04;
    cab.ring.material.opacity = motionReduced ? 0.55 : 0.45 + Math.sin(t * 3) * 0.2;

    coins.forEach((c, i) => {
      const u = c.userData;
      if (u.pop > 0) {
        u.pop += dt * 2.2;
        c.scale.setScalar(1 + u.pop * 1.5);
        c.position.y += dt * 3;
        c.material.opacity = 1;
        if (u.pop > 1.4) { u.pop = 0; c.scale.setScalar(0.001); u.respawn = 2; }
        return;
      }
      if (u.respawn) {
        u.respawn -= dt;
        c.scale.setScalar(Math.max(0.001, 1 - Math.max(u.respawn, 0)));
        if (u.respawn <= 0) { u.respawn = 0; c.scale.setScalar(1); }
      }
      const a = u.a + t * 0.35 * motion;
      c.position.set(Math.cos(a) * u.r, u.y + Math.sin(t * 2 + i) * 0.1, Math.sin(a) * u.r * 0.7);
      c.rotation.y = t * 3 * motion + i;
    });

    const landmarkPassZ = portrait ? -6 : -1;
    for (let i = 0; i < landmarks.records.length; i++) {
      const landmark = landmarks.records[i];
      const z = landmarkPassZ + scrollTravel - landmark.travel;
      landmark.group.visible = z > -150 && z < (portrait ? 0 : 20);
      landmark.group.position.z = z;
      landmark.group.position.y = (portrait ? 8.2 : 0) + Math.sin(t * 0.9 + i) * 0.1 * motion;
      const animated = landmark.group.userData.animated;
      if (animated) {
        if (landmark.kind === 'map') animated.rotation.y = Math.sin(t * 0.55) * 0.12 * motion;
        else if (landmark.kind === 'carts') animated.rotation.z = Math.sin(t * 0.7) * 0.025 * motion;
        else animated.rotation.y = t * (landmark.kind === 'coin' ? 1.15 : 0.42) * motion;
      }
    }

    if (rawScroll >= heroEnd && hovering) {
      hovering = false;
      document.body.style.cursor = '';
    }

    camera.position.x = mouse.x * 0.6;
    camera.position.y = 2.4 + mouse.y * 0.3;
    cameraAim.set(portrait ? 0 : 0.6, portrait ? 2.35 : 1.6, -1.5);
    camera.lookAt(cameraAim);

    stars.rotation.y = motionReduced ? 0 : t * 0.004;

    const screenFrame = motionReduced ? 0 : Math.floor(t * 12);
    if (screenFrame !== lastScreenFrame) {
      drawScreen(cab.screen, motionReduced ? 0 : t, hiScore);
      lastScreenFrame = screenFrame;
    }

    // dim the world as content scrolls over it (CSS reads --dim)
    const dim = Math.min(heroProgress / 0.72, 1) * 0.6;
    if (Math.abs(dim - lastDim) > 0.01) {
      document.documentElement.style.setProperty('--dim', dim.toFixed(2));
      lastDim = dim;
    }

    composer.render();
  }
  requestAnimationFrame(frame);

  const onVis = () => {
    visible = !document.hidden;
    if (visible) lastRender = performance.now();
  };
  const onMotion = (event) => { motionReduced = reducedMotion || event.matches; };
  document.addEventListener('visibilitychange', onVis);
  motionMedia.addEventListener?.('change', onMotion);

  return {
    click: onClick,
    kick(amount = 1) { boost = Math.min(boost + amount, 3); },
    setPalette,
    get palette() { return palette; },
    setHiScore(s) { hiScore = s; lastScreenFrame = -1; },
    dispose() {
      running = false;
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', onVis);
      motionMedia.removeEventListener?.('change', onMotion);
      sizeObserver?.disconnect();
      if (measureFrame) cancelAnimationFrame(measureFrame);
      document.body.style.cursor = '';
      renderer.dispose();
    },
  };
}
