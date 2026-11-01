import * as THREE from "three";
import { canvasTex, glow, lam, type Kit } from "./kit";
import type { Rect } from "./paths";

// The cave behind the website: what you see when you unzip the page. A short rock chamber lit by four torches, the
// back of the website glowing behind you, and at the far end a door with light leaking round its edges.

export const CAVE = { spawn: new THREE.Vector2(0, 110.6), door: new THREE.Vector2(0, 96.6), front: 112.4 };

export interface Cave {
  door: { pivot: THREE.Group; panel: THREE.Mesh; rect: Rect; angle: number; target: number };
  /** The blaze behind the door, from nothing to blinding. */
  setBlaze(k: number): void;
  update(t: number, dt: number): void;
}

/** Three frames of a pixel flame, for the torches. */
function flames() {
  const shapes = [
    ["...a...", "..aba..", "..aba..", ".abcba.", ".abcba.", "abccba.", "abccba.", ".abba..", "..aa..."],
    ["....a..", "...aa..", "..aba..", ".abba..", ".abcba.", ".abccba", "abccba.", ".abba..", "..aa..."],
    ["..a....", "..aa...", "..aba..", "..abba.", ".abcba.", "abccba.", ".abccba", "..abba.", "...aa.."],
  ];
  const pal: Record<string, string> = { a: "#ea4e12", b: "#ff8a52", c: "#ffe39a" };
  return shapes.map((rows) =>
    canvasTex(7, 9, (ctx) =>
      rows.forEach((row, y) =>
        [...row].forEach((ch, x) => {
          if (!pal[ch]) return;
          ctx.fillStyle = pal[ch];
          ctx.fillRect(x, y, 1, 1);
        }),
      ),
    ),
  );
}

export function buildCave(k: Kit, rand: () => number): Cave {
  const { scene, box, solids } = k;
  // Floor, rock walls, a low ceiling.
  k.plane(9, 20, 0, 0, 104, lam(0x3a3029));
  for (let i = 0; i < 26; i++) {
    const pebble = new THREE.Mesh(new THREE.IcosahedronGeometry(0.08 + rand() * 0.14, 0), lam(rand() < 0.5 ? 0x4a3e34 : 0x2b2622));
    pebble.position.set((rand() - 0.5) * 6, 0.04, 96.5 + rand() * 15);
    scene.add(pebble);
  }
  const rockTones = [0x2b2622, 0x332c26, 0x241f1c, 0x3a3029];
  const rock = (x: number, y: number, z: number, r: number) => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), lam(rockTones[Math.floor(rand() * rockTones.length)]));
    m.position.set(x, y, z);
    m.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    scene.add(m);
  };
  for (let z = 93.5; z < 115; z += 1.1)
    for (const side of [-1, 1]) for (const y of [0.4, 1.7, 3.1, 4.4]) rock(side * (4.3 + rand() * 0.6), y + rand() * 0.4, z + rand() * 0.6, 0.9 + rand() * 0.6);
  for (let z = 93.5; z < 115; z += 1.3) for (const x of [-2.6, -0.9, 0.9, 2.6]) rock(x + rand() * 0.6, 5.2 + rand() * 0.6, z, 1.1 + rand() * 0.5);
  for (const x of [-3.2, -2, 2, 3.2]) for (const y of [0.6, 2, 3.4]) rock(x, y + rand() * 0.3, 94.4, 0.9 + rand() * 0.4);
  for (const x of [-1.2, 0, 1.2]) rock(x, 3.6 + rand() * 0.3, 94.6, 0.8 + rand() * 0.3);
  solids.push(
    { x0: -10, x1: -3.4, z0: 90, z1: 120 },
    { x0: 3.4, x1: 10, z0: 90, z1: 120 },
    { x0: -10, x1: -0.8, z0: 90, z1: 95.5 },
    { x0: 0.8, x1: 10, z0: 90, z1: 95.5 },
    { x0: -10, x1: 10, z0: CAVE.front + 0.2, z1: 120 },
  );

  // The website, from behind: what you climbed through, still open down the middle.
  const back = canvasTex(180, 112, (ctx) => {
    ctx.fillStyle = "#fbfaf6";
    ctx.fillRect(0, 0, 180, 112);
    ctx.save();
    ctx.translate(180, 0);
    ctx.scale(-1, 1);
    ctx.fillStyle = "#121212";
    ctx.font = "bold 24px Arial, sans-serif";
    ctx.fillText("Ad labels,", 12, 40);
    ctx.fillText("on the clock.", 12, 68);
    ctx.fillStyle = "#ea4e12";
    ctx.fillRect(12, 82, 52, 14);
    ctx.restore();
    ctx.fillStyle = "#050608";
    ctx.beginPath();
    ctx.moveTo(72, 0);
    ctx.lineTo(90, 112);
    ctx.lineTo(108, 0);
    ctx.fill();
    ctx.fillStyle = "#c9a24b";
    for (let y = 2; y < 108; y += 5) {
      const w = 18 * (1 - y / 112);
      ctx.fillRect(90 - w - 2, y, 2, 2);
      ctx.fillRect(90 + w, y + 2, 2, 2);
    }
  });
  const site = new THREE.Mesh(new THREE.PlaneGeometry(8, 5), new THREE.MeshBasicMaterial({ map: back }));
  site.position.set(0, 2.5, CAVE.front + 0.15);
  site.rotation.y = Math.PI;
  scene.add(site);
  const siteLight = new THREE.PointLight(0xfbfaf6, 3, 9, 1.6);
  siteLight.position.set(0, 2.2, CAVE.front - 1);
  scene.add(siteLight);

  // Torches, two on each wall.
  const frames = flames();
  const torches: { light: THREE.PointLight; flame: THREE.Sprite; seed: number }[] = [];
  for (const z of [99.2, 105.4])
    for (const side of [-1, 1]) {
      const stick = box(0.08, 0.62, 0.08, side * 3.62, 1.35, z, 0x4a3020);
      stick.rotation.z = side * 0.35;
      box(0.16, 0.12, 0.16, side * 3.5, 1.95, z, 0x2b2624);
      const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: frames[0], transparent: true, depthWrite: false }));
      flame.scale.set(0.32, 0.42, 1);
      flame.position.set(side * 3.48, 2.22, z);
      scene.add(flame);
      const halo = glow(0xff8a52, 1.4);
      halo.position.copy(flame.position);
      scene.add(halo);
      const light = new THREE.PointLight(0xff9a4a, 7, 9, 1.5);
      light.position.set(side * 3.1, 2.3, z);
      scene.add(light);
      torches.push({ light, flame, seed: rand() * 10 });
    }

  // The door at the back, its edges leaking light.
  for (const x of [-0.85, 0.85]) box(0.22, 2.7, 0.32, x, 0, 95.3, 0x3a2418);
  box(1.92, 0.3, 0.32, 0, 2.55, 95.3, 0x3a2418);
  const planks = canvasTex(14, 24, (ctx) => {
    ctx.fillStyle = "#7a4a2a";
    ctx.fillRect(0, 0, 14, 24);
    ctx.fillStyle = "#5e3820";
    for (const x of [4, 9]) ctx.fillRect(x, 0, 1, 24);
    ctx.fillRect(1, 6, 12, 1);
    ctx.fillRect(1, 17, 12, 1);
  });
  const pivot = new THREE.Group();
  pivot.position.set(-0.72, 0, 95.32);
  scene.add(pivot);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(1.44, 2.44, 0.1), new THREE.MeshLambertMaterial({ map: planks }));
  panel.position.set(0.72, 1.22, 0);
  pivot.add(panel);
  const knob = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.14), lam(0xc9a24b));
  knob.position.set(1.22, 1.15, 0.04);
  pivot.add(knob);
  const seam = new THREE.MeshBasicMaterial({ color: 0xfff1c4, fog: false });
  // light leaking round the edges of the door, and under it
  for (const [w, h, x, y] of [
    [0.05, 2.44, -0.7, 0],
    [0.05, 2.44, 0.7, 0],
    [1.44, 0.05, 0, 2.41],
    [1.44, 0.03, 0, 0.0],
  ])
    box(w, h, 0.02, x, y, 95.39, seam);
  const blaze = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.5), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
  blaze.position.set(0, 1.22, 95.12);
  scene.add(blaze);
  const doorGlow = new THREE.PointLight(0xfff1c4, 2, 7, 1.6);
  doorGlow.position.set(0, 1.5, 96.2);
  scene.add(doorGlow);
  const beam = glow(0xfff1c4, 3.2);
  beam.position.set(0, 1.25, 95.5);
  beam.material.opacity = 0;
  scene.add(beam);

  let frameAt = 0;
  let frame = 0;
  return {
    door: { pivot, panel, rect: { x0: -0.8, x1: 0.8, z0: 90, z1: 95.5 }, angle: 0, target: 0 },
    setBlaze(k) {
      doorGlow.intensity = 2 + k * 60;
      doorGlow.distance = 7 + k * 20;
      beam.material.opacity = k;
      beam.scale.setScalar(3.2 + k * 14);
    },
    update(t) {
      if (t - frameAt > 0.11) {
        frameAt = t;
        frame = (frame + 1) % frames.length;
      }
      for (const [i, torch] of torches.entries()) {
        (torch.flame.material as THREE.SpriteMaterial).map = frames[(frame + i) % frames.length];
        torch.light.intensity = 6 + Math.sin(t * 13 + torch.seed) * 0.9 + Math.sin(t * 7.3 + torch.seed * 2) * 0.7;
      }
    },
  };
}
