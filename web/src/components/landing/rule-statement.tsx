import Image from "next/image";
import { Icon } from "@/components/icon";

/** The rule and the product in one sentence, with tight crops of the things it names set into the line. */
export function RuleStatement() {
  return (
    <section className="lp-intro" aria-labelledby="intro-title">
      <h2 id="intro-title" className="sr-only">
        The rule in one sentence
      </h2>
      <p className="lp-statement" data-rv="0">
        ASCI asks for the label{" "}
        <span className="lp-thumb lp-thumb--wide">
          <Image src="/landing/crop-label.jpg" alt="“Paid partnership” under the creator’s name" width={544} height={168} />
        </span>{" "}
        on screen for three seconds, or a third of a longer{" "}
        <span className="lp-nowrap">
          video
          <span className="lp-thumb">
            <Image src="/landing/crop-face.jpg" alt="" width={240} height={200} />
          </span>
          .
        </span>{" "}
        We time it{" "}
        <span className="lp-thumb lp-thumb--span" data-ui aria-hidden="true">
          <i />
          <b />
        </span>{" "}
        and make the{" "}
        <span className="lp-nowrap">
          call
          <span className="lp-thumb lp-thumb--fail" data-ui aria-hidden="true">
            <Icon name="cross" size={16} />
          </span>
          .
        </span>
      </p>
    </section>
  );
}
