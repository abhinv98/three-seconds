import * as THREE from "three";
import { drawTick } from "@/components/landing/tick";
import { istClock } from "@/lib/ist";
import { buildCave, type Cave } from "./cave";
import { buildCity, type City } from "./city";
import { canvasTex, lam, makeKit } from "./kit";
import { makePlan, rng, scatter, type Plan } from "./maze";
import { Grid, type Rect } from "./paths";
import type { Room, Thing } from "./script";

// Everything behind the website: the cave you unzip into (cave.ts), Tickle's dimension, a city in a cave (city.ts),
// and at the end of its avenue his house, built here, with four lived-in rooms. Boxes and flat-shaded rocks, rendered
// small and scaled up so every edge is a pixel. Units are metres; -z is down the avenue towards his house.

export type { Rect };
export const EYE = 1.2;
export interface Pickable {
  id: number;
  thing: Thing;
  mesh: THREE.Object3D;
  breakable: boolean;
  color: number;
  size: number;
  home: THREE.Vector3;
}
export interface Door {
  pivot: THREE.Group;
  panel: THREE.Mesh;
  rect: Rect;
  angle: number;
  target: number;
}
export interface World {
  scene: THREE.Scene;
  solids: Rect[];
  walls: THREE.Object3D[];
  door: Door;
  cave: Cave;
  city: City;
  plan: Plan;
  /** The house and yard, for the family's walking. */
  grid: Grid;
  pickables: Pickable[];
  lightSwitch: THREE.Mesh;
  tv: THREE.Mesh;
  setLights(on: boolean): void;
  setHorror(on: boolean): void;
  setTv(on: boolean): void;
  flicker(on: boolean): void;
  silhouette(on: boolean): void;
  update(t: number, dt: number, at: THREE.Vector3, place: Place): void;
}

export type Place = "cave" | "street" | "house";
export function roomAt(x: number, z: number): Room {
  if (z > -66.1 || Math.abs(x) > 5) return "porch";
  if (z > -71) return x < -1 ? "kitchen" : "living";
  return x < 0 ? "bedroom" : "kids";
}
export const placeAt = (x: number, z: number): Place => (z > 90 ? "cave" : roomAt(x, z) === "porch" ? "street" : "house");

/** Where things are, by name, for the family's routine. */
export const SPOT = {
  porch: new THREE.Vector2(0, -65.05),
  inDoor: new THREE.Vector2(0, -66.9),
  tv: new THREE.Vector2(4.05, -68.6),
  stove: new THREE.Vector2(-3.98, -68.0),
  broom: new THREE.Vector2(-1.45, -70.4),
  toys: new THREE.Vector2(1.7, -74.3),
  rug: new THREE.Vector2(3.0, -69.7),
  window: new THREE.Vector2(3.9, -66.85),
  hideCorner: new THREE.Vector2(0.2, -66.85),
  living: new THREE.Vector2(2.6, -68.6),
  /** Where they throw you: out of the gate, on the avenue's last stretch. */
  yard: new THREE.Vector2(0, -60.4),
};

/** Somewhere to sit or lie: get there from `from`, then hop on, facing `yaw`, at `height`. */
export interface Seat {
  at: THREE.Vector2;
  from: THREE.Vector2;
  yaw: number;
  height: number;
  lie?: boolean;
}
const v2 = (x: number, z: number) => new THREE.Vector2(x, z);
export const SEATS = {
  sofa: { at: v2(1.02, -68.6), from: v2(1.82, -68.6), yaw: Math.PI / 2, height: 0.42 },
  chairN: { at: v2(-2.7, -67.0), from: v2(-2.0, -66.85), yaw: Math.PI, height: 0.42 },
  chairS: { at: v2(-2.7, -70.0), from: v2(-2.0, -70.3), yaw: 0, height: 0.42 },
  chairW: { at: v2(-4.1, -68.5), from: v2(-4.0, -67.6), yaw: Math.PI / 2, height: 0.42 },
  chairE: { at: v2(-1.3, -68.5), from: v2(-0.7, -68.5), yaw: -Math.PI / 2, height: 0.42 },
  bedMr: { at: v2(-3.35, -74.5), from: v2(-3.35, -72.75), yaw: 0, height: 0.56, lie: true },
  bedMs: { at: v2(-4.25, -74.5), from: v2(-4.25, -72.75), yaw: 0, height: 0.56, lie: true },
  bunkTop: { at: v2(4.2, -74.5), from: v2(3.15, -74.6), yaw: 0, height: 1.56, lie: true },
  bunkLow: { at: v2(4.2, -74.5), from: v2(3.15, -74.0), yaw: 0, height: 0.56, lie: true },
  underTable: { at: v2(-2.4, -68.1), from: v2(-2.0, -66.85), yaw: 0, height: 0 },
} satisfies Record<string, Seat>;

export function buildWorld(day: number): World {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07080d);
  scene.fog = new THREE.Fog(0x07080d, 7, 52);
  const solids: Rect[] = [];
  const walls: THREE.Object3D[] = [];
  const pickables: Pickable[] = [];
  const rand = rng(1810 + day);
  const k = makeKit(scene, solids, walls);
  const { box, plane } = k;
  const sky = new THREE.HemisphereLight(0x5a6890, 0x0c0b10, 0.9);
  scene.add(sky);

  const cave = buildCave(k, rand);
  const plan = makePlan(day);
  const city = buildCity(k, plan, rand, scatter(plan, day));

  // --- the yard ---------------------------------------------------------------------------------------------
  for (const x of [-4, 4]) plane(6, 3.8, x, 0.006, -64.1, lam(0x1f3a26));
  plane(1.3, 3.8, 0, 0.007, -64.1, lam(0x6f6a62));
  for (const sideX of [-1, 1]) {
    for (let x = 1.1; x <= 7; x += 0.5) box(0.08, 0.8, 0.08, sideX * x, 0, -62.2, 0xe9e1d3);
    box(6, 0.07, 0.05, sideX * 4, 0.55, -62.2, 0xe9e1d3);
    box(6, 0.07, 0.05, sideX * 4, 0.25, -62.2, 0xe9e1d3);
  }
  solids.push({ x0: -7.5, x1: -1, z0: -62.35, z1: -62.05 }, { x0: 1, x1: 7.5, z0: -62.35, z1: -62.05 });
  solids.push({ x0: -7.5, x1: -5.3, z0: -79, z1: -62.3 }, { x0: 5.3, x1: 7.5, z0: -79, z1: -62.3 }, { x0: -7.5, x1: 7.5, z0: -79, z1: -76.3 });
  box(0.12, 1.1, 0.12, 1.7, 0, -62.9, 0x2b2624, { solid: true });
  box(0.36, 0.3, 0.5, 1.7, 1.1, -62.9, 0x0a7883);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.12), k.sign("TICKLE", "#f3f1ea", 64, 22));
  plate.position.set(1.7 + 0.19, 1.27, -62.9);
  plate.rotation.y = Math.PI / 2;
  scene.add(plate);
  box(0.25, 1.4, 0.25, -4.2, 0, -63.6, 0x5a3b2a, { solid: true });
  const crownTree = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 0), lam(0x24502f));
  crownTree.position.set(-4.2, 2.1, -63.6);
  scene.add(crownTree);

  // --- the house ----------------------------------------------------------------------------------------------
  const WALL = 0xe3d6c1;
  const IN = 0xefe4d0;
  const H = 2.7;
  // outside walls, with the door gap in front
  box(4.35, H, 0.2, -2.825, 0, -66.1, WALL, { solid: true, wall: true });
  box(4.35, H, 0.2, 2.825, 0, -66.1, WALL, { solid: true, wall: true });
  box(1.3, H - 2.05, 0.2, 0, 2.05, -66.1, WALL, { wall: true });
  box(10.4, H, 0.2, 0, 0, -76.1, WALL, { solid: true, wall: true });
  box(0.2, H, 10.2, -5.1, 0, -71.1, WALL, { solid: true, wall: true });
  box(0.2, H, 10.2, 5.1, 0, -71.1, WALL, { solid: true, wall: true });
  // roof: two slopes along the ridge, and the gables front and back
  const slope = Math.atan2(1.7, 5.3);
  for (const s of [-1, 1]) {
    const roof = new THREE.Mesh(new THREE.BoxGeometry(5.7, 0.16, 10.8), lam(0x6b2a22));
    roof.position.set(s * 2.7, H + 0.86, -71.1);
    roof.rotation.z = -s * slope;
    scene.add(roof);
  }
  const gable = new THREE.Shape([new THREE.Vector2(-5.2, 0), new THREE.Vector2(5.2, 0), new THREE.Vector2(0, 1.68)]);
  for (const z of [-65.99, -76.21]) {
    const g = new THREE.Mesh(new THREE.ShapeGeometry(gable), lam(WALL));
    g.position.set(0, H, z);
    if (z < -70) g.rotation.y = Math.PI;
    scene.add(g);
  }
  box(0.5, 1.4, 0.5, 2.8, 3.4, -72, 0x5a3b2a);
  // porch
  box(2.4, 0.12, 0.7, 0, 0, -65.65, 0x8a847c);
  box(2.4, 0.08, 0.9, 0, 2.35, -65.6, 0x6b2a22);
  const porchLamp = new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: false });
  box(0.16, 0.2, 0.08, 0.95, 1.95, -65.96, porchLamp);
  const porchLight = new THREE.PointLight(0xffc98a, 6, 7, 1.6);
  porchLight.position.set(0, 2.2, -65.2);
  scene.add(porchLight);
  // the front door, hinged on the left, opening inward
  const doorPivot = new THREE.Group();
  doorPivot.position.set(-0.65, 0, -66.1);
  scene.add(doorPivot);
  const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.05, 0.08), lam(0xea4e12));
  doorPanel.position.set(0.65, 1.025, 0);
  doorPivot.add(doorPanel);
  const knob = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.12), lam(0xf2bd45));
  knob.position.set(1.12, 1.0, 0);
  doorPivot.add(knob);
  const lit: THREE.MeshBasicMaterial[] = [porchLamp];
  const doorWindow = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.09), new THREE.MeshBasicMaterial({ color: 0xf2c26b, fog: false }));
  lit.push(doorWindow.material);
  doorWindow.position.set(0.65, 1.6, 0);
  doorPivot.add(doorWindow);
  walls.push(doorPanel);

  // windows: lit from outside, the night from inside; his silhouette passes behind the living room's
  let silhouetteOn = false;
  let silhouetteX = 0;
  const winCanvas = document.createElement("canvas");
  winCanvas.width = 48;
  winCanvas.height = 32;
  const winCtx = winCanvas.getContext("2d")!;
  const winTex = new THREE.CanvasTexture(winCanvas);
  winTex.magFilter = THREE.NearestFilter;
  winTex.minFilter = THREE.NearestFilter;
  winTex.colorSpace = THREE.SRGBColorSpace;
  const paintWindow = (t: number) => {
    winCtx.fillStyle = "#f2c26b";
    winCtx.fillRect(0, 0, 48, 32);
    winCtx.fillStyle = "#e0a24a";
    winCtx.fillRect(0, 0, 6, 32);
    winCtx.fillRect(42, 0, 6, 32);
    if (silhouetteOn) {
      const cx = silhouetteX;
      const cy = 18 + Math.round(Math.sin(t * 6) * 0.6);
      winCtx.fillStyle = "#2a1d12";
      winCtx.beginPath();
      winCtx.arc(cx, cy, 9, 0, Math.PI * 2);
      winCtx.fill();
      winCtx.fillRect(cx - 4, cy - 14, 8, 4);
      winCtx.fillRect(cx - 1, cy - 11, 2, 3);
    }
    winCtx.fillStyle = "#5a3b2a";
    winCtx.fillRect(23, 0, 2, 32);
    winCtx.fillRect(0, 15, 48, 2);
    winTex.needsUpdate = true;
  };
  paintWindow(0);
  const nightMat = new THREE.MeshBasicMaterial({ color: 0x1b2440 });
  for (const x of [-3, 3]) {
    const outside = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.0),
      x > 0 ? new THREE.MeshBasicMaterial({ map: winTex, fog: false }) : new THREE.MeshBasicMaterial({ color: 0xf2c26b, fog: false }),
    );
    lit.push(outside.material);
    outside.position.set(x, 1.55, -65.99);
    scene.add(outside);
    const inside = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0), nightMat);
    inside.position.set(x, 1.55, -66.21);
    inside.rotation.y = Math.PI;
    scene.add(inside);
    box(1.7, 0.08, 0.26, x, 1.0, -66.1, 0x5a3b2a);
  }
  const sideWindow = (x: number, z: number) => {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.9), nightMat);
    w.position.set(x, 1.55, z);
    w.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
    scene.add(w);
  };
  sideWindow(-4.99, -73.5);
  sideWindow(4.99, -73.5);

  // floors and ceiling
  plane(6, 5, 2, 0.01, -68.5, lam(0xa87d55));
  plane(4, 5, -3, 0.01, -68.5, lam(0xd8d2c4));
  plane(5, 5, -2.5, 0.01, -73.5, lam(0x8a6446));
  plane(5, 5, 2.5, 0.01, -73.5, lam(0x2f6f73));
  const rugTex = canvasTex(16, 16, (ctx) => {
    ctx.fillStyle = "#b3152f";
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = "#f2bd45";
    ctx.fillRect(2, 2, 12, 12);
    ctx.fillStyle = "#b3152f";
    ctx.fillRect(4, 4, 8, 8);
  });
  plane(2.4, 2.4, 3.0, 0.015, -68.6, new THREE.MeshLambertMaterial({ map: rugTex }));
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), lam(0xe9e1d3));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, H - 0.01, -71);
  scene.add(ceiling);

  // inside walls with their doorways
  box(0.15, H, 1.1, -1, 0, -66.75, IN, { solid: true, wall: true });
  box(0.15, H, 1.3, -1, 0, -70.35, IN, { solid: true, wall: true });
  box(1.55, H, 0.15, -4.225, 0, -71, IN, { solid: true, wall: true });
  box(4.7, H, 0.15, 0, 0, -71, IN, { solid: true, wall: true });
  box(1.55, H, 0.15, 4.225, 0, -71, IN, { solid: true, wall: true });
  for (const x of [-2.9, 2.9]) box(1.1, H - 2.05, 0.15, x, 2.05, -71, IN, { wall: true });
  box(0.15, H, 5, 0, 0, -73.5, IN, { solid: true, wall: true });

  // the living room
  box(0.95, 0.42, 2.5, 0.85, 0, -68.6, 0x2f6f73, { solid: true });
  box(0.25, 0.85, 2.5, 0.42, 0, -68.6, 0x255a5d);
  for (const z of [-67.4, -69.8]) box(0.95, 0.6, 0.18, 0.85, 0, z, 0x255a5d);
  box(0.42, 0.55, 1.5, 4.72, 0, -68.6, 0x3a2a20, { solid: true });
  const tvOff = new THREE.MeshBasicMaterial({ color: 0x0d0f14 });
  const staticCanvas = document.createElement("canvas");
  staticCanvas.width = 32;
  staticCanvas.height = 24;
  const staticCtx = staticCanvas.getContext("2d")!;
  const staticTex = new THREE.CanvasTexture(staticCanvas);
  staticTex.magFilter = THREE.NearestFilter;
  const tvOn = new THREE.MeshBasicMaterial({ map: staticTex });
  const tv = box(0.08, 0.75, 1.25, 4.86, 0.6, -68.6, tvOff);
  box(0.1, 0.85, 1.38, 4.92, 0.55, -68.6, 0x121212);
  let tvIsOn = false;
  // floor lamp
  box(0.06, 1.5, 0.06, 4.45, 0, -70.4, 0x2b2624);
  const shadeOn = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  const shadeOff = lam(0x8a7a5a);
  const shade = box(0.42, 0.3, 0.42, 4.45, 1.5, -70.4, shadeOn);
  // side table with the vase by the window
  box(0.5, 0.6, 0.5, 4.5, 0, -66.75, 0x5a3b2a, { solid: true });
  // the bookshelf
  box(1.2, 1.8, 0.35, 0, 0, -70.72, 0x5a3b2a, { solid: true });
  for (const y of [0.55, 1.15]) box(1.1, 0.04, 0.3, 0, y, -70.7, 0x3a2a20);
  // the wall clock: India's time, the time they live by
  const clockCanvas = document.createElement("canvas");
  clockCanvas.width = 32;
  clockCanvas.height = 32;
  const clockCtx = clockCanvas.getContext("2d")!;
  const clockTex = new THREE.CanvasTexture(clockCanvas);
  clockTex.magFilter = THREE.NearestFilter;
  clockTex.colorSpace = THREE.SRGBColorSpace;
  const paintClock = () => {
    const [h, m] = istClock(Date.now()).split(":").map(Number);
    clockCtx.fillStyle = "#121212";
    clockCtx.beginPath();
    clockCtx.arc(16, 16, 15, 0, Math.PI * 2);
    clockCtx.fill();
    clockCtx.fillStyle = "#f3f1ea";
    clockCtx.beginPath();
    clockCtx.arc(16, 16, 13, 0, Math.PI * 2);
    clockCtx.fill();
    clockCtx.strokeStyle = "#121212";
    clockCtx.lineWidth = 2;
    const hand = (a: number, len: number) => {
      clockCtx.beginPath();
      clockCtx.moveTo(16, 16);
      clockCtx.lineTo(16 + Math.sin(a) * len, 16 - Math.cos(a) * len);
      clockCtx.stroke();
    };
    hand(((h % 12) + m / 60) * (Math.PI / 6), 7);
    hand(m * (Math.PI / 30), 11);
    clockTex.needsUpdate = true;
  };
  paintClock();
  const clock = new THREE.Mesh(new THREE.CircleGeometry(0.32, 20), new THREE.MeshBasicMaterial({ map: clockTex }));
  clock.position.set(2.4, 1.95, -70.92);
  scene.add(clock);
  // the light switch by the front door
  const lightSwitch = box(0.1, 0.16, 0.04, 0.95, 1.2, -66.0 - 0.13, 0xf3f1ea);
  lightSwitch.position.y = 1.2;

  // the kitchen: counter and stove, the fridge, the table and its four chairs
  box(0.65, 0.9, 4.4, -4.67, 0, -68.7, 0xe9e1d3, { solid: true });
  box(0.66, 0.04, 4.4, -4.67, 0.9, -68.7, 0x5b5650);
  for (const z of [-67.75, -68.3]) {
    const burner = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 10), new THREE.MeshBasicMaterial({ color: 0xff8a52 }));
    burner.position.set(-4.62, 0.95, z);
    scene.add(burner);
  }
  box(0.7, 1.9, 0.7, -4.6, 0, -70.5, 0xf3f1ea, { solid: true });
  box(1.6, 0.06, 1.8, -2.7, 0.72, -68.5, 0x8a5f3f, { solid: true });
  for (const [x, z] of [
    [-3.4, -67.7],
    [-2.0, -67.7],
    [-3.4, -69.3],
    [-2.0, -69.3],
  ])
    box(0.08, 0.72, 0.08, x, 0, z, 0x5a3b2a);
  for (const seat of [SEATS.chairN, SEATS.chairS, SEATS.chairW, SEATS.chairE]) {
    box(0.42, 0.42, 0.42, seat.at.x, 0, seat.at.y, 0x6b4a32, { solid: true });
    // a back, on the side away from the table
    const away = new THREE.Vector2(-Math.sin(seat.yaw), -Math.cos(seat.yaw)).multiplyScalar(0.19);
    const back = box(0.42, 0.5, 0.06, seat.at.x + away.x, 0.42, seat.at.y + away.y, 0x5a3b2a);
    back.rotation.y = seat.yaw;
  }

  // the bedroom
  box(2.1, 0.42, 2.8, -3.8, 0, -74.6, 0x5a3b2a, { solid: true });
  box(2.0, 0.12, 2.6, -3.8, 0.42, -74.55, 0x2f6f73);
  for (const x of [-4.3, -3.3]) box(0.7, 0.14, 0.4, x, 0.52, -75.65, 0xf3f1ea);
  box(2.2, 1.0, 0.12, -3.8, 0, -76.0, 0x5a3b2a);
  box(0.5, 0.5, 0.45, -2.35, 0, -75.6, 0x6b4a32, { solid: true });
  box(0.8, 2.0, 1.2, -0.5, 0, -73.6, 0x8a5f3f, { solid: true });

  // the kids' room
  for (const y of [0.32, 1.32]) {
    box(1.3, 0.12, 2.6, 4.2, y, -74.65, 0x5a3b2a);
    box(1.2, 0.1, 2.5, 4.2, y + 0.12, -74.65, y > 1 ? 0xf2bd45 : 0xf37a88);
  }
  for (const [x, z] of [
    [3.58, -73.38],
    [4.82, -73.38],
    [3.58, -75.92],
    [4.82, -75.92],
  ])
    box(0.08, 2.0, 0.08, x, 0, z, 0x5a3b2a);
  solids.push({ x0: 3.5, x1: 4.95, z0: -76, z1: -73.3 });
  box(0.7, 0.45, 0.45, 1.0, 0, -75.6, 0xea4e12, { solid: true });
  const posterTex = canvasTex(48, 48, (ctx) => drawTick(ctx, { mood: "hi", lcd: "HI" }, 0, true, true));
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ map: posterTex, transparent: true }));
  poster.position.set(2.2, 1.6, -75.98);
  scene.add(poster);

  // lights inside, one per room
  const houseLights = [
    [2.4, -68.6],
    [-2.8, -68.6],
    [-2.5, -73.6],
    [2.5, -73.6],
  ].map(([x, z]) => {
    const l = new THREE.PointLight(0xffd9a0, 5, 7, 1.4);
    l.position.set(x, 2.35, z);
    scene.add(l);
    box(0.3, 0.08, 0.3, x, 2.6, z, shadeOn);
    return l;
  });

  // things to pick up
  let nextId = 1;
  const pickable = (thing: Thing, mesh: THREE.Object3D, x: number, y: number, z: number, breakable: boolean, color: number, size: number) => {
    mesh.position.set(x, y, z);
    scene.add(mesh);
    pickables.push({ id: nextId++, thing, mesh, breakable, color, size, home: new THREE.Vector3(x, y, z) });
  };
  const vase = new THREE.Group();
  const vaseBody = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.32, 8), lam(0x0a7883));
  vaseBody.position.y = 0.16;
  const flower = new THREE.Mesh(new THREE.IcosahedronGeometry(0.08, 0), lam(0xf37a88));
  flower.position.y = 0.42;
  vase.add(vaseBody, flower);
  pickable("vase", vase, 4.5, 0.6, -66.75, true, 0x0a7883, 0.35);
  for (const [x, z] of [
    [-2.7, -67.85],
    [-2.7, -69.15],
    [-3.25, -68.5],
    [-2.15, -68.5],
  ]) {
    const plateMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.025, 12), lam(0xf3f1ea));
    pickable("plate", plateMesh, x, 0.79, z, true, 0xf3f1ea, 0.3);
  }
  for (const [x, z] of [
    [-2.35, -68.0],
    [-3.05, -69.0],
  ]) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.1, 8), lam(0xea4e12));
    pickable("cup", cup, x, 0.83, z, true, 0xea4e12, 0.12);
  }
  const books = new THREE.Group();
  for (const [i, c] of [0xb3152f, 0x0a7883, 0xf2bd45].entries()) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.2), lam(c));
    b.position.y = 0.03 + i * 0.065;
    books.add(b);
  }
  pickable("books", books, -0.2, 1.19, -70.7, false, 0xb3152f, 0.3);
  // The family portrait hangs on the living room's side of the kitchen wall.
  const portraitTex = canvasTex(48, 36, (ctx) => {
    ctx.fillStyle = "#5a3b2a";
    ctx.fillRect(0, 0, 48, 36);
    ctx.fillStyle = "#48bcc6";
    ctx.fillRect(2, 2, 44, 32);
    const face = document.createElement("canvas");
    face.width = 48;
    face.height = 48;
    const fctx = face.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    (
      [
        [undefined, 2, 6, 20],
        ["ms", 15, 7, 19],
        ["kid", 28, 14, 13],
        ["kid", 37, 15, 12],
      ] as const
    ).forEach(([variant, x, y, s]) => {
      drawTick(fctx, { mood: "pass", variant }, 0, true, false);
      ctx.drawImage(face, x, y, s, s);
    });
  });
  const portrait = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.48, 0.04), [
    lam(0x5a3b2a),
    lam(0x5a3b2a),
    lam(0x5a3b2a),
    lam(0x5a3b2a),
    new THREE.MeshBasicMaterial({ map: portraitTex }),
    lam(0x5a3b2a),
  ]);
  portrait.rotation.y = Math.PI / 2;
  pickable("frame", portrait, -0.905, 1.6, -70.3, true, 0x5a3b2a, 0.5);
  const alarm = new THREE.Group();
  const alarmBody = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.08), lam(0xb3152f));
  const alarmFace = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.1), new THREE.MeshBasicMaterial({ color: 0xff8a52 }));
  alarmFace.position.z = 0.041;
  alarm.add(alarmBody, alarmFace);
  pickable("clock", alarm, -2.35, 0.58, -75.6, false, 0xb3152f, 0.18);
  const teddy = new THREE.Group();
  const tBody = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), lam(0x8a5f3f));
  const tHead = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 0), lam(0x8a5f3f));
  tHead.position.y = 0.17;
  teddy.add(tBody, tHead);
  pickable("teddy", teddy, 1.0, 0.58, -75.6, false, 0x8a5f3f, 0.3);
  for (const [i, c] of [0xea4e12, 0x0a7883, 0xf2bd45].entries()) {
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), lam(c));
    pickable("blocks", block, 1.6 + i * 0.22, 0.08, -74.9 + (i % 2) * 0.18, false, c, 0.16);
  }
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.2, 10), lam(0x5b5650));
  pickable("pot", pot, -4.62, 1.04, -68.3, false, 0x5b5650, 0.3);
  const pan = new THREE.Group();
  const panDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.04, 12), lam(0x3a3a3a));
  const panHandle = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.03, 0.04), lam(0x2b2624));
  panHandle.position.x = 0.26;
  pan.add(panDisc, panHandle);
  pickable("pan", pan, -4.62, 0.97, -67.7, false, 0x3a3a3a, 0.3);
  const broom = new THREE.Group();
  const bStick = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.1, 0.04), lam(0x6b4a32));
  bStick.position.y = 0.75;
  const bHead = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.08), lam(0xd9a63a));
  bHead.position.y = 0.1;
  broom.add(bStick, bHead);
  broom.rotation.z = 0.12;
  pickable("broom", broom, -1.25, 0, -70.75, false, 0xd9a63a, 0.3);
  const sticker = city.sticker;
  pickable("sticker", sticker, sticker.position.x, sticker.position.y, sticker.position.z, false, 0xf37a88, 0.25);
  const plant = new THREE.Group();
  const plantPot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.2, 8), lam(0xb3152f));
  plantPot.position.y = 0.1;
  const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 0), lam(0x2f7a3f));
  leaves.position.y = 0.3;
  plant.add(plantPot, leaves);
  pickable("plant", plant, -1.6, 0, -66.6, true, 0xb3152f, 0.35);

  // rain on the street
  const DROPS = 700;
  const rainPos = new Float32Array(DROPS * 6);
  for (let i = 0; i < DROPS; i++) {
    const x = -9 + rand() * 18;
    const y = rand() * 10;
    const z = -rand() * 70;
    rainPos.set([x, y, z, x, y + 0.35, z], i * 6);
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0x8aa0c0, transparent: true, opacity: 0.45 }));
  scene.add(rain);

  // The family walks on a grid of the house and its yard, kept clear of every wall and stick of furniture.
  const grid = new Grid({ x0: -5.4, x1: 5.4, z0: -76.4, z1: -59.6 }, 0.2, solids, 0.24);

  let lightsOn = true;
  let horror = false;
  let flickering = false;
  let clockAt = 0;
  let windowAt = 0;
  let staticAt = 0;
  const warm = new THREE.Color(0xffd9a0);
  const blood = new THREE.Color(0xff3022);
  const applyLights = (on: boolean) => {
    for (const l of houseLights) {
      l.color.copy(horror ? blood : warm);
      l.intensity = on ? (horror ? 3.2 : 5) : 0.25;
    }
    porchLight.color.copy(horror ? blood : warm);
    porchLight.intensity = on ? 6 : 0;
    shade.material = on ? shadeOn : shadeOff;
    for (const m of lit) m.color.setHex(!on ? (m.map ? 0x2a2a38 : 0x231d1a) : horror ? (m.map ? 0xff5040 : 0xc8301e) : m.map ? 0xffffff : m === porchLamp ? 0xffd9a0 : 0xf2c26b);
  };

  return {
    scene,
    solids,
    walls,
    door: { pivot: doorPivot, panel: doorPanel, rect: { x0: -0.65, x1: 0.65, z0: -66.22, z1: -65.98 }, angle: 0, target: 0 },
    cave,
    city,
    plan,
    grid,
    pickables,
    lightSwitch,
    tv,
    setLights(on) {
      lightsOn = on;
      applyLights(on);
    },
    setHorror(on) {
      horror = on;
      (scene.fog as THREE.Fog).color.setHex(on ? 0x14040a : 0x07080d);
      (scene.background as THREE.Color).setHex(on ? 0x0e0306 : 0x07080d);
      sky.color.setHex(on ? 0x8a2a3a : 0x5a6890);
      applyLights(lightsOn);
    },
    setTv(on) {
      tvIsOn = on;
      tv.material = on ? tvOn : tvOff;
    },
    flicker(on) {
      flickering = on;
      if (!on) applyLights(lightsOn);
    },
    silhouette(on) {
      silhouetteOn = on;
      if (on) silhouetteX = 8;
      paintWindow(0);
    },
    update(t, dt, at, place) {
      // rain falls around wherever you are on the street
      rain.visible = place === "street";
      if (rain.visible) {
        const p = rainGeo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < DROPS; i++) {
          let y = p.getY(i * 2) - dt * 11;
          let x = p.getX(i * 2);
          let z = p.getZ(i * 2);
          if (y < 0 || Math.abs(x - at.x) > 12 || Math.abs(z - at.z) > 16) {
            y = y < 0 ? 9 + Math.random() : Math.random() * 10;
            x = at.x - 9 + Math.random() * 18;
            z = at.z - 12 + Math.random() * 20;
          }
          p.setXYZ(i * 2, x, y, z);
          p.setXYZ(i * 2 + 1, x, y + 0.35, z);
        }
        p.needsUpdate = true;
      }
      if (place === "cave") cave.update(t, dt);
      else city.update(t, dt);
      if (flickering) {
        const on = Math.sin(t * 23) + Math.sin(t * 7.3) > 0.4;
        for (const l of houseLights) l.intensity = on ? 5 : 0.15;
      }
      if (silhouetteOn && t - windowAt > 0.08) {
        windowAt = t;
        silhouetteX += 0.9;
        if (silhouetteX > 40) silhouetteX = 8;
        paintWindow(t);
      }
      if (tvIsOn && t - staticAt > 0.07) {
        staticAt = t;
        const img = staticCtx.createImageData(32, 24);
        for (let i = 0; i < img.data.length; i += 4) {
          const v = Math.random() * 255;
          img.data[i] = v;
          img.data[i + 1] = v;
          img.data[i + 2] = v * 1.1;
          img.data[i + 3] = 255;
        }
        staticCtx.putImageData(img, 0, 0);
        staticTex.needsUpdate = true;
      }
      if (t - clockAt > 20) {
        clockAt = t;
        paintClock();
      }
    },
  };
}
