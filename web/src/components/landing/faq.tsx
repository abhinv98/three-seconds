import { Icon } from "@/components/icon";

const QUESTIONS = [
  {
    q: "Is this legal advice?",
    a: "No. Three Seconds checks an ad against the ASCI influencer guidelines and shows its evidence, so problems surface before you post. The final call on compliance stays with you.",
  },
  {
    q: "Which videos can I check?",
    a: "Reels and Shorts as MP4 or MOV, up to 90 seconds and 100 MB.",
  },
  {
    q: "Which languages does it hear?",
    a: "Hindi, Hinglish and English. Hindi stays in Devanagari and Hinglish in Latin script, the way they were said, and every line is tagged.",
  },
  {
    q: "Where does my video go?",
    a: "Straight from your browser to Vercel Blob storage, under an unguessable link. The file never passes through our servers on the way.",
  },
  {
    q: "Is there a WhatsApp version?",
    a: "Coming soon: forward a Reel to Three Seconds on WhatsApp and get the verdict back in the chat, with the fix. Where text can't be coloured, every verdict carries its sign: ✓ ✕ ◉.",
  },
  {
    q: "Are the cited clauses final?",
    a: "Not yet. During the beta every check cites ASCI-PENDING until its clause text and thresholds are verified against the published guideline. We'd rather say so than guess.",
  },
];

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-heading" className="field-zone field-faq scroll-mt-16">
      <div className="section-y mx-auto grid max-w-[1200px] gap-10 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16">
        <h2 id="faq-heading" data-rv="0" className="h-section">
          Questions,
          <span className="block text-muted-foreground">answered plainly.</span>
        </h2>
        <div data-rv="1" className="divide-y divide-border border-y border-border">
          {QUESTIONS.map((item) => (
            <details key={item.q} className="group py-1">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-sm py-3 [&::-webkit-details-marker]:hidden">
                <span className="ts-title">{item.q}</span>
                <Icon
                  name="chevron-down"
                  size={20}
                  className="text-muted-foreground transition-transform duration-200 ease-[var(--ease-out)] group-open:rotate-180"
                />
              </summary>
              <p className="ts-body max-w-[60ch] pb-5 text-pretty text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
