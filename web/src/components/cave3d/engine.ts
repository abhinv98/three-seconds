import * as THREE from "three";
import { CAVE } from "./cave";
import { HACKS, type HackKind } from "./hacks";
import { girth, LEG, R, Tickle, type Held } from "./family";
import { tileAt, tileX, tileZ, walk as tileWalk } from "./maze";
import { bounds, describe, localReply, NAMES, sanitizeReply, stageOf, WHO, type Doing, type GameEvent, type GameState, type Line, type Room, type Stage, type Tone, type Who } from "./script";
import { Sound } from "./sound";
import { buildWorld, EYE, placeAt, roomAt, SEATS, SPOT, type Pickable, type Place, type Rect, type Seat, type World } from "./world";

// The game. You unzip the website and find a cave behind it, and a door. Through the door is Tickle's dimension: a
// city in a cave, and his house at the end of the avenue. Knock, slip in while he looks straight through you, and do
// what you like to the family's evening. They react at once; a writer (/api/cave) catches up with what they say.
// Push them far enough and the house goes red, they hunt you by ear and throw you out. Outside, they come at you one
// by one (kick them away), the littlest last, with his puppy eyes; then Mr Tickle grows to his true size and you run
// for the door you came in by, on three seconds and whatever clocks you can grab on the way.

export type Phase = "cave" | "warp" | "street" | "house" | "showdown" | "cutscene" | "chase" | "end";
export type Outcome = "won" | "caught" | "hesitated";
export interface Result {
  outcome: Outcome;
  /** Won: seconds left on the clock. Caught: how long the chase lasted. */
  seconds: number;
  log: string[];
}
export interface Hooks {
  hint(text: string | null): void;
  narrate(text: string): void;
  /** Every line, for the live region; `offscreen` when no bubble can be seen for it. */
  caption(text: string, offscreen: boolean): void;
  /** The indie dialogue box; resolves once the visitor has read every line. */
  dialog(lines: string[]): Promise<void>;
  /** The littlest one's puppy eyes; resolves true if the visitor kept kicking. */
  cutscene(): Promise<boolean>;
  /** The red screen: "You hesitated." */
  red(on: boolean): void;
  phase(phase: Phase): void;
  items(items: HackKind[]): void;
  end(result: Result): void;
}

const PIXEL = 3; // render at a third of the size and scale up: every edge a pixel
const RADIUS = 0.28;
const REACH = 3.4;
const CANCELLED = new Error("cancelled");
const DINNER: Record<Who, Seat> = { mr: SEATS.chairN, ms: SEATS.chairS, tick: SEATS.chairW, tock: SEATS.chairE };
const BED: Record<Who, Seat> = { mr: SEATS.bedMr, ms: SEATS.bedMs, tick: SEATS.bunkTop, tock: SEATS.bunkLow };
const WEAPON: Record<Who, Held> = { mr: "broom", ms: "pan", tick: "sword", tock: "spoon" };
const QUICK = ["What was that?", "Huh?", "Who’s there?", "Did you hear that?", "…hello?"];
const TAUNTS = [
  "THREE SECONDS.",
  "Nobody leaves without a label.",
  "I can count to three. Can you?",
  "Every second here is mine.",
  "I time everything. Even you.",
  "Run. I’ll wait. Exactly 0.0 seconds.",
];
const GIANT = 7;

/** Keeps a point on the house's floor, off the outer walls. */
function inHouse(v: THREE.Vector2) {
  return v.set(Math.max(-4.5, Math.min(4.5, v.x)), Math.max(-75.5, Math.min(-66.55, v.y)));
}
const ROOM_MIDDLE: Record<Room, THREE.Vector2> = {
  porch: new THREE.Vector2(0, -67.4),
  living: new THREE.Vector2(2.6, -68.6),
  kitchen: new THREE.Vector2(-3, -70.2),
  bedroom: new THREE.Vector2(-2.6, -73.5),
  kids: new THREE.Vector2(2.6, -73.5),
};
/** Moves a point `by` metres towards the middle of its room. */
function towardRoom(v: THREE.Vector2, by: number) {
  const mid = ROOM_MIDDLE[roomAt(v.x, v.y)];
  const d = mid.clone().sub(v);
  return d.length() > by ? v.add(d.setLength(by)) : v.copy(mid);
}

class Job {
  cancelled = false;
}
interface Wait {
  at: number;
  job?: Job;
  resolve: () => void;
  reject: (e: Error) => void;
}
interface Shard {
  mesh: THREE.Mesh;
  v: THREE.Vector3;
}
interface Mess {
  id: number;
  at: THREE.Vector2;
  room: Room;
  shards: Shard[];
  item: Pickable | null;
}
interface Flying {
  p: Pickable;
  v: THREE.Vector3;
  hit: boolean;
}

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera = new THREE.PerspectiveCamera(70, 1, 0.05, 140);
  private readonly world: World;
  readonly sound: Sound;
  private readonly family = {} as Record<Who, Tickle>;
  private readonly bubbles = {} as Record<Who, { el: HTMLDivElement; text: string; start: number; dur: number; until: number }>;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly tmp = new THREE.Vector3();
  private readonly owner = new Map<THREE.Object3D, Pickable>();
  private readonly restY = new Map<number, number>();
  private readonly keys = new Set<string>();
  private readonly player = { x: CAVE.spawn.x, z: CAVE.spawn.y, yaw: 0, pitch: -0.03 };
  private place: Place = "cave";
  private phaseNow: Phase = "cave";
  private raf = 0;
  private last = 0;
  private time = 0;
  private shake = 0;
  private stepAcc = 0;
  private drag: { x: number; y: number; moved: boolean } | null = null;
  private lastTap: { at: number; x: number; y: number } | null = null;
  private started = false;
  /** Set from prefers-reduced-motion: no camera shake. */
  calm = false;
  /** Set from (pointer: coarse): hints talk about tapping and the pad. */
  touch = false;
  private holding: Pickable | null = null;
  private flying: Flying[] = [];
  private messes: Mess[] = [];
  private nextMess = 1;
  private waits: Wait[] = [];
  private jobs: Partial<Record<Who, Job>> = {};
  private busy: Partial<Record<Who, boolean>> = {};
  private doing = {} as Record<Who, Doing>;
  private suspicion = 0;
  private count = 0;
  private knocks = 0;
  private answering = false;
  private entered = false;
  private enteredAt = 0;
  private evening: "evening" | "dinner" | "night" = "evening";
  private lightsOn = true;
  private tvOn = false;
  private hunting = false;
  private huntClock = 0;
  /** When the hunters start moving (after their faces count down from three). */
  private huntLive = 0;
  private sensed = false;
  /** Where the family last heard you; they go there. */
  private readonly heard = new THREE.Vector2(SPOT.living.x, SPOT.living.y);
  private readonly hunters = {} as Record<Who, { target: THREE.Vector2; until: number }>;
  private askTimer = 0;
  private pushPath: THREE.Vector2[] = [];
  private pushSpeed = 4.2;
  private inflight: AbortController | null = null;
  private lastAsk = -1e9;
  private lastChat = 0;
  private stinged = false;
  private seenHouse = false;
  private past: GameEvent[] = [];
  private log: string[] = [];
  private speech: Promise<void> = Promise.resolve();
  private hintShown = "";
  private disposed = false;
  // the warp between the cave and his dimension
  private readonly warpScene = new THREE.Scene();
  private readonly warpCam = new THREE.PerspectiveCamera(80, 1, 0.1, 220);
  private readonly warpLines: THREE.LineSegments;
  private warping = false;
  private warpSpeed = 0;
  // a slow camera move, for the end
  private cine: { from: THREE.Vector3; to: THREE.Vector3; yaw: number; pitch: number; t0: number; dur: number } | null = null;
  // the brawl in the yard
  private brawl: { queue: Who[]; who: Who | null; state: "charge" | "back" | "wait"; until: number; kicked: number } | null = null;
  // the chase
  private timeLeft = 3;
  private chaseFrom = 0;
  private items: HackKind[] = [];
  private told = new Set<HackKind>();
  private giant = { frozen: 0, slow: 0, stunned: 0, plan: 0, taunt: 0, history: [] as { t: number; x: number; z: number }[] };
  private readonly giantLight = new THREE.PointLight(0xff2a3a, 0, 16, 1.4);
  private grow: { from: number; to: number; t0: number; dur: number; red: boolean } | null = null;
  private sticker: { mesh: THREE.Mesh; v: THREE.Vector3; until: number } | null = null;
  private beepAt = 0;
  // effects drawn over the canvas
  private readonly flashEl: HTMLDivElement;
  private readonly vignetteEl: HTMLDivElement;
  private readonly footEl: HTMLDivElement;
  private readonly timerEl: HTMLDivElement;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly overlay: HTMLElement,
    private readonly hooks: Hooks,
    options: { sound?: Sound; day: number },
  ) {
    this.sound = options.sound ?? new Sound();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(1);
    this.camera.rotation.order = "YXZ";
    this.world = buildWorld(options.day);
    for (const p of this.world.pickables) {
      p.mesh.traverse((o) => this.owner.set(o, p));
      const b = new THREE.Box3().setFromObject(p.mesh);
      this.restY.set(p.id, p.mesh.position.y - b.min.y);
    }
    for (const who of WHO) {
      const t = new Tickle(who);
      this.family[who] = t;
      this.world.scene.add(t.root, t.shadow);
      this.doing[who] = "walking";
      const el = document.createElement("div");
      el.className = "cv3-bubble";
      el.dataset.who = who;
      overlay.appendChild(el);
      this.bubbles[who] = { el, text: "", start: 0, dur: 1, until: 0 };
    }
    this.world.scene.add(this.giantLight);
    // Where everyone is when you arrive: he is at the window, she is cooking, the kids are playing.
    this.family.mr.place(SPOT.window.x, SPOT.window.y, 0);
    this.family.ms.place(SPOT.stove.x, SPOT.stove.y, -Math.PI / 2);
    this.family.tick.place(SPOT.rug.x, SPOT.rug.y);
    this.family.tock.place(SPOT.toys.x, SPOT.toys.y);

    const fx = (cls: string) => {
      const el = document.createElement("div");
      el.className = cls;
      el.setAttribute("aria-hidden", "true");
      overlay.appendChild(el);
      return el;
    };
    this.vignetteEl = fx("cv3-vignette");
    this.footEl = fx("cv3-foot");
    this.timerEl = fx("cv3-timer");
    this.timerEl.hidden = true;
    this.flashEl = fx("cv3-flash");

    // Streaks of light, rushing past: the way from the cave to his dimension.
    const N = 520;
    const pos = new Float32Array(N * 6);
    const col = new Float32Array(N * 6);
    const tints = [new THREE.Color(0xffffff), new THREE.Color(0xff8a52), new THREE.Color(0x48bcc6), new THREE.Color(0xfff1c4)];
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.6 + Math.random() * 11;
      const z = -Math.random() * 200;
      pos.set([Math.cos(a) * r, Math.sin(a) * r, z, Math.cos(a) * r, Math.sin(a) * r, z + 1], i * 6);
      const c = tints[i % tints.length];
      col.set([c.r, c.g, c.b, c.r, c.g, c.b], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.warpLines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true }));
    this.warpScene.add(this.warpLines);
    this.warpScene.background = new THREE.Color(0x03040b);

    this.resize();
    window.addEventListener("resize", this.resize);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Into the cave. Call from a click: it also starts the sound. */
  start() {
    if (this.started) return;
    this.started = true;
    this.sound.start();
    this.sound.setPlace("cave");
    for (const who of WHO) this.live(who);
    this.later(0.5, () => {
      void this.hooks
        .dialog([
          "Hello there.",
          "You unzipped a website. Nobody does that.",
          "Mr Tickle has gone home. His door is at the back of this cave.",
          this.touch ? "Walk to it with the pad. Drag the screen to look around." : "Walk to it. W A S D or the arrow keys. Drag to look around.",
        ])
        .then(() => {
          if (this.phaseNow === "cave") this.setHint(this.touch ? "Walk to the door at the back of the cave." : "Walk to the door at the back of the cave. W A S D or the arrow keys.");
        });
    });
  }

  dispose() {
    this.disposed = true;
    window.clearTimeout(this.askTimer);
    this.inflight?.abort();
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    for (const b of Object.values(this.bubbles)) b.el.remove();
    for (const el of [this.flashEl, this.vignetteEl, this.footEl, this.timerEl]) el.remove();
    this.sound.dispose();
    this.renderer.dispose();
  }

  /** For touch: the on-screen pad presses the same keys. */
  press(key: string, down: boolean) {
    if (down) this.keys.add(key);
    else this.keys.delete(key);
  }

  private setPhase(p: Phase) {
    this.phaseNow = p;
    this.hooks.phase(p);
  }

  // --- input ----------------------------------------------------------------------------------------------
  private resize = () => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(Math.max(1, Math.round(w / PIXEL)), Math.max(1, Math.round(h / PIXEL)), false);
    for (const cam of [this.camera, this.warpCam]) {
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
  };
  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.started || (e.target instanceof HTMLElement && e.target.closest("button, a, input"))) return;
    if (e.key.startsWith("Arrow") || e.key === " ") e.preventDefault();
    if (e.repeat) return;
    if (e.key === " ") this.act();
    if (e.key === "e" || e.key === "E" || e.key === "Enter") this.interact();
    this.keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  private onBlur = () => this.keys.clear();
  private pickAt(e: { clientX: number; clientY: number }, extra: THREE.Object3D[] = []) {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const targets = [...this.world.walls, ...extra];
    return this.raycaster.intersectObjects(targets, true)[0] ?? null;
  }
  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || !this.started || this.cine || this.warping) return;
    this.sound.start();
    this.drag = { x: e.clientX, y: e.clientY, moved: false };
    if (this.place === "cave" || this.phaseNow === "end") return;
    const free = this.world.pickables.filter((p) => p.mesh.parent && p !== this.holding && !this.flying.some((f) => f.p === p));
    const hit = this.pickAt(e, free.map((p) => p.mesh));
    const p = hit ? this.owner.get(hit.object) : undefined;
    if (p && hit && hit.distance < REACH && (this.phaseNow === "street" || this.phaseNow === "house")) this.grab(p);
  };
  private onPointerMove = (e: PointerEvent) => {
    const d = this.drag;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    d.x = e.clientX;
    d.y = e.clientY;
    if (this.cine || this.pushPath.length) return;
    this.player.yaw -= dx * 0.0042;
    this.player.pitch = Math.max(-1.1, Math.min(1.1, this.player.pitch - dy * 0.0036));
  };
  /** Letting go throws what you hold; a tap clicks; two taps close together are a double-click (mouse or touch). */
  private onPointerUp = (e: PointerEvent) => {
    const d = this.drag;
    this.drag = null;
    if (this.holding) return this.release();
    if (!d || d.moved) return;
    const now = performance.now();
    const last = this.lastTap;
    if (last && now - last.at < 380 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 24) {
      this.lastTap = null;
      this.doubleClick(e);
    } else {
      this.lastTap = { at: now, x: e.clientX, y: e.clientY };
      this.click(e);
    }
  };
  /** A single click: the cave's door, the light switch, the TV, or poking a Tickle. */
  private click(e: { clientX: number; clientY: number }) {
    if (this.place === "cave") {
      const hit = this.pickAt(e, [this.world.cave.door.panel]);
      if (hit?.object === this.world.cave.door.panel && hit.distance < 4.5) void this.openCaveDoor();
      return;
    }
    const bodies = WHO.map((w) => this.family[w].root);
    const hit = this.pickAt(e, [this.world.lightSwitch, this.world.tv, ...bodies]);
    if (!hit || hit.distance > REACH + 0.6 || this.phaseNow !== "house") return;
    if (hit.object === this.world.lightSwitch) return this.toggleLights();
    if (hit.object === this.world.tv) return this.toggleTv();
    const who = WHO.find((w) => this.family[w].root.getObjectById(hit.object.id));
    if (who) this.poke(who);
  }
  private doubleClick(e: { clientX: number; clientY: number }) {
    if (this.phaseNow !== "street" && this.phaseNow !== "house") return;
    const hit = this.pickAt(e);
    if (!hit || hit.distance > REACH + 1) return;
    if (hit.object === this.world.door.panel) {
      if (this.place === "house") this.wallKnock(hit.point);
      else this.knock();
      return;
    }
    if (this.place === "house") this.wallKnock(hit.point);
  }
  /** E or Enter: the cave's door, when you are close enough. */
  private interact() {
    if (this.place === "cave" && this.near(CAVE.door, 3.4)) void this.openCaveDoor();
  }
  /** Space: a kick in the yard, a hack in the chase. */
  private act() {
    if (this.phaseNow === "showdown") this.kick();
    else if (this.phaseNow === "chase") this.useItem();
  }
  private near(at: THREE.Vector2, d: number) {
    return Math.hypot(this.player.x - at.x, this.player.z - at.y) < d;
  }

  // --- the loop -------------------------------------------------------------------------------------------
  private frame = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    // The frame's own timestamp can trail performance.now(); a step is never negative, and never more than 50 ms.
    const now = performance.now();
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000));
    this.last = now;
    this.time += dt;
    if (this.warping) {
      this.warp(dt);
      this.runWaits();
      this.renderer.render(this.warpScene, this.warpCam);
      return;
    }
    if (this.started) this.move(dt);
    this.updateDoor(dt);
    this.updateHeld(dt);
    this.updateFlying(dt);
    this.updateShards(dt);
    this.runWaits();
    if (this.grow) {
      const k = Math.min(1, (this.time - this.grow.t0) / this.grow.dur);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      this.family.mr.setGiant(this.grow.from + (this.grow.to - this.grow.from) * e, this.grow.red);
      if (k >= 1) this.grow = null;
    }
    for (const who of WHO) {
      const t = this.family[who];
      const walked = t.update(dt, this.time);
      if (walked > 0) {
        t.root.userData.step = (t.root.userData.step ?? 0) + walked;
        const stride = 0.5 * t.size;
        if (t.root.userData.step > stride) {
          t.root.userData.step = 0;
          if (t.size > 2.5) {
            const d = Math.hypot(t.pos.x - this.player.x, t.pos.y - this.player.z);
            const k = Math.max(0, 1 - d / 40);
            this.sound.stomp(0.25 + k, this.pan(t.pos));
            this.shake = Math.max(this.shake, k * 0.9);
          } else {
            const near = this.nearness(t.pos);
            if (near > 0.15) this.sound.step(this.pan(t.pos), near * 1.4);
          }
        }
      }
    }
    this.separate();
    if (this.phaseNow === "house" || this.phaseNow === "street") {
      this.routine();
      this.hunt(dt);
    }
    if (this.phaseNow === "showdown") this.fight();
    if (this.phaseNow === "chase") this.chase(dt);
    if (this.place === "cave" && Math.random() < dt * 6) this.sound.crackle(0.6);
    const eye = this.tmp.set(this.player.x, EYE, this.player.z);
    this.world.update(this.time, dt, eye, this.place);
    this.triggers();
    this.shake = Math.max(0, this.shake - dt * 1.6);
    const s = this.calm ? 0 : this.shake * 0.06;
    if (this.cine) {
      const k = Math.min(1, (this.time - this.cine.t0) / this.cine.dur);
      const e = 1 - (1 - k) ** 3;
      this.camera.position.lerpVectors(this.cine.from, this.cine.to, e);
      this.camera.rotation.set(this.cine.pitch, this.cine.yaw, 0);
    } else {
      this.camera.position.set(this.player.x + (Math.random() - 0.5) * s, EYE + (Math.random() - 0.5) * s, this.player.z + (Math.random() - 0.5) * s);
      this.camera.rotation.set(this.player.pitch, this.player.yaw, 0);
    }
    this.renderer.render(this.world.scene, this.camera);
    this.placeBubbles();
  };

  private solids(): Rect[] {
    const extra: Rect[] = [];
    const d = this.world.door;
    if (d.angle < 0.4) extra.push(d.rect);
    const c = this.world.cave.door;
    if (c.angle < 0.4) extra.push(c.rect);
    for (const b of this.world.city.barriers) if (b.mesh.visible) extra.push(b.rect);
    return extra.length ? [...this.world.solids, ...extra] : this.world.solids;
  }
  private move(dt: number) {
    const p = this.player;
    if (this.pushPath.length) {
      const target = this.pushPath[0];
      const dx = target.x - p.x;
      const dz = target.y - p.z;
      const d = Math.hypot(dx, dz);
      const step = this.pushSpeed * dt;
      if (d <= step) {
        p.x = target.x;
        p.z = target.y;
        this.pushPath.shift();
      } else {
        p.x += (dx / d) * step;
        p.z += (dz / d) * step;
      }
      if (this.phaseNow !== "warp") {
        // Shoved backwards: you watch them come at you.
        const turn = Math.atan2(dx, dz) - p.yaw;
        p.yaw += Math.atan2(Math.sin(turn), Math.cos(turn)) * Math.min(1, dt * 3);
      }
      this.setPlace(placeAt(p.x, p.z));
      return;
    }
    if (this.cine || this.phaseNow === "warp" || this.phaseNow === "end" || this.phaseNow === "cutscene") return;
    const k = (...names: string[]) => names.some((n) => this.keys.has(n));
    const f = (k("ArrowUp", "w") ? 1 : 0) - (k("ArrowDown", "s") ? 1 : 0);
    const r = (k("ArrowRight", "d") ? 1 : 0) - (k("ArrowLeft", "a") ? 1 : 0);
    if (!f && !r) return;
    const run = this.phaseNow === "chase";
    const speed = k("Shift") ? (run ? 4.7 : 3.4) : run ? 3.7 : 2.1;
    const sin = Math.sin(p.yaw);
    const cos = Math.cos(p.yaw);
    const len = Math.hypot(f, r);
    let x = p.x + ((-sin * f + cos * r) / len) * speed * dt;
    let z = p.z + ((-cos * f - sin * r) / len) * speed * dt;
    for (let pass = 0; pass < 2; pass++)
      for (const b of this.solids()) {
        const cx = Math.max(b.x0, Math.min(x, b.x1));
        const cz = Math.max(b.z0, Math.min(z, b.z1));
        const ddx = x - cx;
        const ddz = z - cz;
        const d2 = ddx * ddx + ddz * ddz;
        if (d2 >= RADIUS * RADIUS) continue;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          x = cx + (ddx / d) * RADIUS;
          z = cz + (ddz / d) * RADIUS;
        } else {
          const out = [
            [b.x0 - RADIUS - x, 0],
            [b.x1 + RADIUS - x, 0],
            [0, b.z0 - RADIUS - z],
            [0, b.z1 + RADIUS - z],
          ].sort((a, c) => Math.abs(a[0] + a[1]) - Math.abs(c[0] + c[1]))[0];
          x += out[0];
          z += out[1];
        }
      }
    this.stepAcc += Math.hypot(x - p.x, z - p.z);
    if (this.stepAcc > 0.6) {
      this.stepAcc = 0;
      this.sound.step(0, 0.5);
      this.noise(x, z, speed > 3 ? 5 : 3);
    }
    p.x = x;
    p.z = z;
    this.setPlace(placeAt(x, z));
  }
  private setPlace(next: Place) {
    if (next === this.place) return;
    this.place = next;
    this.sound.setPlace(next);
    if (next === "house" && this.phaseNow === "street") {
      this.setPhase("house");
      if (!this.entered) this.enter();
    } else if (next === "street" && this.phaseNow === "house") this.setPhase("street");
  }

  private nearness(at: THREE.Vector2) {
    return 1 / (1 + Math.hypot(at.x - this.player.x, at.y - this.player.z) / 3.5);
  }
  private pan(at: THREE.Vector2) {
    const a = Math.atan2(at.x - this.player.x, at.y - this.player.z) - (this.player.yaw + Math.PI);
    return Math.sin(a) * 0.8;
  }
  private forward(out: THREE.Vector3) {
    const p = this.player;
    return out.set(-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch));
  }
  /** A colour over everything: `to` opacity over `seconds`. */
  private flash(color: string, to: number, seconds: number) {
    this.flashEl.style.background = color;
    this.flashEl.style.transition = `opacity ${seconds}s ease`;
    this.flashEl.style.opacity = String(to);
  }

  // --- the cave, the door and the warp --------------------------------------------------------------------
  private async openCaveDoor() {
    if (this.phaseNow !== "cave" || this.warping) return;
    this.setPhase("warp");
    this.setHint(null);
    const door = this.world.cave.door;
    door.target = 1.75;
    this.sound.creak();
    // Light pours out; you are pulled in.
    for (let k = 1; k <= 10; k++) this.later(k * 0.06, () => this.world.cave.setBlaze(k / 10));
    this.player.yaw = 0;
    this.player.pitch = 0;
    this.pushSpeed = 3.2;
    this.pushPath = [new THREE.Vector2(0, 95.9)];
    this.sound.warp(3.1);
    await this.wait(0.55);
    this.flash("#ffffff", 1, 0.4);
    await this.wait(0.45);
    this.warping = true;
    this.warpSpeed = 20;
    this.flash("#ffffff", 0, 0.35);
    await this.wait(2.2);
    this.flash("#ffffff", 1, 0.25);
    await this.wait(0.3);
    this.warping = false;
    this.warpCam.fov = 80;
    this.warpCam.updateProjectionMatrix();
    door.target = 0;
    door.angle = 0;
    this.world.cave.setBlaze(0);
    this.pushPath = [];
    this.pushSpeed = 4.2;
    const portal = this.world.city.portal;
    this.player.x = portal.x;
    this.player.z = portal.y - 1.5;
    this.player.yaw = 0;
    this.player.pitch = -0.02;
    this.setPlace("street");
    this.setPhase("street");
    this.sound.boom();
    this.shake = 0.7;
    this.flash("#ffffff", 0, 0.9);
    await this.wait(1.2);
    this.hooks.narrate("Tickle’s dimension. Every street here is his. Every second, too.");
    this.setHint(this.touch ? "His house is at the end of the avenue. Walk with the pad." : "His house is at the end of the avenue. Shift to hurry.");
  }
  private warp(dt: number) {
    this.warpSpeed = Math.min(150, this.warpSpeed + dt * 110);
    const p = this.warpLines.geometry.attributes.position as THREE.BufferAttribute;
    const len = 0.6 + this.warpSpeed * 0.09;
    for (let i = 0; i < p.count; i += 2) {
      let z = p.getZ(i) + this.warpSpeed * dt;
      if (z > 2) z -= 200;
      p.setZ(i, z);
      p.setZ(i + 1, z + len);
      p.setXY(i + 1, p.getX(i), p.getY(i));
    }
    p.needsUpdate = true;
    this.warpCam.fov = 80 + Math.min(30, this.warpSpeed * 0.25);
    this.warpCam.updateProjectionMatrix();
    this.warpCam.rotation.z += dt * 0.35;
  }

  // --- his front door -------------------------------------------------------------------------------------
  private updateDoor(dt: number) {
    for (const d of [this.world.door, this.world.cave.door]) {
      d.angle += (d.target - d.angle) * Math.min(1, dt * 5);
      d.pivot.rotation.y = d.angle;
    }
  }
  private openDoor() {
    this.world.door.target = 1.6;
    this.sound.creak(this.pan(new THREE.Vector2(0, -66)));
  }
  /** Closes it unless the visitor is standing in the way. */
  private closeDoor(slam: boolean) {
    const p = this.player;
    if (Math.abs(p.x) < 0.95 && p.z < -65.3 && p.z > -67.2) return false;
    this.world.door.target = 0;
    if (slam) this.sound.slam(this.pan(new THREE.Vector2(0, -66)));
    else this.sound.thud(this.pan(new THREE.Vector2(0, -66)));
    return true;
  }
  private knock() {
    if (this.world.door.angle > 0.3 || this.answering || this.phaseNow !== "street") return;
    this.knocks += 1;
    this.sound.knock(this.pan(new THREE.Vector2(0, -66)));
    this.setHint(null);
    if (this.knocks === 1) this.hooks.narrate("You knocked. A polite intruder. How refreshing.");
    this.ask({ type: "knock", count: this.knocks });
    void this.answer();
  }
  private async answer() {
    this.answering = true;
    const who: Who = this.knocks >= 3 ? "ms" : "mr";
    const t = this.family[who];
    const job = this.claim(who);
    try {
      if (t.asleep) await this.wake(who, job);
      this.doing[who] = "answering the door";
      await this.walk(who, SPOT.inDoor, job, 1.7);
      this.openDoor();
      await this.wait(0.6, job);
      await this.walk(who, SPOT.porch, job, 1.2);
      t.face(0, -60);
      t.act = "look";
      t.mood = "surprise";
      t.lcd = "?";
      this.say(who, this.knocks > 1 ? "Not funny, kids." : "Hello?", "say");
      if (!this.entered) this.setHint("He can’t see you. Slip inside while the door is open.");
      if (this.knocks === 1) this.later(1.6, () => this.hooks.narrate("He looks right at you. He sees nothing. You are, technically, nothing."));
      await this.wait(5, job);
      t.act = "idle";
      t.lcd = undefined;
      t.mood = this.entered ? "worry" : "idle";
      if (!this.entered) this.say(who, "…Nobody.", "say");
      await this.walk(who, SPOT.inDoor, job, 1.1);
      for (let tries = 0; !this.closeDoor(this.knocks > 2); tries++) {
        if (tries === 0) this.say(who, "Huh. Something’s in the way.", "say");
        await this.wait(1.2, job);
        if (tries > 5) break;
      }
      if (this.entered || !this.nearDoor()) this.setHint(null);
    } catch (e) {
      if (e !== CANCELLED) throw e;
    } finally {
      this.answering = false;
      if (!this.busy[who] && !this.hunting && (this.phaseNow === "street" || this.phaseNow === "house")) this.live(who);
    }
  }
  private nearDoor() {
    return Math.hypot(this.player.x, this.player.z + 66) < 4.5;
  }
  private enter() {
    this.entered = true;
    this.enteredAt = this.time;
    this.world.silhouette(false);
    this.hooks.narrate("And just like that, you were inside someone else’s evening.");
    this.setHint("Drag things to pick them up. Let go and they fall. Try the light switch or the TV.");
    this.later(14, () => {
      if (!this.count && this.phaseNow === "house") this.setHint("They can’t see you. They can hear you.");
    });
  }

  // --- things ---------------------------------------------------------------------------------------------
  private onTop(p: Pickable, on: boolean) {
    p.mesh.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.renderOrder = on ? 10 : 0;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.depthTest = !on;
    });
  }
  private grab(p: Pickable) {
    this.holding = p;
    this.onTop(p, true);
    this.flying = this.flying.filter((f) => f.p !== p);
    for (const m of this.messes) if (m.item === p) m.item = null;
    this.messes = this.messes.filter((m) => m.item || m.shards.length);
    this.sound.click();
    if (p.thing === "sticker" && this.place !== "house") this.setHint("Take it to the house. He will love it.");
    if (this.place === "house") {
      const seen = WHO.some((w) => !this.family[w].asleep && this.family[w].pos.distanceTo(new THREE.Vector2(this.player.x, this.player.z)) < 4.5);
      if (seen || p.thing === "broom" || p.thing === "pan") this.meddle({ type: "steal", thing: p.thing }, null);
    }
  }
  private updateHeld(dt: number) {
    const p = this.holding;
    if (!p) return;
    const f = this.forward(new THREE.Vector3());
    const target = new THREE.Vector3(this.player.x, EYE - 0.2, this.player.z).addScaledVector(f, 0.95);
    p.mesh.position.lerp(target, 1 - Math.exp(-dt * 16));
    p.mesh.rotation.y += dt * 0.7;
  }
  private release() {
    const p = this.holding;
    if (!p) return;
    this.holding = null;
    this.onTop(p, false);
    const v = this.forward(new THREE.Vector3()).multiplyScalar(2.6);
    v.y += 0.6;
    this.flying.push({ p, v, hit: false });
  }
  private updateFlying(dt: number) {
    for (const f of [...this.flying]) {
      const m = f.p.mesh;
      f.v.y -= 9.8 * dt;
      const nx = m.position.x + f.v.x * dt;
      const nz = m.position.z + f.v.z * dt;
      const blocked = this.solids().some((b) => nx > b.x0 && nx < b.x1 && nz > b.z0 && nz < b.z1);
      if (blocked) {
        f.v.x *= -0.3;
        f.v.z *= -0.3;
      } else {
        m.position.x = nx;
        m.position.z = nz;
      }
      m.position.y += f.v.y * dt;
      m.rotation.x += dt * 4;
      if (!f.hit && this.place === "house")
        for (const who of WHO) {
          const t = this.family[who];
          if (t.centre(this.tmp).distanceTo(m.position) < 0.45 * t.size + f.p.size / 2) {
            f.hit = true;
            f.v.multiplyScalar(-0.25);
            this.sound.bonk(this.pan(t.pos));
            t.hop();
            this.meddle({ type: "throw", thing: f.p.thing, who }, t.pos.clone());
            break;
          }
        }
      // Things land on the floor, or on the furniture they were taken from.
      const rest = this.restY.get(f.p.id) ?? 0.05;
      const floor = rest + (Math.hypot(m.position.x - f.p.home.x, m.position.z - f.p.home.z) < 0.3 ? f.p.home.y : 0);
      if (m.position.y > floor) continue;
      const at = new THREE.Vector2(m.position.x, m.position.z);
      const room = roomAt(at.x, at.y);
      if (f.p.breakable && f.v.y < -2) {
        this.flying = this.flying.filter((g) => g !== f);
        this.shatter(f.p, m.position.clone());
        if (room !== "porch") this.meddle({ type: "break", thing: f.p.thing, room }, at);
        continue;
      }
      m.position.y = floor;
      if (Math.abs(f.v.y) > 1.2) {
        f.v.y *= -0.28;
        f.v.x *= 0.6;
        f.v.z *= 0.6;
        this.sound.thud(this.pan(at));
        continue;
      }
      this.flying = this.flying.filter((g) => g !== f);
      m.rotation.x = 0;
      if (f.p.thing === "clock") {
        this.sound.alarm(this.pan(at));
        if (room !== "porch") this.meddle({ type: "alarm", room }, at);
      } else if (room !== "porch") {
        this.messes.push({ id: this.nextMess++, at, room, shards: [], item: f.p });
        this.meddle({ type: "drop", thing: f.p.thing, room }, at);
      }
    }
  }
  private shatter(p: Pickable, at: THREE.Vector3) {
    p.mesh.removeFromParent();
    this.sound.smash(this.pan(new THREE.Vector2(at.x, at.z)));
    const geo = new THREE.BoxGeometry(0.06, 0.04, 0.06);
    const mat = new THREE.MeshLambertMaterial({ color: p.color, flatShading: true });
    const shards: Shard[] = [];
    for (let i = 0; i < 14; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.1, 0.05, (Math.random() - 0.5) * 0.1));
      this.world.scene.add(mesh);
      shards.push({ mesh, v: new THREE.Vector3((Math.random() - 0.5) * 3.4, 1 + Math.random() * 2.2, (Math.random() - 0.5) * 3.4) });
    }
    this.messes.push({ id: this.nextMess++, at: new THREE.Vector2(at.x, at.z), room: roomAt(at.x, at.z), shards, item: null });
  }
  private updateShards(dt: number) {
    for (const m of this.messes)
      for (const s of m.shards) {
        if (s.v.lengthSq() === 0) continue;
        s.v.y -= 9.8 * dt;
        s.mesh.position.addScaledVector(s.v, dt);
        s.mesh.rotation.x += dt * 9;
        if (s.mesh.position.y <= 0.02) {
          s.mesh.position.y = 0.02;
          s.v.set(0, 0, 0);
        }
      }
  }

  // --- what the visitor does in the house -----------------------------------------------------------------
  private toggleLights() {
    this.lightsOn = !this.lightsOn;
    this.world.setLights(this.lightsOn);
    this.sound.click();
    this.meddle({ type: "lights", on: this.lightsOn }, new THREE.Vector2(0.95, -66.4));
  }
  private toggleTv() {
    this.tvOn = !this.tvOn;
    this.world.setTv(this.tvOn);
    this.sound.setTv(this.tvOn, this.pan(SPOT.tv));
    this.meddle({ type: "tv", on: this.tvOn }, SPOT.tv.clone());
  }
  private poke(who: Who) {
    const t = this.family[who];
    t.hop();
    this.sound.bonk(this.pan(t.pos));
    this.meddle({ type: "poke", who }, t.pos.clone());
  }
  private wallKnock(point: THREE.Vector3) {
    this.sound.knock(this.pan(new THREE.Vector2(point.x, point.z)), 2);
    this.meddle({ type: "wall", room: roomAt(point.x, point.z) }, new THREE.Vector2(point.x, point.z));
  }

  /** Every act in the house: fear rises, the nearest Tickle reacts at once, and the writer is asked what they say. */
  private meddle(event: GameEvent, at: THREE.Vector2 | null) {
    if (!this.entered || (this.phaseNow !== "house" && this.phaseNow !== "street")) return;
    this.count += 1;
    this.log.push(describe(event));
    const before = this.snapshot();
    const { min, max } = bounds(before.suspicion, event, this.count);
    this.suspicion = Math.max(this.suspicion, Math.round((min + max) / 2));
    // A grab and the smash that follows are one moment; and the writer takes one request every two seconds.
    window.clearTimeout(this.askTimer);
    this.askTimer = window.setTimeout(() => this.ask(event, before), Math.max(900, this.lastAsk + 2100 - performance.now()));
    this.past.push(event);
    this.respond(event, at);
  }

  private stage(): Stage {
    return stageOf(this.suspicion);
  }

  // --- the writer -----------------------------------------------------------------------------------------
  private snapshot(): GameState {
    const family = {} as GameState["family"];
    for (const w of WHO) {
      const t = this.family[w];
      family[w] = { room: roomAt(t.pos.x, t.pos.y), doing: this.doing[w], asleep: t.asleep, armed: t.armed };
    }
    return {
      suspicion: this.suspicion,
      count: this.count,
      night: this.evening === "night",
      lights: this.lightsOn,
      tv: this.tvOn,
      mess: this.messes.length,
      family,
      past: this.past.slice(-8),
    };
  }
  /** Asks the writer for their lines; if it is busy, slow or away, the house speaks for itself straight away. */
  private ask(event: GameEvent, state = this.snapshot()) {
    if (this.disposed) return;
    const { min, max } = bounds(state.suspicion, event, state.count);
    const fallback = () => this.perform(localReply(event, state));
    if (this.inflight) {
      if (event.type === "chat") return; // small talk never interrupts
      this.inflight.abort(); // what they were about to say is stale now
    } else if (event.type === "chat" && performance.now() - this.lastAsk < 2100) return;
    const controller = new AbortController();
    this.inflight = controller;
    this.lastAsk = performance.now();
    const timer = window.setTimeout(() => controller.abort(), 12_000);
    const current = () => this.inflight === controller;
    fetch("/api/cave", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event, state }),
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { reply?: unknown } | null) => {
        if (!current()) return;
        const reply = data ? sanitizeReply(data.reply, min, max) : null;
        if (reply) this.perform(reply);
        else fallback();
      })
      // Slow, offline or refused: the house speaks for itself. Replaced by a newer request: say nothing.
      .catch(() => current() && fallback())
      .finally(() => {
        window.clearTimeout(timer);
        if (current()) this.inflight = null;
      });
  }
  private perform(reply: { lines: Line[]; narrator: string; suspicion: number }) {
    if (this.disposed || (this.phaseNow !== "house" && this.phaseNow !== "street")) return;
    if (reply.suspicion > this.suspicion) {
      this.suspicion = reply.suspicion;
      this.escalate();
      if (this.stage() === "fight" && this.entered) this.startHunt();
    }
    if (reply.narrator) this.later(0.4, () => this.hooks.narrate(reply.narrator));
    for (const line of reply.lines) this.queueLine(line.who, line.text, line.tone);
  }
  private queueLine(who: Who, text: string, tone: Tone) {
    this.speech = this.speech.then(
      () =>
        new Promise<void>((resolve) => {
          if (this.disposed || this.phaseNow === "end") return resolve();
          const dur = this.say(who, text, tone);
          window.setTimeout(resolve, dur * 1000 + 380);
        }),
    );
  }
  /** One line: a bubble over their head, their gibberish voice, and the subtitle. Returns its length in seconds. */
  private say(who: Who, text: string, tone: Tone = "say") {
    const t = this.family[who];
    const dur = Math.max(0.9, this.sound.voice(who, text, tone, this.pan(t.pos), Math.max(this.nearness(t.pos), t.size > 2 ? 0.8 : 0)));
    const b = this.bubbles[who];
    b.text = text;
    b.start = this.time;
    b.dur = dur;
    b.until = this.time + dur + 1.6;
    b.el.dataset.tone = tone;
    this.hooks.caption(`${NAMES[who]}: ${text}`, !this.inView(t.head(new THREE.Vector3())));
    return dur;
  }
  /** A silent label over someone's head, shown whole at once. */
  private label(who: Who, text: string, seconds: number) {
    const b = this.bubbles[who];
    b.text = text;
    b.start = this.time - 10;
    b.dur = 0.01;
    b.until = this.time + seconds;
    b.el.dataset.tone = "label";
  }
  /** On screen, near enough, and not behind a wall. */
  private inView(head: THREE.Vector3) {
    const eye = new THREE.Vector3(this.player.x, EYE, this.player.z);
    const dist = head.distanceTo(eye);
    const screen = head.clone().project(this.camera);
    if (screen.z >= 1 || Math.abs(screen.x) > 1.15 || Math.abs(screen.y) > 1.15 || dist > (this.phaseNow === "chase" ? 60 : 14)) return false;
    this.raycaster.set(eye, head.clone().sub(eye).normalize());
    const block = this.raycaster.intersectObjects(this.world.walls, false)[0];
    return !block || block.distance >= dist - 0.3;
  }
  private placeBubbles() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    for (const who of WHO) {
      const b = this.bubbles[who];
      const t = this.family[who];
      if (!b.text || this.time > b.until || this.cine) {
        b.el.hidden = true;
        continue;
      }
      const head = t.head(new THREE.Vector3());
      const visible = this.inView(head);
      b.el.hidden = !visible;
      if (!visible) continue;
      const screen = head.clone().project(this.camera);
      const shown = Math.min(b.text.length, Math.ceil(((this.time - b.start) / b.dur) * b.text.length));
      if (b.el.textContent !== b.text.slice(0, shown)) b.el.textContent = b.text.slice(0, shown);
      const y = Math.max(40, ((1 - screen.y) / 2) * h);
      b.el.style.transform = `translate(${((screen.x + 1) / 2) * w}px, ${y}px) translate(-50%, -100%)`;
    }
  }

  // --- the family's evening ---------------------------------------------------------------------------------
  private claim(who: Who) {
    if (this.jobs[who]) this.jobs[who]!.cancelled = true;
    const job = new Job();
    this.jobs[who] = job;
    return job;
  }
  private wait(sec: number, job?: Job) {
    return new Promise<void>((resolve, reject) => this.waits.push({ at: this.time + sec, job, resolve, reject }));
  }
  private later(sec: number, fn: () => void) {
    this.wait(sec).then(fn, () => undefined);
  }
  private runWaits() {
    const due = this.waits.filter((w) => w.job?.cancelled || this.time >= w.at);
    if (!due.length) return;
    this.waits = this.waits.filter((w) => !due.includes(w));
    for (const w of due) {
      if (w.job?.cancelled) w.reject(CANCELLED);
      else w.resolve();
    }
  }
  /** Walks round the furniture to a spot; steps down first from whatever they were sitting or lying on. */
  private async walk(who: Who, to: THREE.Vector2, job: Job, speed = 1.15) {
    const t = this.family[who];
    t.asleep = false;
    if (t.act !== "charge") t.act = "idle";
    if (t.getOff) {
      const off = t.getOff;
      t.getOff = null;
      await this.hopTo(who, off, 0, job);
    }
    t.perch = 0;
    t.seated = false;
    t.goTo(this.world.grid.route(t.pos, to), speed);
    while (t.moving) await this.wait(0.05, job);
  }
  /** A small hop from where they are to a spot at a height (onto a chair or a bed, or back down). */
  private async hopTo(who: Who, to: THREE.Vector2, height: number, job: Job) {
    const t = this.family[who];
    t.halt();
    if (t.act === "lie") t.act = "idle";
    const from = t.pos.clone();
    const h0 = t.perch;
    for (let k = 1; k <= 8; k++) {
      const e = k / 8;
      t.pos.lerpVectors(from, to, e);
      t.perch = h0 + (height - h0) * e + Math.sin(e * Math.PI) * 0.18 * t.size;
      await this.wait(0.03, job);
    }
    t.pos.copy(to);
    t.perch = height;
  }
  /** Gets on to a seat, a bed or under the table, properly: round the furniture to its side, then a hop. */
  private async settle(who: Who, seat: Seat, job: Job) {
    const t = this.family[who];
    await this.walk(who, seat.from, job);
    t.faceYaw(seat.yaw);
    await this.wait(0.15, job);
    const height = seat.height > 0 ? Math.max(0, seat.height - (seat.lie ? 0 : LEG * t.size)) : 0;
    await this.hopTo(who, seat.at, height, job);
    t.faceYaw(seat.yaw);
    t.getOff = seat.from.clone();
    t.seated = !seat.lie && seat.height > 0;
    if (seat.lie) t.act = "lie";
  }
  private async wake(who: Who, job: Job) {
    const t = this.family[who];
    t.asleep = false;
    t.mood = "surprise";
    t.lcd = "!";
    t.hop();
    await this.wait(0.6, job);
    t.lcd = undefined;
    t.mood = "idle";
  }
  /** Nobody stands inside anybody else: those on their feet nudge each other apart. */
  private separate() {
    const free = WHO.filter((w) => {
      const t = this.family[w];
      return !t.getOff && !t.flying && t.act !== "lie" && t.size < 2;
    });
    for (let i = 0; i < free.length; i++)
      for (let j = i + 1; j < free.length; j++) {
        const a = this.family[free[i]];
        const b = this.family[free[j]];
        const min = (girth(free[i]) + girth(free[j])) * 1.05;
        const d = a.pos.distanceTo(b.pos);
        if (d >= min || d < 1e-4) continue;
        const push = b.pos.clone().sub(a.pos).setLength((min - d) / 2);
        for (const [t, s] of [
          [a, -1],
          [b, 1],
        ] as const) {
          const x = t.pos.x + push.x * s;
          const z = t.pos.y + push.y * s;
          if (!this.world.grid.contains(x, z) || this.world.grid.free(x, z)) t.pos.set(x, z);
        }
      }
  }

  private eveningNow(): "evening" | "dinner" | "night" {
    if (!this.entered) return "evening";
    const since = this.time - this.enteredAt;
    return since < 70 ? "evening" : since < 130 ? "dinner" : "night";
  }
  private routine() {
    const phase = this.eveningNow();
    if (phase !== this.evening) {
      this.evening = phase;
      if (phase === "dinner" && this.stage() === "calm") this.queueLine("ms", "Dinner’s ready, Tickles!", "shout");
      if (phase === "night" && !this.hunting) {
        this.queueLine("ms", "Bedtime, everyone.", "say");
        this.later(14, () => {
          if (this.hunting || (this.phaseNow !== "house" && this.phaseNow !== "street")) return;
          this.lightsOn = false;
          this.world.setLights(false);
          if (this.tvOn) this.toggleTvQuietly(false);
        });
      }
      for (const who of WHO) if (!this.busy[who] && !this.hunting && !(this.answering && who === "mr")) this.live(who);
    }
    // They talk among themselves when nothing is happening.
    if (this.entered && !this.hunting && phase !== "night" && this.stage() === "calm" && this.time - this.lastChat > 24 && this.time - this.enteredAt > 8) {
      this.lastChat = this.time;
      this.ask({ type: "chat" });
    }
  }
  private toggleTvQuietly(on: boolean) {
    this.tvOn = on;
    this.world.setTv(on);
    this.sound.setTv(on);
  }
  /** What someone does when nothing is wrong: their part of the evening, round and round. */
  private live(who: Who) {
    const job = this.claim(who);
    this.busy[who] = false;
    this.liveLoop(who, job).catch((e) => {
      if (e !== CANCELLED) throw e;
    });
  }
  private async liveLoop(who: Who, job: Job) {
    const t = this.family[who];
    const nervous = this.stage() !== "calm";
    for (;;) {
      const phase = this.eveningNow();
      if (phase === "night") {
        this.doing[who] = "sleeping";
        await this.settle(who, BED[who], job);
        t.asleep = true;
        t.hold(t.armed ? WEAPON[who] : null);
        for (;;) {
          await this.wait(7 + Math.random() * 5, job);
          if (this.nearness(t.pos) > 0.45) this.say(who, "Zzz…", "whisper");
        }
      }
      if (phase === "dinner") {
        this.doing[who] = "eating";
        await this.settle(who, DINNER[who], job);
        t.act = "eat";
        for (let i = 0; i < 6; i++) {
          await this.wait(1.4 + Math.random(), job);
          if (this.nearness(t.pos) > 0.3) this.sound.clink(this.pan(t.pos));
        }
        await this.wait(1e6, job);
      }
      if (who === "mr") {
        this.doing.mr = "watching tv";
        await this.settle("mr", SEATS.sofa, job);
        if (this.entered && !this.tvOn && !nervous) this.toggleTvQuietly(true);
        await this.wait(16 + Math.random() * 6, job);
        this.doing.mr = "walking";
        await this.walk("mr", SPOT.window, job);
        t.faceYaw(0);
        await this.wait(4, job);
      } else if (who === "ms") {
        this.doing.ms = "cooking";
        await this.walk("ms", SPOT.stove, job);
        t.faceYaw(-Math.PI / 2);
        t.act = "cook";
        await this.wait(14 + Math.random() * 6, job);
        t.act = "idle";
        this.doing.ms = "walking";
        await this.walk("ms", new THREE.Vector2(-3.4, -67.2), job);
        t.faceYaw(Math.PI);
        await this.wait(3, job);
      } else {
        this.doing[who] = "playing";
        // The two of them keep to different corners of a game, so they never stand in each other.
        const spots =
          who === "tick"
            ? [SPOT.rug, SPOT.toys, new THREE.Vector2(2.2, -69.4)]
            : [new THREE.Vector2(2.3, -74.0), new THREE.Vector2(3.6, -69.3), new THREE.Vector2(3.4, -67.4)];
        for (const s of spots) {
          await this.walk(who, s, job, 1.4);
          t.act = Math.random() < 0.5 ? "wave" : "idle";
          if (Math.random() < 0.4) t.hop();
          await this.wait(3 + Math.random() * 3, job);
          t.act = "idle";
        }
      }
    }
  }

  // --- how they react -------------------------------------------------------------------------------------
  private respond(event: GameEvent, at: THREE.Vector2 | null) {
    const stage = this.stage();
    this.escalate();
    const where = at ?? new THREE.Vector2(this.player.x, this.player.z);
    this.heard.copy(this.floor(where.clone()));
    if (stage === "expel") return void this.catchVisitor(null);
    if (stage === "fight") {
      if (this.hunting) return this.retarget();
      return this.startHunt();
    }
    // The nearest awake Tickle notices first, out loud.
    const awake = WHO.filter((w) => !this.family[w].asleep);
    const pool = awake.length ? awake : (["mr"] as Who[]);
    const first =
      event.type === "poke" || event.type === "throw" ? event.who : pool.sort((a, b) => this.family[a].pos.distanceTo(where) - this.family[b].pos.distanceTo(where))[0];
    const t = this.family[first];
    t.hop();
    if (!t.asleep) {
      t.mood = "surprise";
      t.lcd = "!";
      t.face(where.x, where.y);
      this.say(first, QUICK[this.count % QUICK.length], "say");
    }
    if (stage === "calm") return void this.investigate(first === "tick" || first === "tock" ? "mr" : first, where, false);
    if (stage === "uneasy") {
      void this.investigate("mr", where, false);
      void this.investigate("ms", where, true);
      return;
    }
    if (stage === "aware") return void this.gather();
    return void this.armUp();
  }
  /** A point they can stand on: inside the house and not inside the furniture. */
  private floor(v: THREE.Vector2) {
    inHouse(v);
    return this.world.grid.nearestFree(v);
  }

  /** Walk over, look around, tidy up; then back to the evening. */
  private async investigate(who: Who, at: THREE.Vector2, follow: boolean) {
    const t = this.family[who];
    const job = this.claim(who);
    this.busy[who] = true;
    try {
      if (t.asleep) await this.wake(who, job);
      this.doing[who] = "looking around";
      const spot = this.floor(follow ? towardRoom(at.clone(), 0.7) : at.clone());
      await this.walk(who, spot, job, 1.5);
      t.act = "look";
      t.mood = this.stage() === "calm" ? "idle" : "worry";
      await this.wait(2.2, job);
      t.act = "idle";
      if (!follow) await this.tidy(who, job);
      t.mood = this.stage() === "calm" ? "idle" : "worry";
      t.lcd = undefined;
      if (this.stage() !== "calm") t.face(this.heard.x, this.heard.y);
      await this.wait(1, job);
    } catch (e) {
      if (e !== CANCELLED) throw e;
      return;
    }
    if (!this.hunting && (this.phaseNow === "house" || this.phaseNow === "street")) this.live(who);
  }

  /** Sweep up what broke (with the broom, if it is where it should be) and put moved things back. */
  private async tidy(who: Who, job: Job) {
    const t = this.family[who];
    for (;;) {
      const here = new THREE.Vector2(t.pos.x, t.pos.y);
      const mess = [...this.messes].sort((a, b) => a.at.distanceTo(here) - b.at.distanceTo(here))[0];
      if (!mess || mess.at.distanceTo(here) > 6) return;
      this.doing[who] = "cleaning";
      if (mess.shards.length) {
        const broom = this.world.pickables.find((p) => p.thing === "broom")!;
        const atHome = broom.mesh.parent && broom.mesh.position.distanceTo(broom.home) < 0.3 && this.holding !== broom;
        if (atHome) {
          await this.walk(who, SPOT.broom, job, 1.4);
          broom.mesh.visible = false;
          t.hold("broom");
        } else {
          this.say(who, "Where is my broom?", "say");
        }
        await this.walk(who, mess.at, job, 1.3);
        t.act = "sweep";
        for (let i = 0; i < 4; i++) {
          this.sound.sweep(this.pan(t.pos));
          await this.wait(0.45, job);
        }
        t.act = "idle";
        for (const s of mess.shards) s.mesh.removeFromParent();
        this.messes = this.messes.filter((m) => m !== mess);
        if (atHome) {
          await this.walk(who, SPOT.broom, job, 1.3);
          broom.mesh.visible = true;
          t.hold(t.armed ? WEAPON[who] : null);
        }
      } else if (mess.item) {
        const item = mess.item;
        await this.walk(who, mess.at, job, 1.3);
        if (!item.mesh.parent || this.holding === item) {
          this.messes = this.messes.filter((m) => m !== mess);
          continue;
        }
        item.mesh.visible = false;
        this.messes = this.messes.filter((m) => m !== mess);
        await this.walk(who, new THREE.Vector2(item.home.x, item.home.z), job, 1.2);
        item.mesh.position.copy(item.home);
        item.mesh.rotation.set(0, item.thing === "frame" ? Math.PI / 2 : 0, item.thing === "broom" ? 0.12 : 0);
        item.mesh.visible = true;
      } else return;
    }
  }

  /** They know someone is there: the lights stutter, the children hide, everyone turns to where you are. */
  private async gather() {
    if (!this.stinged) {
      this.stinged = true;
      this.sound.stinger();
    }
    this.world.flicker(true);
    this.later(3.5, () => this.world.flicker(false));
    for (const who of WHO) {
      const t = this.family[who];
      const job = this.claim(who);
      this.busy[who] = true;
      void (async () => {
        try {
          if (t.asleep) await this.wake(who, job);
          if (who === "tick" || who === "tock") {
            this.doing[who] = "hiding";
            if (who === "tick") await this.settle(who, SEATS.underTable, job);
            else await this.walk(who, SPOT.hideCorner, job, 1.8);
            t.act = "cower";
            t.mood = "worry";
            t.hidden = true;
          } else {
            this.doing[who] = "looking around";
            await this.walk(who, new THREE.Vector2(SPOT.living.x + (who === "ms" ? 0.8 : -0.6), SPOT.living.y), job, 1.6);
            t.mood = "worry";
            t.face(this.heard.x, this.heard.y);
            t.act = "look";
          }
          await this.wait(9, job);
          t.act = "idle";
          t.face(this.heard.x, this.heard.y);
          await this.wait(1.2, job);
        } catch (e) {
          if (e !== CANCELLED) throw e;
          return;
        }
        if (!this.hunting && (this.phaseNow === "house" || this.phaseNow === "street")) this.live(who);
      })();
    }
  }

  /** Afraid: the parents fetch the broom and the frying pan, the children stay hidden, and they wait. */
  private armUp() {
    for (const who of WHO) {
      const t = this.family[who];
      const job = this.claim(who);
      this.busy[who] = true;
      void (async () => {
        try {
          if (t.asleep) await this.wake(who, job);
          if (who === "mr" || who === "ms") {
            this.doing[who] = "guarding";
            await this.walk(who, who === "mr" ? SPOT.broom : SPOT.stove, job, 1.8);
            t.armed = true;
            t.hold(WEAPON[who]);
            t.mood = "fail";
            await this.walk(who, new THREE.Vector2(SPOT.living.x + (who === "mr" ? -0.5 : 0.5), SPOT.living.y + 0.6), job, 1.4);
          } else {
            this.doing[who] = "hiding";
            if (who === "tick") await this.settle(who, SEATS.underTable, job);
            else await this.walk(who, SPOT.hideCorner, job, 1.8);
            t.act = "cower";
            t.hidden = true;
          }
          for (;;) {
            if (!t.hidden) t.face(this.heard.x, this.heard.y);
            await this.wait(1.5, job);
          }
        } catch (e) {
          if (e !== CANCELLED) throw e;
        }
      })();
    }
  }

  /** Fight: the house goes red, everyone takes up arms, children too. Their faces count down, then they hunt by ear. */
  private startHunt() {
    if (this.hunting || this.phaseNow === "end") return;
    this.hunting = true;
    this.huntLive = this.time + 3.6;
    this.setHint(null);
    this.sound.stinger();
    this.world.flicker(true);
    this.later(1.4, () => this.world.flicker(false));
    this.lightsOn = true;
    this.world.setHorror(true);
    this.world.setLights(true);
    this.vignetteEl.style.opacity = "1";
    for (const who of WHO) {
      const t = this.family[who];
      this.claim(who);
      this.busy[who] = true;
      t.halt();
      t.getOff = null;
      t.seated = false;
      t.asleep = false;
      t.act = "idle";
      t.perch = 0;
      t.hidden = false;
      t.armed = true;
      t.hold(WEAPON[who]);
      t.mood = "spooky";
      t.setGlow(true);
      t.face(this.heard.x, this.heard.y);
      this.doing[who] = "searching";
    }
    this.say("mr", "Three seconds.", "shout");
    // They are stopwatches: the countdown is on their faces.
    for (const [i, n] of ["3", "2", "1"].entries())
      this.later(0.5 + i, () => {
        if (!this.hunting) return;
        for (const w of WHO) this.family[w].lcd = n;
        this.sound.click();
      });
    this.later(3.6, () => {
      if (!this.hunting) return;
      for (const w of WHO) this.family[w].lcd = "NO";
      this.setHint("They can’t see you. They can hear you walk. Keep away from them.");
      this.retarget();
    });
  }
  /** Something made a sound at (x, z): during the hunt, if any of them is close enough to hear it, they all come. */
  private noise(x: number, z: number, range: number) {
    if (!this.hunting) return;
    const at = new THREE.Vector2(x, z);
    if (WHO.every((w) => this.family[w].pos.distanceTo(at) > range)) return;
    this.heard.copy(this.floor(at));
    this.retarget();
  }
  /** Everyone heads for where they last heard you, a little apart from each other. */
  private retarget() {
    for (const [i, who] of WHO.entries()) {
      const a = (i / WHO.length) * Math.PI * 2;
      this.hunters[who] = { target: this.floor(this.heard.clone().add(new THREE.Vector2(Math.cos(a), Math.sin(a)).multiplyScalar(i ? 0.6 : 0))), until: 0 };
    }
    this.huntClock = 0;
  }
  private hunt(dt: number) {
    if (!this.hunting || this.time < this.huntLive) return;
    const me = new THREE.Vector2(this.player.x, this.player.z);
    if (this.place !== "house") return void this.catchVisitor(null);
    // After a long search they stop listening and simply know.
    if (!this.sensed && this.time - this.huntLive > 40) {
      this.sensed = true;
      this.say("mr", "There you are.", "whisper");
    }
    this.huntClock -= dt;
    if (this.huntClock <= 0) {
      this.huntClock = 0.6;
      for (const who of WHO) {
        const t = this.family[who];
        const h = (this.hunters[who] ??= { target: this.heard.clone(), until: 0 });
        if (this.sensed) h.target.copy(me);
        else if (!t.moving && t.pos.distanceTo(h.target) < 0.5) {
          // Nothing here: look about, then try somewhere close by.
          if (!h.until) {
            h.until = this.time + 1 + Math.random() * 1.5;
            t.act = "look";
          }
          if (this.time < h.until) continue;
          const a = Math.random() * Math.PI * 2;
          h.target = this.floor(this.heard.clone().add(new THREE.Vector2(Math.cos(a), Math.sin(a)).multiplyScalar(0.8 + Math.random() * 1.8)));
          h.until = 0;
        }
        t.act = "idle";
        t.goTo(this.world.grid.route(t.pos, h.target), who === "mr" || who === "ms" ? 1.4 : 1.2);
      }
    }
    for (const who of WHO) {
      const t = this.family[who];
      if (t.pos.distanceTo(me) < 0.42 + 0.2 * t.size) return void this.catchVisitor(who);
    }
  }

  /** Caught: whoever found you leaps at your face, then they all charge and shove you out of the front door. */
  private async catchVisitor(by: Who | null) {
    if (this.phaseNow === "showdown" || this.phaseNow === "end") return;
    this.setPhase("showdown");
    this.hunting = false;
    if (this.holding) this.release();
    this.setHint(null);
    window.clearTimeout(this.askTimer);
    this.inflight?.abort();
    this.inflight = null;
    this.world.setHorror(true);
    this.vignetteEl.style.opacity = "1";
    for (const who of WHO) {
      const t = this.family[who];
      this.claim(who);
      t.halt();
      t.getOff = null;
      t.seated = false;
      t.perch = 0;
      t.armed = true;
      t.hold(WEAPON[who]);
      t.mood = "spooky";
      t.lcd = "NO";
      t.setGlow(true);
    }
    this.shake = 1.2;
    this.sound.stinger();
    if (by) {
      // Face to face: you start back, and whoever found you leaps up to your eyes.
      const t = this.family[by];
      const away = new THREE.Vector2(this.player.x - t.pos.x, this.player.z - t.pos.y);
      if (away.lengthSq() < 1e-6) away.set(0, 1);
      away.normalize();
      for (const d of [1.1, 0.9, 0.75]) {
        const x = t.pos.x + away.x * d;
        const z = t.pos.y + away.y * d;
        if (this.solids().some((b) => x > b.x0 - RADIUS && x < b.x1 + RADIUS && z > b.z0 - RADIUS && z < b.z1 + RADIUS)) continue;
        this.player.x = x;
        this.player.z = z;
        break;
      }
      this.player.yaw = Math.atan2(-(t.pos.x - this.player.x), -(t.pos.y - this.player.z));
      this.player.pitch = 0;
      t.face(this.player.x, this.player.z);
      this.say(by, "FOUND YOU.", "shout");
      const lift = EYE - (LEG + R) * t.size;
      for (let k = 1; k <= 5; k++) {
        t.perch = (lift * k) / 5;
        await this.wait(0.03);
      }
      await this.wait(1.1);
      t.perch = 0;
    }
    this.hooks.narrate("They found you. Not with their eyes.");
    for (const who of WHO) this.family[who].act = "charge";
    this.say("mr", "OUT.", "shout");
    this.openDoor();
    const me = new THREE.Vector2(this.player.x, this.player.z);
    const out = SPOT.yard.clone();
    this.pushPath = this.place === "house" ? [...this.world.grid.route(me, SPOT.inDoor), SPOT.porch.clone(), out] : [out];
    for (const who of WHO) this.family[who].goTo(this.world.grid.route(this.family[who].pos, SPOT.inDoor), 2.4);
    await this.until(() => this.pushPath.length === 0, 12);
    this.player.yaw = 0;
    this.player.pitch = 0.05;
    await this.showdown();
  }
  private async until(test: () => boolean, limit: number) {
    const stop = this.time + limit;
    while (!test() && this.time < stop) await this.wait(0.05);
  }

  /** Dread follows their fear. */
  private escalate() {
    const stage = this.stage();
    const level = { calm: 0, uneasy: 0.15, aware: 0.45, afraid: 0.7, fight: 0.95, expel: 1 }[stage];
    this.sound.setDread(level);
  }

  // --- outside: the family comes for you ------------------------------------------------------------------
  private async showdown() {
    this.setPhase("showdown");
    // They file out of the door and line up on the path, glowing, laughing.
    const lineUp: Record<Who, THREE.Vector2> = {
      mr: new THREE.Vector2(0, -64.6),
      ms: new THREE.Vector2(-1.4, -63.9),
      tick: new THREE.Vector2(1.4, -63.9),
      tock: new THREE.Vector2(0.6, -63.3),
    };
    for (const who of WHO) {
      const t = this.family[who];
      t.act = "idle";
      t.goTo(this.world.grid.route(t.pos, lineUp[who]), 2);
    }
    await this.until(() => WHO.every((w) => !this.family[w].moving), 5);
    for (const who of WHO) {
      const t = this.family[who];
      t.face(this.player.x, this.player.z);
      t.act = "laugh";
      t.lcd = "HA";
    }
    this.sound.laugh();
    this.sound.setDread(1);
    this.shake = 0.5;
    this.hooks.narrate("Outside, at last. You would think that was safer.");
    await this.wait(2.4);
    // He grows. The others come at you, one at a time.
    this.grow = { from: 1, to: 2.7, t0: this.time, dur: 3.2, red: false };
    this.family.mr.act = "laugh";
    this.sound.roar();
    for (const who of ["ms", "tick", "tock"] as Who[]) {
      this.family[who].act = "idle";
      this.family[who].lcd = "NO";
    }
    this.setHint(this.touch ? "Tap KICK when they come close." : "SPACE to kick them away.");
    this.brawl = { queue: ["ms", "tick", "tock"], who: null, state: "wait", until: this.time + 1.2, kicked: 0 };
  }
  private fight() {
    const b = this.brawl;
    if (!b) return;
    const me = new THREE.Vector2(this.player.x, this.player.z);
    if (!b.who) {
      if (!b.queue.length || this.time < b.until) return;
      b.who = b.queue.shift()!;
      b.state = "charge";
      this.say(b.who, b.who === "ms" ? "Out of our garden!" : b.who === "tick" ? "For the family!" : "…I’m not scared of you.", "shout");
    }
    const who = b.who;
    const t = this.family[who];
    if (t.flying) return;
    if (b.state === "charge") {
      t.act = "charge";
      t.goTo([me.clone()], who === "ms" ? 2.4 : 2.8);
      if (t.pos.distanceTo(me) < 0.75) {
        // Hit: it hurts, a bit. They fall back and come again.
        this.sound.ouch();
        this.shake = 0.9;
        this.flash("#b3152f", 0.45, 0.08);
        this.later(0.15, () => this.flash("#b3152f", 0, 0.5));
        const back = t.pos.clone().sub(me).setLength(1.6).add(t.pos);
        const push = me.clone().sub(t.pos).setLength(0.6);
        this.player.x += push.x;
        this.player.z += push.y;
        t.goTo([back], 2.2);
        b.state = "back";
      }
    } else if (b.state === "back" && !t.moving) {
      b.state = "wait";
      b.until = this.time + 0.7;
      t.face(me.x, me.y);
    } else if (b.state === "wait" && this.time > b.until) b.state = "charge";
  }
  /** Space in the yard: a kick. Whoever is close and in front of you goes flying; the littlest one gets a moment. */
  private kick() {
    const b = this.brawl;
    this.footEl.classList.remove("is-kick");
    void this.footEl.offsetWidth;
    this.footEl.classList.add("is-kick");
    const who = b?.who;
    const t = who ? this.family[who] : null;
    const me = new THREE.Vector2(this.player.x, this.player.z);
    let ahead = 9;
    if (t) {
      const toward = Math.atan2(-(t.pos.x - me.x), -(t.pos.y - me.y)) - this.player.yaw;
      ahead = Math.abs(Math.atan2(Math.sin(toward), Math.cos(toward)));
    }
    if (!b || !who || !t || t.flying || t.pos.distanceTo(me) > 1.8 || ahead > 1.1) {
      this.sound.kick(false);
      return;
    }
    if (who === "tock") return void this.puppyEyes();
    this.sound.kick(true, this.pan(t.pos));
    const dir = t.pos.clone().sub(me).normalize();
    t.launch(dir.x * 6, 5, dir.y * 6);
    t.hold(null);
    t.setGlow(false);
    this.shake = 0.6;
    b.who = null;
    b.kicked += 1;
    b.until = this.time + 1.1;
    this.log.push(`You kicked ${NAMES[who]} across the garden.`);
    if (who === "ms") this.later(0.6, () => this.hooks.narrate("You kicked Ms Tickle across her own garden. Somewhere, a dinner goes cold."));
  }
  private async puppyEyes() {
    const tock = this.family.tock;
    this.setPhase("cutscene");
    this.setHint(null);
    tock.halt();
    tock.act = "idle";
    tock.mood = "puppy";
    tock.lcd = undefined;
    tock.setGlow(false);
    this.sound.whimper();
    const kicked = await this.hooks.cutscene();
    if (!kicked) {
      this.log.push("You hesitated. Tock did not.");
      return void this.finale("hesitated");
    }
    this.setPhase("showdown");
    this.sound.kick(true, this.pan(tock.pos));
    const me = new THREE.Vector2(this.player.x, this.player.z);
    const dir = tock.pos.clone().sub(me).normalize();
    tock.launch(dir.x * 7, 6, dir.y * 7);
    tock.hold(null);
    this.log.push("You kicked Tock. He was the littlest.");
    this.brawl = null;
    await this.wait(1.2);
    await this.rage();
  }

  // --- the chase ------------------------------------------------------------------------------------------
  private async rage() {
    const mr = this.family.mr;
    mr.face(this.player.x, this.player.z);
    mr.act = "charge";
    mr.mood = "spooky";
    mr.lcd = "NO";
    mr.setGlow(true);
    this.grow = { from: mr.size, to: GIANT, t0: this.time, dur: 2.2, red: true };
    this.sound.roar();
    this.shake = 1.4;
    // The roar blows you back up the avenue, so you see all of him.
    this.player.yaw = 0;
    this.player.pitch = 0.18;
    this.pushSpeed = 9;
    this.pushPath = [new THREE.Vector2(this.player.x * 0.5, -53.5)];
    this.giantLight.intensity = 9;
    this.hooks.narrate("You kicked a child. Mr Tickle is not taking it well.");
    await this.wait(1.2);
    // His streets close: barriers slam down across the avenue.
    for (const [i, b] of this.world.city.barriers.entries())
      this.later(i * 0.45, () => {
        b.mesh.visible = true;
        this.sound.slamBarrier(this.pan(new THREE.Vector2(0, b.rect.z0)));
        this.shake = Math.max(this.shake, 0.6);
      });
    this.world.city.setChase(true);
    await this.wait(1.4);
    this.pushSpeed = 4.2;
    this.player.pitch = 0.1;
    this.say("mr", "THREE SECONDS.", "shout");
    this.setPhase("chase");
    this.timeLeft = 3;
    this.chaseFrom = this.time;
    this.giant = { frozen: 0, slow: 0, stunned: 0, plan: 0, taunt: this.time + 6, history: [] };
    this.timerEl.hidden = false;
    this.setHint(
      this.touch
        ? "Run for the door you came in by: follow the beam of light. Every clock is +3 seconds."
        : "Run for the door you came in by: follow the beam of light. Every clock is +3 seconds. Shift to sprint.",
    );
    this.hooks.narrate("Three seconds. The clocks are yours, if you can reach them.");
  }
  private chase(dt: number) {
    const me = new THREE.Vector2(this.player.x, this.player.z);
    const mr = this.family.mr;
    // The clock: yours runs down; his doesn't.
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    const shown = this.timeLeft.toFixed(1);
    if (this.timerEl.textContent !== shown) this.timerEl.textContent = shown;
    if (this.timeLeft < 2) this.timerEl.dataset.urgent = "";
    else delete this.timerEl.dataset.urgent;
    if (this.timeLeft < 3 && Math.ceil(this.timeLeft) !== this.beepAt) {
      this.beepAt = Math.ceil(this.timeLeft);
      if (this.timeLeft > 0) this.sound.beep(this.timeLeft < 1.5);
    }
    if (this.timeLeft <= 0) return void this.finale("caught");
    // Clocks and hacks, grabbed by walking through them.
    for (const c of this.world.city.clocks) {
      if (c.taken || c.at.distanceTo(me) > 1.25) continue;
      c.taken = true;
      c.mesh.visible = false;
      this.timeLeft += 3;
      this.sound.chime();
      this.timerEl.classList.remove("is-bonus");
      void this.timerEl.offsetWidth;
      this.timerEl.classList.add("is-bonus");
    }
    for (const h of this.world.city.hacks) {
      if (h.taken || h.at.distanceTo(me) > 1.25 || this.items.length >= 3) continue;
      h.taken = true;
      h.mesh.visible = false;
      this.items.push(h.kind);
      this.hooks.items([...this.items]);
      this.sound.pickup();
      if (!this.told.has(h.kind)) {
        this.told.add(h.kind);
        this.setHint(`${HACKS[h.kind].tells} ${this.touch ? "Tap USE." : "SPACE to use."}`);
      }
    }
    // The door home.
    if (this.world.city.portal.distanceTo(me) < 2) return void this.finale("won");
    // A thrown sticker in flight.
    if (this.sticker) {
      const s = this.sticker;
      s.v.y -= 6 * dt;
      s.mesh.position.addScaledVector(s.v, dt);
      s.mesh.rotation.x += dt * 12;
      const c = mr.centre(this.tmp);
      if (c.distanceTo(s.mesh.position) < R * mr.size * 1.3) {
        this.giant.stunned = this.time + 3;
        this.label("mr", "COLLAB?!", 2.6);
        this.sound.roar();
        this.shake = 0.8;
        s.mesh.removeFromParent();
        this.sticker = null;
      } else if (this.time > s.until || s.mesh.position.y < 0) {
        s.mesh.removeFromParent();
        this.sticker = null;
      }
    }
    // Him: footsteps that shake the street, the way through his streets to wherever you are.
    this.giant.history.push({ t: this.time, x: mr.pos.x, z: mr.pos.y });
    while (this.giant.history.length && this.giant.history[0].t < this.time - 8) this.giant.history.shift();
    this.giantLight.position.set(mr.pos.x, 5, mr.pos.y);
    const held = this.time < this.giant.frozen || this.time < this.giant.stunned;
    if (held) mr.halt();
    else if ((this.giant.plan -= dt) <= 0) {
      this.giant.plan = 0.45;
      const ramp = Math.min(1, (this.time - this.chaseFrom) / 3);
      const speed = 3.0 * ramp * (this.time < this.giant.slow ? 0.35 : 1) + 0.2;
      mr.act = "charge";
      mr.goTo(this.giantRoute(mr.pos, me), speed);
    }
    if (this.time > this.giant.taunt && !held) {
      this.giant.taunt = this.time + 6 + Math.random() * 4;
      this.say("mr", TAUNTS[Math.floor(Math.random() * TAUNTS.length)], "shout");
    }
    const reach = 1.1 + R * mr.size * 0.9;
    if (!held && mr.pos.distanceTo(me) < reach) return void this.finale("caught");
  }
  /** His way to you: straight at you when you are close, otherwise down the streets (through his own barriers). */
  private giantRoute(from: THREE.Vector2, to: THREE.Vector2): THREE.Vector2[] {
    if (from.distanceTo(to) < 7) return [to.clone()];
    const clampJ = (j: number) => Math.max(0, Math.min(12, j));
    const [ai, aj] = tileAt(from.x, from.y);
    const [bi, bj] = tileAt(to.x, to.y);
    const a: [number, number] = [ai, clampJ(aj)];
    const b: [number, number] = [bi, clampJ(bj)];
    const tiles = tileWalk(this.world.plan, a, b);
    const pts = tiles.slice(1).map(([i, j]) => new THREE.Vector2(tileX(i), tileZ(j)));
    if (aj > 12) pts.unshift(new THREE.Vector2(tileX(a[0]), tileZ(12)));
    pts.push(to.clone());
    return pts;
  }
  /** Space in the chase: the next of the developer's hacks. */
  private useItem() {
    const kind = this.items.shift();
    if (!kind) return;
    this.hooks.items([...this.items]);
    this.sound.hack();
    const mr = this.family.mr;
    if (kind === "debugger") {
      this.giant.frozen = this.time + 3;
      this.label("mr", "⏸ Paused in debugger", 3);
    } else if (kind === "429") {
      this.giant.slow = this.time + 6;
      this.label("mr", "429 Too Many Requests", 3);
    } else if (kind === "undo") {
      const back = this.giant.history.find((h) => h.t >= this.time - 6) ?? this.giant.history[0];
      if (back) mr.place(back.x, back.z, mr.yaw);
      this.giant.plan = 0;
      this.label("mr", "Ctrl+Z", 2);
    } else {
      // The sticker: thrown where you look.
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.24, 0.04), new THREE.MeshBasicMaterial({ color: 0xf37a88 }));
      mesh.position.set(this.player.x, EYE - 0.2, this.player.z);
      this.world.scene.add(mesh);
      const v = this.forward(new THREE.Vector3()).multiplyScalar(16);
      v.y += 2.5;
      this.sticker = { mesh, v, until: this.time + 2.5 };
    }
  }

  // --- the end --------------------------------------------------------------------------------------------
  /** However it ends, you are back in the cave by the door, and the camera draws back towards the website. */
  private async finale(outcome: Outcome) {
    if (this.phaseNow === "end") return;
    const seconds = outcome === "won" ? this.timeLeft : outcome === "caught" ? this.time - this.chaseFrom : 0;
    this.setPhase("end");
    this.setHint(null);
    this.items = [];
    this.hooks.items([]);
    this.timerEl.hidden = true;
    this.brawl = null;
    if (outcome === "caught") {
      // Up close: his face fills the sky.
      const mr = this.family.mr;
      mr.halt();
      mr.place(this.player.x - Math.sin(this.player.yaw) * 4.5, this.player.z - Math.cos(this.player.yaw) * 4.5);
      mr.face(this.player.x, this.player.z);
      const c = mr.centre(new THREE.Vector3());
      this.player.pitch = Math.atan2(c.y - EYE, 4.5);
      this.label("mr", this.timeLeft <= 0 ? "TIME." : "GOT YOU.", 2);
      this.sound.roar();
      this.shake = 1.6;
      this.log.push(this.timeLeft <= 0 ? "Your three seconds ran out." : "He caught you.");
      await this.wait(1.4);
      this.flash("#b3152f", 1, 0.25);
      await this.wait(0.6);
      this.flash("#050608", 1, 0.4);
      await this.wait(0.5);
    } else if (outcome === "hesitated") {
      this.hooks.red(true);
      await this.wait(4.6);
      this.flash("#050608", 1, 0.3);
      await this.wait(0.4);
      this.hooks.red(false);
    } else {
      this.log.push(`You reached the door with ${this.timeLeft.toFixed(1)} seconds left.`);
      this.flash("#ffffff", 1, 0.35);
      this.sound.warp(1.2);
      await this.wait(0.5);
    }
    // Back by the cave's door, which closes; the camera draws back to the website.
    this.vignetteEl.style.opacity = "0";
    this.sound.setDread(0);
    this.giantLight.intensity = 0;
    this.world.city.setChase(false);
    for (const b of this.world.city.barriers) b.mesh.visible = false;
    this.world.cave.door.target = 0;
    this.world.cave.door.angle = 0;
    this.world.cave.setBlaze(0);
    this.player.x = CAVE.door.x;
    this.player.z = CAVE.door.y + 0.3;
    this.player.yaw = 0;
    this.player.pitch = 0;
    this.setPlace("cave");
    this.flash(outcome === "won" ? "#ffffff" : "#050608", 0, 0.8);
    if (outcome === "won") {
      this.sound.boom();
      await this.hooks.dialog([`You made it out with ${this.timeLeft.toFixed(1)} seconds to spare.`, "He will remember that. He remembers everything, to the tenth."]);
    } else await this.wait(1.0);
    this.cine = {
      from: new THREE.Vector3(this.player.x, EYE, this.player.z),
      to: new THREE.Vector3(0, EYE + 0.5, CAVE.front - 0.6),
      yaw: 0,
      pitch: -0.05,
      t0: this.time,
      dur: 2.8,
    };
    await this.wait(3.0);
    this.hooks.end({ outcome, seconds, log: this.log });
  }

  // --- moments on the way ---------------------------------------------------------------------------------
  private setHint(text: string | null) {
    if ((text ?? "") === this.hintShown) return;
    this.hintShown = text ?? "";
    this.hooks.hint(text);
  }
  private triggers() {
    const p = this.player;
    if (this.phaseNow === "cave") {
      // Walking right up to it opens it too.
      if (this.started && p.z < CAVE.door.y - 0.2 && Math.abs(p.x) < 1) return void this.openCaveDoor();
      const close = this.near(CAVE.door, 3.4);
      const door = this.touch ? "Tap the door to open it." : "Click the door, or press E, to open it.";
      if (close) this.setHint(door);
      else if (this.hintShown === door) this.setHint(null);
      return;
    }
    if (this.phaseNow !== "street") return;
    if (!this.seenHouse && p.z < -26) {
      this.seenHouse = true;
      this.world.silhouette(true);
      this.hooks.narrate("There. In the window at the end of the avenue. Someone is home.");
    }
    const knock = this.touch ? "Double-tap the door to knock." : "Double-click the door to knock.";
    if (!this.entered && !this.answering && this.world.door.angle < 0.2 && this.nearDoor()) this.setHint(knock);
    else if (!this.entered && this.hintShown === knock && !this.nearDoor()) this.setHint(null);
  }
}
