import { ASCI_SOURCE_URL } from "@/lib/asci";

const QUESTIONS: { q: string; a: React.ReactNode }[] = [
  {
    q: "Is this legal advice?",
    a: "No. Three Seconds checks an ad against the ASCI influencer guidelines and shows its evidence, so problems surface before the post goes live. The final call on compliance stays with you.",
  },
  {
    q: "Which videos can I check?",
    a: "Reels and Shorts as MP4 or MOV files, up to 90 seconds and 100 MB.",
  },
  {
    q: "How exact is the timing?",
    a: "It reads the video twice a second. When the label’s hold lands within half a second of what ASCI asks, it reads the edges again ten times a second, so close calls are measured to a tenth of a second. If it cannot read those frames, the check says Review instead of guessing.",
  },
  {
    q: "Does it check what’s said out loud?",
    a: "Not yet. Spoken disclosure in Hindi, Hinglish and English is being built now. Until it ships, every report says “Audio not checked yet.”",
  },
  {
    q: "Which on-screen languages does it read?",
    a: "English and Hindi labels, in Latin or Devanagari script. A Hindi label counts on a Hindi ad, as ASCI 1.3b allows.",
  },
  {
    q: "Where does my video go?",
    a: "Your browser uploads it to Vercel Blob storage under an unguessable link. The checker downloads it from there and sends the frames it samples to the model that reads them. Nothing is posted anywhere.",
  },
  {
    q: "Are the cited clauses final?",
    a: (
      <>
        Every check quotes its clause word for word from ASCI’s Guidelines for Influencer Advertising in Digital Media:
        1.2e.I and 1.2e.II for how long the label stays, 1.3a for the permitted labels and 1.3b for their language.{" "}
        <a href={ASCI_SOURCE_URL} target="_blank" rel="noreferrer" className="lp-link lp-link--underline">
          Read the guideline (PDF)
        </a>
        .
      </>
    ),
  },
  {
    q: "Who is it for?",
    a: "Agency and brand reviewers in India who approve creator Reels and Shorts before they go live, and the creators who read the same report. It was built for the Meta Global AI Developer Hackathon 2026.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="lp-faq" aria-labelledby="faq-title">
      <h2 id="faq-title" className="lp-h-l lp-faq__title">
        Questions
      </h2>
      <div className="lp-faq__list" data-rv="1">
        {QUESTIONS.map((item) => (
          <details key={item.q} name="faq" className="lp-tile">
            <summary>
              <span>{item.q}</span>
              <span className="lp-plus" aria-hidden="true">
                <i />
                <i />
              </span>
            </summary>
            <div className="lp-tile__answer">
              <p>{item.a}</p>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
