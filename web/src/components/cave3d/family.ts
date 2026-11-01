import * as THREE from "three";
import { drawTick, type TickMood } from "@/components/landing/tick";
import type { Who } from "./script";

// The Tickles in 3D: a stopwatch case on two legs with two arms, the crown on top, and the landing page's own pixel
// face (components/landing/tick.tsx) painted live onto the front, so their eyes, moods and LCD mouth carry over.

export type Held = "broom" | "pan" | "sword" | "spoon" | "plate" | "gift";
export type Act = "idle" | "sit" | "lie" | "sweep" | "cook" | "eat" | "cower" | "look" | "charge" | "wave" | "laugh";

const SPEC: Record<Who, { scale: number; crown: number; variant?: "ms" | "kid" }> = {
  mr: { scale: 1, crown: 0xea4e12 },
  ms: { scale: 0.94, crown: 0x0a7883, variant: "ms" },
  tick: { scale: 0.66, crown: 0xf2bd45, variant: "kid" },
  tock: { scale: 0.6, crown: 0xf2bd45, variant: "kid" },
};
export const R = 0.34;
const DEPTH = 0.2;
export const LEG = 0.17;
/** How wide each of them is, for keeping out of each other's way. */
export const girth = (who: Who) => R * SPEC[who].scale;

const lambert = (color: number) => new THREE.MeshLambertMaterial({ color, flatShading: true });
const block = (w: number, h: number, d: number, color: number) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lambert(color));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false });

/** The things a Tickle can carry. */
export function heldMesh(kind: Held): THREE.Object3D {
  const g = new THREE.Group();
  const add = (m: THREE.Mesh, x: number, y: number, z: number) => {
    m.position.set(x, y, z);
    g.add(m);
  };
  if (kind === "broom") {
    add(block(0.035, 0.95, 0.035, 0x6b4a32), 0, 0.05, 0);
    add(block(0.18, 0.16, 0.07, 0xd9a63a), 0, -0.48, 0);
  } else if (kind === "pan") {
    const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.04, 12), lambert(0x3a3a3a));
    pan.rotation.x = Math.PI / 2;
    add(pan, 0, -0.26, 0.05);
    add(block(0.04, 0.24, 0.03, 0x2b2624), 0, -0.06, 0);
  } else if (kind === "sword") {
    add(block(0.04, 0.42, 0.015, 0xc9c6bd), 0, -0.24, 0);
    add(block(0.14, 0.03, 0.04, 0x6b4a32), 0, -0.02, 0);
  } else if (kind === "spoon") {
    add(block(0.03, 0.3, 0.02, 0x8a5f3f), 0, -0.12, 0);
    add(block(0.09, 0.1, 0.03, 0x8a5f3f), 0, -0.3, 0);
  } else if (kind === "plate") {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.02, 14), lambert(0xf3f1ea));
    add(plate, 0, -0.08, 0.08);
  } else {
    add(block(0.18, 0.15, 0.18, 0xea4e12), 0, -0.1, 0.06);
    add(block(0.04, 0.16, 0.19, 0xb3152f), 0, -0.1, 0.06);
  }
  return g;
}

export class Tickle {
  readonly who: Who;
  readonly root = new THREE.Group();
  /** A soft dark disc on the floor under them. The engine adds it to the scene. */
  readonly shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 16), shadowMat);
  /** x and z of the feet. */
  readonly pos = new THREE.Vector2();
  yaw = 0;
  private turnTo: number | null = null;
  path: THREE.Vector2[] = [];
  speed = 1.15;
  private pace = 0;
  act: Act = "idle";
  /** Height of whatever they sit or lie on. */
  perch = 0;
  /** Sitting on something: legs out in front, whatever the arms are doing. */
  seated = false;
  /** Where to step down to before walking anywhere, after sitting or lying on furniture. */
  getOff: THREE.Vector2 | null = null;
  mood: TickMood = "idle";
  lcd: string | undefined;
  look: [number, number] | undefined;
  held: Held | null = null;
  armed = false;
  asleep = false;
  hidden = false;
  /** Kicked: flying through the air until they land. */
  private fly: THREE.Vector3 | null = null;
  private air = 0;
  private spin = 0;
  private readonly upper = new THREE.Group();
  private readonly legs: THREE.Group[] = [];
  private readonly arms: THREE.Group[] = [];
  private readonly hand = new THREE.Group();
  private readonly bodyMat: THREE.MeshLambertMaterial;
  private readonly outline: THREE.Mesh;
  private heldObj: THREE.Object3D | null = null;
  private readonly faceCtx: CanvasRenderingContext2D;
  private readonly faceTex: THREE.CanvasTexture;
  private readonly variant: "ms" | "kid" | undefined;
  private readonly base: number;
  private phase = 0;
  private faceClock = 0;
  private readonly seed = Math.random() * 20;
  private jumpT = 0;

  constructor(who: Who) {
    this.who = who;
    const spec = SPEC[who];
    this.variant = spec.variant;
    this.base = spec.scale;
    this.root.rotation.order = "YXZ";
    this.root.scale.setScalar(spec.scale);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = 1;

    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.11, LEG, 0);
      const leg = block(0.07, LEG, 0.07, 0x121212);
      leg.position.y = -LEG / 2;
      const foot = block(0.13, 0.045, 0.17, 0x121212);
      foot.position.set(0, -LEG + 0.02, 0.03);
      hip.add(leg, foot);
      this.root.add(hip);
      this.legs.push(hip);
    }

    this.upper.position.y = LEG;
    this.root.add(this.upper);
    const caseGeo = new THREE.CylinderGeometry(R, R, DEPTH, 28);
    caseGeo.rotateX(Math.PI / 2);
    this.bodyMat = lambert(0x121212);
    const body = new THREE.Mesh(caseGeo, this.bodyMat);
    body.position.y = R;
    this.upper.add(body);
    // In the horror beats they glow at the edges: a slightly larger case, drawn from behind.
    const rim = new THREE.CylinderGeometry(R * 1.13, R * 1.13, DEPTH * 1.5, 28);
    rim.rotateX(Math.PI / 2);
    this.outline = new THREE.Mesh(rim, new THREE.MeshBasicMaterial({ color: 0xff2a3a, side: THREE.BackSide, fog: false }));
    this.outline.position.y = R;
    this.outline.visible = false;
    this.upper.add(this.outline);

    const canvas = document.createElement("canvas");
    canvas.width = 48;
    canvas.height = 48;
    this.faceCtx = canvas.getContext("2d")!;
    this.faceTex = new THREE.CanvasTexture(canvas);
    this.faceTex.magFilter = THREE.NearestFilter;
    this.faceTex.minFilter = THREE.NearestFilter;
    this.faceTex.generateMipmaps = false;
    this.faceTex.colorSpace = THREE.SRGBColorSpace;
    // Only the face disc of the 48 x 48 sprite (centre 24, 27, radius 13.5) goes on the front.
    this.faceTex.repeat.set(27 / 48, 27 / 48);
    this.faceTex.offset.set(10.5 / 48, 1 - 40.5 / 48);
    const face = new THREE.Mesh(new THREE.CircleGeometry(R * 0.88, 28), new THREE.MeshBasicMaterial({ map: this.faceTex }));
    face.position.set(0, R, DEPTH / 2 + 0.003);
    this.upper.add(face);

    const stem = block(0.05, 0.08, 0.05, 0x121212);
    stem.position.set(0, 2 * R + 0.03, 0);
    const crown = block(0.22, 0.09, 0.09, spec.crown);
    crown.position.set(0, 2 * R + 0.1, 0);
    const button = block(0.07, 0.07, 0.07, spec.crown);
    button.position.set(R * 0.74, 2 * R * 0.9, 0);
    this.upper.add(stem, crown, button);
    if (spec.variant === "ms") {
      for (const s of [-1, 1]) {
        const bow = block(0.09, 0.07, 0.03, 0xf37a88);
        bow.position.set(-R * 0.72 + s * 0.05, 2 * R * 0.92, DEPTH / 2);
        bow.rotation.z = s * 0.5;
        this.upper.add(bow);
      }
    }

    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * (R + 0.02), R * 1.05, 0);
      const arm = block(0.04, 0.24, 0.04, 0x121212);
      arm.position.y = -0.12;
      const fist = block(0.07, 0.07, 0.07, 0x121212);
      fist.position.y = -0.25;
      shoulder.add(arm, fist);
      this.upper.add(shoulder);
      this.arms.push(shoulder);
    }
    this.hand.position.y = -0.25;
    this.arms[1].add(this.hand);
    this.paint(0);
  }

  get moving() {
    return this.path.length > 0;
  }
  get flying() {
    return this.fly !== null;
  }
  get size() {
    return this.root.scale.x;
  }
  goTo(points: THREE.Vector2[], speed = 1.15) {
    this.path = points.map((p) => p.clone());
    this.speed = speed;
    this.act = this.act === "charge" ? "charge" : "idle";
    this.perch = 0;
    this.seated = false;
    this.hidden = false;
  }
  halt() {
    this.path = [];
    this.pace = 0;
  }
  face(x: number, z: number) {
    this.turnTo = Math.atan2(x - this.pos.x, z - this.pos.y);
  }
  faceYaw(yaw: number) {
    this.turnTo = yaw;
  }
  place(x: number, z: number, yaw = this.yaw) {
    this.pos.set(x, z);
    this.yaw = yaw;
    this.turnTo = null;
    this.path = [];
  }
  hop() {
    this.jumpT = 0.35;
  }
  /** Sent flying by a kick: (x, y, z) metres per second. */
  launch(x: number, y: number, z: number) {
    this.path = [];
    this.perch = 0;
    this.seated = false;
    this.act = "idle";
    this.fly = new THREE.Vector3(x, y, z);
    this.spin = 0;
  }
  hold(kind: Held | null) {
    if (this.heldObj) this.hand.remove(this.heldObj);
    this.heldObj = null;
    this.held = kind;
    if (kind) {
      this.heldObj = heldMesh(kind);
      this.hand.add(this.heldObj);
    }
  }
  /** Red eyes and a glowing edge: the horror beats. */
  setGlow(on: boolean) {
    this.outline.visible = on;
  }
  /** His true size in his own dimension, red with rage. */
  setGiant(scale: number, red: boolean) {
    this.root.scale.setScalar(scale);
    this.bodyMat.color.setHex(red ? 0x6e0a16 : 0x121212);
    this.bodyMat.emissive.setHex(red ? 0x3a0008 : 0x000000);
  }
  /** Back to their own size and colour. */
  reset() {
    this.setGiant(this.base, false);
  }
  /** Where a speech bubble hangs: a little above the crown. */
  head(out: THREE.Vector3) {
    out.set(0, LEG + 2 * R + 0.42, 0);
    if (this.act === "lie") out.set(0, 0.3, -0.2);
    return this.root.localToWorld(out);
  }
  /** World position of the case's centre, for hits and nearness. */
  centre(out: THREE.Vector3) {
    return out.set(this.pos.x, this.perch + this.air + (LEG + R) * this.root.scale.x, this.pos.y);
  }

  private paint(t: number) {
    drawTick(
      this.faceCtx,
      {
        mood: this.asleep ? "sleep" : this.mood,
        lcd: this.lcd,
        look: this.look,
        variant: this.variant,
        steady: true,
      },
      t + this.seed,
      false,
      false,
    );
    this.faceTex.needsUpdate = true;
  }

  /** Moves along the path and animates; returns metres walked this frame (for footsteps). */
  update(dt: number, t: number) {
    let walked = 0;
    const s = this.root.scale.x;
    if (this.fly) {
      // A kick: a tumbling arc, a bump on landing, then flat on their back with stars in their eyes.
      this.pos.x += this.fly.x * dt;
      this.pos.y += this.fly.z * dt;
      this.fly.y -= 14 * dt;
      this.air = Math.max(0, this.air + this.fly.y * dt);
      this.spin += dt * 11;
      if (this.air === 0 && this.fly.y < 0) {
        if (Math.abs(this.fly.y) > 3) {
          this.fly.set(this.fly.x * 0.35, Math.abs(this.fly.y) * 0.3, this.fly.z * 0.35);
        } else {
          this.fly = null;
          this.spin = 0;
          this.act = "lie";
          this.mood = "dizzy";
        }
      }
    } else if (this.path.length) {
      const target = this.path[0];
      const dx = target.x - this.pos.x;
      const dz = target.y - this.pos.y;
      const d = Math.hypot(dx, dz);
      if (d > 0.01) this.turnTo = Math.atan2(dx, dz);
      // Turn first when the way is behind them, then walk; ease in, and slow down for the last step.
      const facing = Math.abs(wrap((this.turnTo ?? this.yaw) - this.yaw)) < 1.3;
      let left = d;
      for (let i = 1; i < this.path.length; i++) left += this.path[i].distanceTo(this.path[i - 1]);
      const want = facing ? Math.min(this.speed, 0.35 + left * 2.4) : 0;
      this.pace += Math.max(-dt * 6, Math.min(dt * 5, want - this.pace));
      const step = this.pace * dt;
      if (d <= step) {
        this.pos.copy(target);
        this.path.shift();
        walked = d;
      } else if (step > 0) {
        this.pos.x += (dx / d) * step;
        this.pos.y += (dz / d) * step;
        walked = step;
      }
      if (!this.path.length) this.pace = 0;
    }
    if (this.turnTo !== null) {
      const diff = wrap(this.turnTo - this.yaw);
      this.yaw += diff * Math.min(1, dt * 9);
      if (Math.abs(diff) < 0.01) this.turnTo = null;
    }

    const walking = walked > 0;
    this.phase += (walked / s) * (this.act === "charge" ? 7 : 9);
    const swing = walking ? Math.sin(this.phase) * 0.6 : 0;
    const lying = this.act === "lie";
    this.jumpT = Math.max(0, this.jumpT - dt);
    const jump = this.jumpT > 0 ? Math.sin((this.jumpT / 0.35) * Math.PI) * 0.22 * s : 0;
    this.root.position.set(this.pos.x, this.perch + this.air + jump, this.pos.y);
    this.root.rotation.y = this.yaw;
    this.root.rotation.x = this.fly ? -this.spin : lying ? -Math.PI / 2 : 0;
    this.root.visible = true;
    const lift = this.air + jump;
    this.shadow.position.set(this.pos.x, this.perch + 0.012, this.pos.y);
    this.shadow.scale.setScalar(R * s * (lying ? 1.5 : 1.15) * Math.max(0.35, 1 - lift * 0.5));

    const sitting = this.seated || this.act === "sit";
    this.legs[0].rotation.x = sitting ? -1.45 : swing;
    this.legs[1].rotation.x = sitting ? -1.45 : -swing;
    this.arms[0].rotation.set(-swing * 0.8, 0, 0);
    this.arms[1].rotation.set(swing * 0.8, 0, 0);
    this.upper.position.y = LEG + (walking ? Math.abs(Math.sin(this.phase)) * 0.03 : Math.sin((t + this.seed) * 2.2) * 0.006);
    this.upper.rotation.set(0, 0, 0);
    this.upper.scale.set(1, 1, 1);
    this.upper.position.x = 0;
    const k = t + this.seed;
    switch (this.act) {
      case "sweep":
        this.arms[1].rotation.set(-0.5 + Math.sin(k * 13) * 0.55, 0, 0.2);
        this.arms[0].rotation.set(-0.5 + Math.sin(k * 13) * 0.4, 0, -0.2);
        break;
      case "cook":
        this.arms[1].rotation.set(-1.1 + Math.sin(k * 7) * 0.25, 0, Math.cos(k * 7) * 0.25);
        break;
      case "eat":
        this.arms[1].rotation.set(-1.3 + Math.abs(Math.sin(k * 3.2)) * 0.6, 0, 0);
        break;
      case "wave":
        this.arms[1].rotation.set(0, 0, 2.5 + Math.sin(k * 12) * 0.35);
        break;
      case "look":
        this.upper.rotation.y = Math.sin(k * 2.2) * 0.65;
        break;
      case "cower":
        this.upper.scale.set(1.04, 0.9, 1);
        this.upper.position.x = Math.sin(k * 40) * 0.008;
        this.arms[0].rotation.set(-2.2, 0, 0.4);
        this.arms[1].rotation.set(-2.2, 0, -0.4);
        break;
      case "charge":
        this.upper.rotation.x = 0.28;
        this.arms[1].rotation.set(-2.4 + Math.sin(k * 10) * 0.3, 0, 0);
        break;
      case "laugh":
        // Head thrown back, shoulders shaking.
        this.upper.rotation.x = -0.22 + Math.sin(k * 26) * 0.05;
        this.arms[0].rotation.set(-0.4, 0, -0.9 + Math.sin(k * 20) * 0.2);
        this.arms[1].rotation.set(-0.4, 0, 0.9 - Math.sin(k * 20) * 0.2);
        break;
    }
    if (this.armed && this.act !== "charge" && this.act !== "sweep" && this.act !== "laugh") this.arms[1].rotation.set(-1.5 + Math.sin(k * 3) * 0.08, 0, 0);

    this.faceClock -= dt;
    if (this.faceClock <= 0) {
      this.faceClock = 1 / 14;
      this.paint(t);
    }
    return walked;
  }
}
