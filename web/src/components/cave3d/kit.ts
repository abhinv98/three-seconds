import * as THREE from "three";
import type { Rect } from "./paths";

// Building blocks shared by the cave, the city and the house: flat-shaded boxes, pixel canvas textures, signs.

export const lam = (color: number) => new THREE.MeshLambertMaterial({ color, flatShading: true });

export function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, repeat = false) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** A soft round glow, for sprites that should read from far off in the dark. */
let glowTex: THREE.CanvasTexture | null = null;
export function glow(color: number, size: number) {
  glowTex ??= (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.45)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  })();
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  s.scale.setScalar(size);
  return s;
}

export interface Kit {
  scene: THREE.Scene;
  solids: Rect[];
  walls: THREE.Object3D[];
  box(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    color: number | THREE.Material | THREE.Material[],
    o?: { solid?: boolean; wall?: boolean; parent?: THREE.Object3D },
  ): THREE.Mesh;
  plane(w: number, d: number, x: number, y: number, z: number, material: THREE.Material): THREE.Mesh;
  sign(text: string, color: string, w: number, h: number): THREE.MeshBasicMaterial;
}

export function makeKit(scene: THREE.Scene, solids: Rect[], walls: THREE.Object3D[]): Kit {
  return {
    scene,
    solids,
    walls,
    box(w, h, d, x, y, z, color, o = {}) {
      const material = typeof color === "number" ? lam(color) : color;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      m.position.set(x, y + h / 2, z);
      (o.parent ?? scene).add(m);
      if (o.solid) solids.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
      if (o.wall) walls.push(m);
      return m;
    },
    plane(w, d, x, y, z, material) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, y, z);
      scene.add(m);
      return m;
    },
    sign(text, color, w, h) {
      return new THREE.MeshBasicMaterial({
        transparent: true,
        map: canvasTex(w, h, (ctx) => {
          ctx.font = `bold ${Math.floor(h * 0.62)}px Arial, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.lineWidth = 3;
          ctx.strokeStyle = "rgba(0,0,0,0.6)";
          ctx.strokeText(text, w / 2, h / 2 + 1);
          ctx.fillStyle = color;
          ctx.fillText(text, w / 2, h / 2 + 1);
        }),
      });
    },
  };
}
