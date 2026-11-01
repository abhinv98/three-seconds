import * as THREE from "three";
import { drawTick } from "@/components/landing/tick";
import { HACKS, type HackKind } from "./hacks";
import { canvasTex, glow, lam, type Kit } from "./kit";
import { AVENUE, BARRIER_ROWS, COLS, PORTAL, ROWS, TILE, tileX, tileZ, type Plan } from "./maze";
import type { Rect } from "./paths";

// Tickle's dimension: a rainy city of lit windows inside an enormous cave. The avenue runs from the door you arrive
// through to his house; the alleys either side are a maze, signed by whoever wrote this place (a developer, clearly).

export interface Pickup {
  mesh: THREE.Object3D;
  at: THREE.Vector2;
  taken: boolean;
}
export interface City {
  barriers: { mesh: THREE.Mesh; rect: Rect }[];
  clocks: Pickup[];
  hacks: (Pickup & { kind: HackKind })[];
  portal: THREE.Vector2;
  sticker: THREE.Group;
  setChase(on: boolean): void;
  update(t: number, dt: number): void;
}

const SIGNS: [string, string][] = [
  ["OPEN 24H", "#ff4f8b"],
  ["NOODLES", "#3ee6d6"],
  ["NO COLLAB", "#ff5f5f"],
  ["LAUNDRY", "#f2d14b"],
  ["PAID PARTNERSHIP", "#ff8a52"],
  ["#AD", "#7cf29a"],
  ["REELS FIXED HERE", "#9ad0ff"],
  ["THREE SECONDS", "#ff8a52"],
  ["LABELS 2 FOR 1", "#f2d14b"],
  ["TENTHS SOLD HERE", "#3ee6d6"],
];
const ALLEY_SIGNS: [string, string][] = [
  ["404 HOSTEL", "#ff5f5f"],
  ["BUG BAR", "#7cf29a"],
  ["CTRL CAFE", "#9ad0ff"],
  ["NULL & SONS", "#f2d14b"],
  ["DEPLOY DINER", "#ff8a52"],
  ["TODO: LIGHTS", "#c9c6bd"],
  ["HOTFIX", "#ff4f8b"],
  ["LOCALHOST", "#3ee6d6"],
];

export function buildCity(k: Kit, plan: Plan, rand: () => number, spots: { clocks: [number, number][]; hacks: [number, number][] }): City {
  const { scene, box, solids } = k;
  const isOpen = (i: number, j: number) => i >= 0 && j >= 0 && i < COLS && j < ROWS && plan[j][i];

  // Ground, the avenue's tarmac, its pavements and road markings.
  k.plane(110, 80, 0, 0, -28, lam(0x14151a));
  k.plane(15, 66, 0, 0.004, -29.5, lam(0x191a21));
  for (const x of [-6.9, 6.9]) box(1.2, 0.14, 66, x, 0, -29.5, 0x26262e);
  for (let z = -2; z > -60; z -= 4) box(0.12, 0.01, 1.6, 0, 0.005, z, 0x6b5a2c);

  // Windows: a few lit patterns, tiled up every building face at one window per metre or so.
  const lit = [0.18, 0.26, 0.12].map((rate) =>
    canvasTex(
      24,
      24,
      (ctx) => {
        ctx.fillStyle = "#0b0c12";
        ctx.fillRect(0, 0, 24, 24);
        for (let r = 0; r < 3; r++)
          for (let c = 0; c < 3; c++) {
            const v = rand();
            ctx.fillStyle = v < rate ? "#f2c26b" : v < rate + 0.08 ? "#7fd3e6" : v < rate + 0.11 ? "#f37a88" : "#161822";
            ctx.fillRect(c * 8 + 2, r * 8 + 2, 4, 5);
          }
      },
      true,
    ),
  );
  const facades = lit.map((tex) => new THREE.MeshLambertMaterial({ color: 0x15161d, emissive: 0xffffff, emissiveMap: tex, flatShading: true }));
  const roof = lam(0x0f1015);
  const building = (x: number, z: number, w: number, d: number, h: number) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    const size = [
      [d, h],
      [d, h],
      [w, d],
      [w, d],
      [w, h],
      [w, h],
    ];
    for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) uv.setXY(f * 4 + v, (uv.getX(f * 4 + v) * size[f][0]) / TILE, (uv.getY(f * 4 + v) * size[f][1]) / TILE);
    const face = facades[Math.floor(rand() * facades.length)];
    const m = new THREE.Mesh(geo, [face, face, roof, roof, face, face]);
    m.position.set(x, h / 2, z);
    scene.add(m);
    solids.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
    return m;
  };
  for (let j = 0; j < ROWS; j++)
    for (let i = 0; i < COLS; i++) {
      if (plan[j][i]) continue;
      const edge = i === 0 || i === COLS - 1 || j === 0 || j === ROWS - 1;
      const facade = i === 8 || i === 12;
      const h = edge ? 14 + rand() * 12 : facade ? 9 + rand() * 13 : 6 + rand() * 9;
      building(tileX(i), tileZ(j), TILE, TILE, h);
    }
  // Behind the portal, and down the sides of his street to the yard.
  building(0, 9, 110, 8, 22);
  for (const x of [-12, 12]) building(x, -75, 9, 30, 14);
  building(0, -81.5, 30, 3, 14);
  for (const side of [-1, 1]) building(side * 35, -62, 46, 5, 18);

  // Neon on the avenue's facades, and the odd sign down an alley.
  const flickers: THREE.MeshBasicMaterial[] = [];
  let n = 0;
  for (let j = 1; j < ROWS - 1; j++)
    for (const [col, side] of [
      [8, -1],
      [12, 1],
    ]) {
      if (plan[j][col] || rand() > 0.72) continue;
      const [text, color] = SIGNS[n++ % SIGNS.length];
      const w = Math.min(4.4, 1 + text.length * 0.36);
      const s = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.75), k.sign(text, color, 128, 26));
      s.position.set(side * 7.48, 3 + rand() * 3, tileZ(j));
      s.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      scene.add(s);
      if (rand() < 0.4) flickers.push(s.material as THREE.MeshBasicMaterial);
    }
  let a = 0;
  for (let j = 1; j < ROWS - 1 && a < ALLEY_SIGNS.length; j++)
    for (let i = 1; i < COLS - 1 && a < ALLEY_SIGNS.length; i++) {
      if (plan[j][i] || (AVENUE as readonly number[]).includes(i) || rand() > 0.12) continue;
      const faces = (
        [
          [1, 0, Math.PI / 2],
          [-1, 0, -Math.PI / 2],
          [0, 1, 0],
          [0, -1, Math.PI],
        ] as const
      ).filter(([di, dj]) => isOpen(i + di, j + dj) && !(AVENUE as readonly number[]).includes(i + di));
      if (!faces.length) continue;
      const [di, dj, yaw] = faces[0];
      const [text, color] = ALLEY_SIGNS[a++];
      const s = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.55), k.sign(text, color, 128, 26));
      // tile row j grows towards -z, so a face towards j + 1 looks down -z
      s.position.set(tileX(i) + (di * TILE) / 2 + di * 0.02, 2.6 + rand(), tileZ(j) - (dj * TILE) / 2 - dj * 0.02);
      s.rotation.y = dj ? (dj > 0 ? Math.PI : 0) : yaw;
      scene.add(s);
      flickers.push(s.material as THREE.MeshBasicMaterial);
    }

  // Billboards high on the facades: even here, ads say what they are.
  const billboard = (x: number, z: number, side: number, draw: (ctx: CanvasRenderingContext2D) => void) => {
    const tex = canvasTex(120, 60, draw);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshBasicMaterial({ map: tex }));
    m.position.set(x, 7, z);
    m.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    scene.add(m);
  };
  const face = (mood: "pass" | "point", lcd: string) => {
    const c = document.createElement("canvas");
    c.width = c.height = 48;
    drawTick(c.getContext("2d")!, { mood, lcd }, 0, true, false);
    return c;
  };
  const closedRow = (col: number, near: number) => {
    for (let d = 0; d < ROWS; d++) for (const j of [near - d, near + d]) if (j > 0 && j < ROWS - 1 && !plan[j][col]) return j;
    return near;
  };
  billboard(7.45, tileZ(closedRow(12, 11)), 1, (ctx) => {
    ctx.fillStyle = "#f3f1ea";
    ctx.fillRect(0, 0, 120, 60);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(face("pass", "3.0"), 6, 6, 48, 48);
    ctx.fillStyle = "#121212";
    ctx.font = "bold 11px Arial, sans-serif";
    ctx.fillText("RESPECT THE", 58, 24);
    ctx.fillText("3-SECOND RULE", 58, 38);
    ctx.font = "8px Arial, sans-serif";
    ctx.fillStyle = "#6e6a62";
    ctx.fillText("Paid partnership", 58, 52);
  });
  billboard(-7.45, tileZ(closedRow(8, 4)), -1, (ctx) => {
    ctx.fillStyle = "#121212";
    ctx.fillRect(0, 0, 120, 60);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(face("point", "#AD"), 66, 6, 48, 48);
    ctx.fillStyle = "#ff8a52";
    ctx.font = "bold 12px Arial, sans-serif";
    ctx.fillText("NO COLLAB", 8, 24);
    ctx.fillText("WITHOUT", 8, 38);
    ctx.fillText("A LABEL", 8, 52);
  });

  // Lamps down the avenue.
  for (const [i, z] of [-8, -20, -32, -44, -56].entries()) {
    const x = i % 2 ? 6.5 : -6.5;
    box(0.12, 4.4, 0.12, x, 0, z, 0x22232b, { solid: true });
    box(1.1, 0.08, 0.1, x - Math.sign(x) * 0.5, 4.35, z, 0x22232b);
    box(0.4, 0.12, 0.25, x - Math.sign(x) * 0.95, 4.25, z, new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
  }
  for (const z of [-9, -31, -53]) {
    const light = new THREE.PointLight(0xffc98a, 16, 16, 1.6);
    light.position.set(0, 4.2, z);
    scene.add(light);
  }
  // A parked car, a vending machine, a bus stop, a bin: life, or what passes for it here.
  const kerb = (side: number, near: number) => tileZ(closedRow(side < 0 ? 8 : 12, near));
  box(1.7, 0.85, 3.8, -3.2, 0.25, -24, 0xb3152f, { solid: true });
  box(1.5, 0.6, 2, -3.2, 1.1, -24.3, 0x8a1024);
  for (const [dx, dz] of [
    [-0.8, -1.2],
    [0.8, -1.2],
    [-0.8, 1.2],
    [0.8, 1.2],
  ]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.22, 10), lam(0x101010));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(-3.2 + dx, 0.3, -24 + dz);
    scene.add(wheel);
  }
  const vz = kerb(1, 3);
  box(0.9, 1.9, 0.7, 6.9, 0, vz, 0xb3152f, { solid: true });
  box(0.02, 1.1, 0.6, 6.44, 0.6, vz, new THREE.MeshBasicMaterial({ color: 0x9ad0ff }));
  const bz = kerb(1, 7);
  box(0.08, 2.3, 2.6, 7.3, 0, bz, 0x22232b, { solid: true });
  box(1.2, 0.08, 2.6, 6.8, 2.3, bz, 0x3ee6d6);
  box(0.6, 0.45, 2.2, 7.0, 0, bz, 0x3a3a44);
  box(0.5, 0.8, 0.5, -6.9, 0, kerb(-1, 9), 0x2f5f3f, { solid: true });
  // Stalactites, high in the dark: all this is inside a cave.
  for (let i = 0; i < 60; i++) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.8 + rand() * 1.6, 4 + rand() * 7, 5), lam(0x15131a));
    cone.rotation.x = Math.PI;
    cone.position.set(-55 + rand() * 110, 26 + rand() * 6, 10 - rand() * 95);
    scene.add(cone);
  }

  // A "Collab" sticker on the first lamp post: you can peel it off and take it to the house.
  const sticker = new THREE.Group();
  const stickerBody = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.03), new THREE.MeshLambertMaterial({ color: 0xf37a88 }));
  const stickerFace = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.18), k.sign("Collab", "#121212", 64, 24));
  stickerFace.position.z = 0.017;
  sticker.add(stickerBody, stickerFace);
  sticker.position.set(-6.5, 1.5, -7.92);
  sticker.rotation.y = Math.PI;
  scene.add(sticker);

  // The door you arrive through, standing on its own at the top of the avenue. In the chase, a beam of light shows
  // where it is from anywhere in the city.
  const [pi, pj] = PORTAL;
  const portal = new THREE.Vector2(tileX(pi), tileZ(pj));
  for (const x of [-0.95, 0.95]) box(0.24, 3, 0.3, portal.x + x, 0, portal.y, 0x2b2624);
  box(2.14, 0.3, 0.3, portal.x, 3, portal.y, 0x2b2624);
  box(1.66, 2.96, 0.06, portal.x, 0.02, portal.y, new THREE.MeshBasicMaterial({ color: 0xfff7e6, fog: false }));
  const portalLight = new THREE.PointLight(0xfff1c4, 5, 12, 1.5);
  portalLight.position.set(portal.x, 2, portal.y - 1.5);
  scene.add(portalLight);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 0.9, 90, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff1c4, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
  );
  beam.position.set(portal.x, 45, portal.y);
  beam.visible = false;
  scene.add(beam);
  solids.push({ x0: portal.x - 1.1, x1: portal.x + 1.1, z0: portal.y - 0.05, z1: portal.y + 0.6 });

  // His barriers: red walls across the avenue, raised in the chase.
  const denied = canvasTex(
    64,
    32,
    (ctx) => {
      ctx.fillStyle = "rgba(179,21,47,0.55)";
      ctx.fillRect(0, 0, 64, 32);
      ctx.fillStyle = "rgba(255,95,95,0.7)";
      for (let y = 0; y < 32; y += 4) ctx.fillRect(0, y, 64, 1);
      ctx.fillStyle = "#fff1f1";
      ctx.font = "bold 8px Arial, sans-serif";
      ctx.fillText("ACCESS", 15, 14);
      ctx.fillText("DENIED", 15, 24);
    },
    true,
  );
  denied.repeat.set(4, 1);
  const deniedMat = new THREE.MeshBasicMaterial({ map: denied, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false });
  const barriers = BARRIER_ROWS.map((row) => {
    const z = tileZ(row);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(15, 7), deniedMat);
    mesh.position.set(0, 3.5, z);
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, rect: { x0: -7.5, x1: 7.5, z0: z - 0.35, z1: z + 0.35 } };
  });

  // Clocks: three more seconds each.
  const clockFace = canvasTex(24, 24, (ctx) => {
    ctx.fillStyle = "#0a7883";
    ctx.beginPath();
    ctx.arc(12, 12, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d6eeef";
    ctx.font = "bold 11px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("+3", 12, 13);
  });
  const faceMat = new THREE.MeshBasicMaterial({ map: clockFace, transparent: true, side: THREE.DoubleSide });
  const rimMat = new THREE.MeshBasicMaterial({ color: 0x07606a });
  const crownMat = new THREE.MeshBasicMaterial({ color: 0xf2bd45 });
  const clocks: Pickup[] = spots.clocks.map(([i, j]) => {
    const g = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 18), rimMat);
    rim.rotation.x = Math.PI / 2;
    const f = new THREE.Mesh(new THREE.CircleGeometry(0.27, 18), faceMat);
    f.position.z = 0.045;
    const f2 = f.clone();
    f2.position.z = -0.045;
    f2.rotation.y = Math.PI;
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.08), crownMat);
    c.position.y = 0.36;
    g.add(rim, f, f2, c, glow(0x48bcc6, 1.5));
    const at = new THREE.Vector2(tileX(i) + (rand() - 0.5), tileZ(j) + (rand() - 0.5));
    g.position.set(at.x, 1.15, at.y);
    g.visible = false;
    scene.add(g);
    return { mesh: g, at, taken: false };
  });

  // The developer's leftovers: hacks you can use on him.
  const kinds: HackKind[] = ["debugger", "collab", "429", "undo"];
  const hacks = spots.hacks.map(([i, j], idx) => {
    const kind = kinds[idx % kinds.length];
    const h = HACKS[kind];
    const tex = canvasTex(48, 48, (ctx) => {
      ctx.fillStyle = "#0b0c12";
      ctx.fillRect(0, 0, 48, 48);
      ctx.strokeStyle = h.color;
      ctx.lineWidth = 3;
      ctx.strokeRect(2, 2, 44, 44);
      ctx.fillStyle = h.color;
      ctx.font = `bold ${h.label.length > 6 ? 9 : 13}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(h.label, 24, 25);
    });
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), new THREE.MeshBasicMaterial({ map: tex })), glow(h.hex, 1.7));
    const at = new THREE.Vector2(tileX(i) + 1.3 * (rand() < 0.5 ? -1 : 1), tileZ(j) + (rand() - 0.5));
    g.position.set(at.x, 1.0, at.y);
    g.visible = false;
    scene.add(g);
    return { mesh: g, at, taken: false, kind };
  });

  return {
    barriers,
    clocks,
    hacks,
    portal,
    sticker,
    setChase(on) {
      beam.visible = on;
      for (const p of [...clocks, ...hacks]) p.mesh.visible = on && !p.taken;
    },
    update(t) {
      for (const [i, m] of flickers.entries()) m.opacity = Math.sin(t * (3 + i) + i * 7) > 0.92 ? 0.25 : 1;
      deniedMat.opacity = 0.8 + Math.sin(t * 7) * 0.15;
      for (const [i, p] of [...clocks, ...hacks].entries()) {
        if (!p.mesh.visible) continue;
        p.mesh.rotation.y = t * 2.2 + i;
        p.mesh.position.y = 1.1 + Math.sin(t * 3 + i) * 0.12;
      }
    },
  };
}
