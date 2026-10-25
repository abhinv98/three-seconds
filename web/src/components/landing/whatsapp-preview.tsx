import { Icon } from "@/components/icon";

/** The planned WhatsApp flow, using the design system's chat tokens. Marked as coming soon. */
export function WhatsAppPreview() {
  return (
    <section id="whatsapp" aria-labelledby="wa-heading" className="scroll-mt-16 border-y border-border bg-card">
      <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-2 lg:gap-16">
        <div>
          <p className="font-mono text-[12px] leading-4 text-brand-text">Coming soon</p>
          <h2 id="wa-heading" className="mt-3 text-[clamp(2.25rem,5vw,3.75rem)] leading-[1.02] font-extrabold tracking-[-0.02em] text-balance">
            Forward the Reel. Get the call back.
          </h2>
          <p className="ts-body mt-5 max-w-[46ch] text-pretty text-muted-foreground lg:text-[17px] lg:leading-7">
            Creators will forward a Reel to Three Seconds on WhatsApp and get the verdict in the chat, with the fix. No
            upload page, no login. Where text can&apos;t be coloured, every verdict carries its sign: ✓ ✕ ◉.
          </p>
        </div>

        <div className="mx-auto w-full max-w-[360px]">
          <div className="rounded-[36px] bg-viewer-plate p-2.5 shadow-[0_30px_80px_-35px_rgb(18_18_18/0.6)]">
            <div className="overflow-hidden rounded-[28px] bg-muted">
              <div className="flex items-center gap-3 bg-background px-4 py-3">
                <span className="flex size-9 items-center justify-center rounded-full bg-brand text-brand-foreground">
                  <svg viewBox="1.5 1.5 24.6 22" className="h-4" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M23.8 9.6 C23 8.4 22 8 20.7 8 C18.8 8 17.5 9.2 17.5 10.9 C17.5 12.8 19.1 13.6 20.8 14.3 C22.7 15.1 24.1 15.9 24.1 18 C24.1 20.2 22.5 21.5 20.5 21.5 H3.5" />
                    <path d="M3.5 3.5 H8.5 A4.25 4.25 0 0 1 8.5 12 A4.75 4.75 0 0 1 8.5 21.5" />
                    <path d="M8.5 12 H6" />
                  </svg>
                </span>
                <div className="leading-tight">
                  <p className="ts-body-sm font-semibold">Three Seconds</p>
                  <p className="ts-caption text-muted-foreground">checks against the ASCI guidelines</p>
                </div>
              </div>
              <div className="flex flex-col gap-2.5 px-3 py-4">
                <div className="ml-auto max-w-[80%] rounded-[14px] rounded-tr-[4px] bg-chat-out px-3 py-2">
                  <p className="ts-body-sm flex items-center gap-2 font-semibold">
                    <Icon name="film" size={16} />
                    glow-serum-reel.mp4
                  </p>
                  <p className="ts-caption text-muted-foreground">0:28 · Can you check this before I post?</p>
                  <p className="ts-caption mt-0.5 text-right text-muted-foreground">9:41</p>
                </div>
                <div className="max-w-[88%] rounded-[14px] rounded-tl-[4px] bg-chat-in px-3 py-2">
                  <p className="ts-body-sm font-bold">✕ FAIL · Label held 1.8s.</p>
                  <p className="ts-body-sm mt-0.5">It&apos;s gone before the brand appears at 00:03.0.</p>
                  <p className="ts-body-sm mt-2">
                    <span className="font-semibold">Fix:</span> keep &ldquo;Paid partnership&rdquo; on screen while the brand
                    is visible, 00:03.0 to 00:27.0.
                  </p>
                  <p className="ts-body-sm mt-2">◉ REVIEW · Label is in English, speech is Hinglish.</p>
                  <p className="ts-body-sm">✓ PASS · Spoken disclosure at 00:21.0.</p>
                  <p className="ts-caption mt-1 text-right text-muted-foreground">9:41</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
