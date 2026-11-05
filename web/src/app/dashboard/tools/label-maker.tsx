"use client";

import { CircleCheck, Download, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import { Panel } from "@/components/account/bits";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { asciClause } from "@/lib/asci";
import { HINDI_LABEL_WORDS, LABEL_WORDS } from "@/lib/caption";
import { contrast } from "@/lib/daypart";
import { CLEAR_OF_UI, underUiShare } from "@/lib/details";
import { cn } from "@/lib/utils";
import { clampPosition, fileName, FRAME, isCovered, labelBox, labelSize, SAFE_SPOT, SIZES, textColourOn, type Size } from "./label";

export interface LabelKit {
  id: string;
  name: string;
  colors: { hex: string; name: string }[];
  fonts: string[];
  webFonts: string[];
}

const PLAIN_COLOURS = [
  { hex: "#121212", name: "Ink" },
  { hex: "#ffffff", name: "White" },
  { hex: "#ea4e12", name: "Orange" },
];

const noSubscribe = () => () => {};
const useMounted = () =>
  useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );

/** The kit's type first, then whatever this page is set in, which also has the Devanagari. */
const canvasFont = (size: number, family: string | null) => {
  const body = getComputedStyle(document.body).fontFamily;
  return `700 ${size}px ${family ? `"${family.replace(/["\\]/g, "")}", ` : ""}${body}`;
};

function measure(word: string, font: string) {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return 0;
  context.font = font;
  return context.measureText(word).width;
}

const hexName = (colours: { hex: string; name: string }[], hex: string) => colours.find((c) => c.hex === hex)?.name ?? hex;

export function LabelMaker({ kits }: { kits: LabelKit[] }) {
  const [kitId, setKitId] = useState(kits[0]?.id ?? "");
  const kit = kits.find((k) => k.id === kitId) ?? null;
  const colours = useMemo(() => {
    const list = kit?.colors.length ? kit.colors : PLAIN_COLOURS;
    return list.some((c) => c.hex.toLowerCase() === "#ffffff") ? list : [...list, { hex: "#ffffff", name: "White" }];
  }, [kit]);

  const [word, setWord] = useState("Paid partnership");
  const [background, setBackground] = useState(colours[0].hex);
  const [text, setText] = useState(() => textColourOn(colours[0].hex, colours.map((c) => c.hex)));
  const [size, setSize] = useState<Size>("M");
  const [spot, setSpot] = useState(SAFE_SPOT);
  const [fontsSettled, setFontsSettled] = useState(0);

  const family = kit?.webFonts[0] ?? null;
  const mounted = useMounted();
  const px = SIZES[size];
  const font = mounted ? canvasFont(px, family) : "";

  // A web font draws in the fallback until it has loaded, so measure and draw again once it has.
  useEffect(() => {
    if (!font) return;
    let live = true;
    const settled = () => {
      if (live) setFontsSettled((n) => n + 1);
    };
    document.fonts.load(font, word).then(settled, settled);
    return () => {
      live = false;
    };
  }, [font, word]);

  const textWidth = useMemo(() => (font ? measure(word, font) : 0), [font, word, fontsSettled]); // eslint-disable-line react-hooks/exhaustive-deps -- fontsSettled says the font changed under the same name
  const { width, height, radius, padX } = labelSize(textWidth, px);
  const { x, y } = clampPosition(spot.x, spot.y, width, height);
  const box = labelBox(x, y, width, height);
  const covered = isCovered(box);
  const coveredShare = Math.round(underUiShare(box) * 100);
  const ratio = contrast(text, background);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (!context || !font) return;
    context.clearRect(0, 0, FRAME.width, FRAME.height);
    const left = x * FRAME.width;
    const top = y * FRAME.height;
    context.fillStyle = background;
    context.beginPath();
    context.roundRect(left, top, width, height, radius);
    context.fill();
    context.font = font;
    context.fillStyle = text;
    context.textBaseline = "alphabetic";
    const metrics = context.measureText(word);
    context.fillText(word, left + padX, top + (height + metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2);
  }, [font, word, x, y, width, height, radius, padX, background, text, fontsSettled]);

  const frameRef = useRef<HTMLDivElement>(null);
  const grab = useRef<{ dx: number; dy: number } | null>(null);
  const place = (nx: number, ny: number) => setSpot(clampPosition(nx, ny, width, height));

  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    grab.current = { dx: (event.clientX - rect.left) / rect.width - x, dy: (event.clientY - rect.top) / rect.height - y };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect || !grab.current) return;
    place((event.clientX - rect.left) / rect.width - grab.current.dx, (event.clientY - rect.top) / rect.height - grab.current.dy);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const step = event.shiftKey ? 0.05 : 0.01;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    place(x + move[0], y + move[1]);
  }

  function chooseKit(id: string) {
    const next = kits.find((k) => k.id === id);
    const hexes = next?.colors.length ? next.colors.map((c) => c.hex) : PLAIN_COLOURS.map((c) => c.hex);
    setKitId(id);
    setBackground(hexes[0]);
    setText(textColourOn(hexes[0], hexes));
  }

  function chooseBackground(hex: string) {
    setBackground(hex);
    setText(textColourOn(hex, colours.map((c) => c.hex)));
  }

  function download() {
    const name = fileName(word, kit?.name ?? null);
    canvasRef.current?.toBlob((blob) => {
      if (!blob) {
        toast("This browser couldn't make the PNG.", { tone: "fail" });
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
      toast(`Saved ${name}: 1080 by 1920, transparent.`, { tone: "ok" });
    }, "image/png");
  }

  const zones = [
    { key: "top", style: { left: 0, right: 0, top: 0, height: `${CLEAR_OF_UI.y0 * 100}%` }, label: "Instagram's top bar" },
    { key: "bottom", style: { left: 0, right: 0, bottom: 0, height: `${(1 - CLEAR_OF_UI.y1) * 100}%` }, label: "Handle and caption" },
    { key: "right", style: { right: 0, top: `${CLEAR_OF_UI.y0 * 100}%`, bottom: `${(1 - CLEAR_OF_UI.y1) * 100}%`, width: `${(1 - CLEAR_OF_UI.x1) * 100}%` }, label: "" },
  ];

  return (
    <Panel title="Label maker">
      <div className="grid gap-8 p-5 min-[820px]:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid content-start gap-6">
          {kits.length > 1 ? (
            <label className="grid gap-1.5">
              <span className="text-sm font-semibold">Brand</span>
              <Select value={kitId} onChange={(event) => chooseKit(event.target.value)}>
                {kits.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </Select>
            </label>
          ) : (
            <p className="text-sm text-muted-foreground">
              {kit
                ? `In ${kit.name}'s colours${family ? ` and ${family}` : ""}, from its brand kit.`
                : "No brand kit to draw from yet, so these are plain colours. A brand folder reads its kit from its website on the overview."}
            </p>
          )}

          <Choices label="Words on ASCI's list (1.3a)">
            {LABEL_WORDS.map((option) => (
              <Chip key={option} active={word === option} onClick={() => setWord(option)}>
                {option}
              </Chip>
            ))}
          </Choices>
          <Choices label="In Hindi, for a Reel in Hindi (1.3b)">
            {HINDI_LABEL_WORDS.map((option) => (
              <Chip key={option} active={word === option} onClick={() => setWord(option)}>
                <span lang="hi">{option}</span>
              </Chip>
            ))}
          </Choices>

          <Choices label="Background">
            {colours.map((c) => (
              <Swatch key={c.hex} colour={c} active={background === c.hex} onClick={() => chooseBackground(c.hex)} />
            ))}
          </Choices>
          <Choices label="Text">
            {colours.map((c) => (
              <Swatch key={c.hex} colour={c} active={text === c.hex} onClick={() => setText(c.hex)} />
            ))}
            {colours.some((c) => c.hex === text) ? null : <Swatch colour={{ hex: text, name: "Best contrast" }} active onClick={() => {}} />}
          </Choices>
          <p className={cn("-mt-3 text-[13px]", ratio < 4.5 ? "font-semibold text-fail-text" : "text-muted-foreground")}>
            {hexName(colours, text)} on {hexName(colours, background)}: contrast {ratio.toFixed(1)} to 1.{ratio < 4.5 ? " Hard to read. Pick another pair." : ""}
          </p>

          <Choices label="Size">
            {(Object.keys(SIZES) as Size[]).map((option) => (
              <Chip key={option} active={size === option} onClick={() => setSize(option)}>
                {option}
              </Chip>
            ))}
          </Choices>

          <div className="grid gap-2 border-t border-border pt-5">
            <h3 className="text-sm font-semibold">Where to put it</h3>
            <ul className="grid list-disc gap-1.5 pl-4 text-sm text-pretty text-muted-foreground">
              <li>Keep it out of the top 10%, the bottom 22% and the right 14% of the frame. Instagram draws its bar, the handle and caption, and its buttons there. These zones are a guide: they shift a little by phone.</li>
              <li>Start it on the first frame and hold it for the time above, in one stretch.</li>
              <li>The PNG is 1080 by 1920 and transparent, with the label where you left it. Put it on a track above the video.</li>
            </ul>
            <p className="text-[13px] text-pretty text-muted-foreground">
              <span className="font-mono text-foreground">1.2a</span> &ldquo;{asciClause("ASCI-IG 1.2a").text}&rdquo;
            </p>
          </div>
        </div>

        <div className="order-first grid content-start justify-items-center gap-3 min-[820px]:sticky min-[820px]:top-4 min-[820px]:order-none min-[820px]:self-start">
          {kit?.webFonts.map((font2) => (
            <link key={font2} rel="stylesheet" href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(font2).replace(/%20/g, "+")}:wght@700&display=swap`} precedence="default" />
          ))}
          <div ref={frameRef} className="relative aspect-[9/16] w-full max-w-[240px] overflow-hidden rounded-[10px] border border-border bg-viewer-plate select-none min-[820px]:max-w-[280px]" aria-label="Preview over a blank Reel frame" role="group">
            <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[13px] font-semibold text-viewer-plate-foreground opacity-40">Your Reel</p>
            {zones.map((zone) => (
              <div
                key={zone.key}
                aria-hidden="true"
                className="absolute flex items-center justify-center text-[11px] font-semibold text-viewer-plate-foreground"
                style={{ ...zone.style, backgroundImage: "repeating-linear-gradient(135deg, rgb(255 255 255 / 0.14) 0 2px, transparent 2px 9px)" }}
              >
                {zone.label ? <span className="opacity-70">{zone.label}</span> : null}
              </div>
            ))}
            <canvas ref={canvasRef} width={FRAME.width} height={FRAME.height} aria-hidden="true" className="pointer-events-none absolute inset-0 size-full" />
            <button
              type="button"
              aria-label={`Label position: ${covered ? `${coveredShare}% under Instagram's UI` : "clear of Instagram's UI"}. Drag it, or use the arrow keys.`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={() => {
                grab.current = null;
              }}
              onKeyDown={onKeyDown}
              className={cn("absolute cursor-grab touch-none rounded-[4px] outline-offset-2 active:cursor-grabbing", covered && "outline-2 outline-fail")}
              style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${box[2] * 100}%`, height: `${box[3] * 100}%` }}
            />
          </div>
          <p className={cn("flex min-h-10 items-start gap-1.5 text-[13px] font-semibold text-pretty", covered ? "text-fail-text" : "text-pass-text")} role="status">
            {covered ? <TriangleAlert size={15} aria-hidden="true" className="mt-0.5 shrink-0" /> : <CircleCheck size={15} aria-hidden="true" className="mt-0.5 shrink-0" />}
            {covered ? `Instagram's UI covers ${coveredShare}% of the label here.` : "Clear of Instagram's UI. Drag it to move it."}
          </p>
          <div className="flex w-full max-w-[240px] flex-wrap gap-2 min-[820px]:max-w-[280px]">
            <Button size="compact" onClick={download} className="flex-1">
              <Download size={15} aria-hidden="true" />
              Download PNG
            </Button>
            {covered ? (
              <Button size="compact" variant="secondary" onClick={() => setSpot(SAFE_SPOT)}>
                Move it clear
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function Choices({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="grid gap-2">
      <p className="text-sm font-semibold">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "h-8 rounded-[6px] border px-2.5 text-[13px] font-semibold transition-[transform,background-color,color] duration-[120ms] ease-out active:scale-[0.97]",
        active ? "border-foreground bg-foreground text-background" : "border-border bg-background text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Swatch({ colour, active, onClick }: { colour: { hex: string; name: string }; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={`${colour.name}, ${colour.hex}`}
      title={`${colour.name} ${colour.hex}`}
      onClick={onClick}
      className={cn(
        "size-8 rounded-[6px] border border-foreground transition-transform duration-[120ms] ease-out active:scale-[0.97]",
        active && "outline-2 outline-offset-2 outline-foreground",
      )}
      style={{ background: colour.hex }}
    />
  );
}
