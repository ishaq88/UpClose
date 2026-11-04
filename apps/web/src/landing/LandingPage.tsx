import { useState } from "react";

interface LandingPageProps {
  appOrigin: string;
}
type SampleZone = "body" | "tires" | "underbody";
const samples: Record<
  SampleZone,
  {
    label: string;
    status: string;
    title: string;
    detail: string;
    question: string;
  }
> = {
  body: {
    label: "Bodywork",
    status: "Example finding",
    title: "A scuff worth a second look.",
    detail:
      "This illustrative report calls out a surface scuff on the front bumper. A visible mark alone cannot tell you what caused it.",
    question: "Has this bumper been repaired or repainted?",
  },
  tires: {
    label: "Tires",
    status: "Partial coverage",
    title: "The angle matters.",
    detail:
      "In this example, the sidewall is visible but the tread is not clear enough to assess. That gap stays in the report.",
    question: "Can I get a clear view of the tread on each tire?",
  },
  underbody: {
    label: "Underbody",
    status: "Not assessed",
    title: "Not seen does not mean clean.",
    detail:
      "No underbody clip was supplied in this example. There is no condition finding or score for this area.",
    question: "Can a qualified mechanic inspect the underside?",
  },
};

function LensMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" fill="none">
      <path
        d="M12 5H5v7M20 5h7v7M27 20v7h-7M12 27H5v-7"
        stroke="currentColor"
        strokeWidth="2.4"
      />
      <circle cx="16" cy="16" r="4" stroke="currentColor" strokeWidth="2.4" />
    </svg>
  );
}

function ReportSample() {
  const [zone, setZone] = useState<SampleZone>("body");
  const sample = samples[zone];
  return (
    <div className="report-sheet">
      <div className="report-topline">
        <span className="report-wordmark">UpClose</span>
        <span className="sample-label">Synthetic sample</span>
      </div>
      <h3>A little more to go on.</h3>
      <p className="report-intro">
        Explore how a finding and a missing view tell different stories.
      </p>
      <div
        className="sample-options"
        role="group"
        aria-label="Explore sample areas"
      >
        {(Object.keys(samples) as SampleZone[]).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={zone === key}
            onClick={() => setZone(key)}
          >
            {samples[key].label}
          </button>
        ))}
      </div>
      <div className="sample-detail" aria-live="polite" aria-atomic="true">
        <div className="sample-status">
          <span className={`status-mark ${zone}`} aria-hidden="true" />
          {sample.status}
        </div>
        <h4>{sample.title}</h4>
        <p>{sample.detail}</p>
        <div className="next-question">
          <span>A question to take with you</span>
          <p>“{sample.question}”</p>
        </div>
      </div>
      <p className="sample-note">
        Illustrative content, not an assessment of the pictured car.
      </p>
    </div>
  );
}

export function LandingPage({ appOrigin }: LandingPageProps) {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header page-width">
        <a className="wordmark" href="#" aria-label="UpClose home">
          upclose
          <span className="wordmark-dot" />
        </a>
        <nav aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#sample">The report</a>
          <a className="nav-app" href={appOrigin}>
            Open prototype <span aria-hidden="true">↗</span>
          </a>
        </nav>
      </header>
      <main id="main">
        <section className="hero page-width" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="intro-line">
              <span />
              For your next used car.
            </p>
            <h1 id="hero-title">
              Good find.
              <br />
              Look closer.
            </h1>
            <p className="hero-description">
              The listing tells one story. Get a closer look at the car itself,
              with a guided walkaround and a place for every question.
            </p>
            <div className="hero-actions">
              <a className="button" href={appOrigin}>
                Try the prototype <LensMark />
              </a>
              <a className="text-link" href="#sample">
                Explore a sample report
              </a>
            </div>
            <p className="prototype-note">
              Early prototype. Assessments are currently synthetic.
            </p>
          </div>
          <figure className="hero-figure">
            <div className="hero-photo">
              <img
                src="/assets/used-car-editorial.png"
                alt="Close view of an older silver station wagon outside a garage"
                width="1536"
                height="1024"
                fetchPriority="high"
              />
              <div className="photo-frame" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
              </div>
              <span className="photo-message">
                Every car has a story.
                <br />
                Start with what you can see.
              </span>
            </div>
            <figcaption>
              <span>A closer look changes the conversation.</span>
              <span>AI-generated illustration</span>
            </figcaption>
          </figure>
        </section>
        <div className="principles page-width">
          <p>
            Made for the walkaround.
            <br />
            <strong>And the questions after it.</strong>
          </p>
          <ul>
            <li>Guided, part by part</li>
            <li>Visible condition in context</li>
            <li>Missing views made clear</li>
          </ul>
        </div>
        <section
          id="how-it-works"
          className="walkaround page-width"
          aria-labelledby="walkaround-title"
        >
          <div className="section-heading">
            <span className="section-kicker">The walkaround</span>
            <h2 id="walkaround-title">
              Less guesswork.
              <br />A better place to start.
            </h2>
          </div>
          <div className="steps">
            <article>
              <span className="step-number">01</span>
              <div>
                <h3>Bring your phone. Take your time.</h3>
                <p>
                  Choose guided clips or record or upload one video, up to three
                  minutes. Follow the optional guide and skip anything you cannot
                  safely reach. Unmapped areas remain unassessed.
                </p>
              </div>
            </article>
            <article>
              <span className="step-number">02</span>
              <div>
                <h3>Put the visible details in context.</h3>
                <p>
                  The report format brings findings and coverage together. A
                  blurry clip or a skipped area should leave a question, never a
                  clean bill of health.
                </p>
              </div>
            </article>
            <article>
              <span className="step-number">03</span>
              <div>
                <h3>Have a more useful conversation.</h3>
                <p>
                  Bring specific questions to the seller and a qualified
                  mechanic. Visible condition is a starting point, not the whole
                  story.
                </p>
              </div>
            </article>
          </div>
        </section>
        <section
          id="sample"
          className="sample-section"
          aria-labelledby="sample-title"
        >
          <div className="sample-layout page-width">
            <div className="sample-copy">
              <span className="section-kicker">Inside the report</span>
              <h2 id="sample-title">
                The detail.
                <br />
                The context.
                <br />
                The unknowns.
              </h2>
              <p>
                A useful report should show you what it can say—and be just as
                clear about what it cannot.
              </p>
              <p className="sample-explanation">
                This interactive sample illustrates the report structure. Real
                AI assessment is still being validated.
              </p>
              <a className="light-link" href={appOrigin}>
                Explore the capture prototype <span aria-hidden="true">↗</span>
              </a>
            </div>
            <ReportSample />
          </div>
        </section>
        <section
          className="questions page-width"
          aria-labelledby="questions-title"
        >
          <div className="section-heading">
            <span className="section-kicker">Before you start</span>
            <h2 id="questions-title">
              A few good
              <br />
              questions.
            </h2>
          </div>
          <div className="faq-list">
            <details>
              <summary>Is this a mechanical inspection?</summary>
              <p>
                No. UpClose is a condition-screening prototype focused on
                visible details. It cannot establish mechanical health, accident
                history, or whether a car is safe to drive. Arrange an in-person
                inspection with a qualified mechanic.
              </p>
            </details>
            <details>
              <summary>Does the AI work on real cars yet?</summary>
              <p>
                The capture and report flow is available to try, but current
                assessments use synthetic fixtures. Live model access and
                evaluation on permission-cleared vehicle footage are still
                pending. We do not claim measured detection accuracy.
              </p>
            </details>
            <details>
              <summary>What do I need for a walkaround?</summary>
              <p>
                A phone, permission to record the car, and enough light to see
                the surfaces. The prototype accepts guided clips or one
                continuous video. Automatic area recognition is not connected. Real-device browser validation is still in progress. Do
                not crawl under an unsupported vehicle or record while driving.
              </p>
            </details>
            <details>
              <summary>What happens to my footage?</summary>
              <p>
                The capture app asks for consent before you begin. General
                public sharing is disabled in this prototype. You can request
                deletion from the app; access is revoked first, then stored
                media is queued for removal. Only upload footage you have
                permission to use.
              </p>
            </details>
            <details>
              <summary>Do I need to pay to try it?</summary>
              <p>
                The prototype uses test payments only. Do not enter real payment
                details. Production checkout is not available yet.
              </p>
            </details>
          </div>
        </section>
        <section className="closing page-width">
          <LensMark />
          <h2>
            Your next car
            <br />
            deserves a closer look.
          </h2>
          <div>
            <a className="button" href={appOrigin}>
              Try the prototype <span aria-hidden="true">↗</span>
            </a>
            <p>Choose guided clips or one video.</p>
          </div>
        </section>
      </main>
      <footer className="site-footer page-width">
        <a className="wordmark" href="#" aria-label="Back to top">
          upclose
          <span className="wordmark-dot" />
        </a>
        <p>A closer look before your next car.</p>
        <span>Built with questions in mind.</span>
      </footer>
    </>
  );
}
