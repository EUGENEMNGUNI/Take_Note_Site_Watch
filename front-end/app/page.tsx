import Link from "next/link";

import { OverviewMenu } from "@/components/ov-menu";

const FEATURES = [
  {
    title: "Verified check-in",
    text: "Network and site radius are checked before attendance is recorded.",
    tone: "blue",
    art: (
      <svg viewBox="0 0 240 100" aria-hidden="true">
        <g stroke="#c5d0ea" strokeWidth="1">
          <path d="M0 25h240M0 50h240M0 75h240M40 0v100M80 0v100M120 0v100M160 0v100M200 0v100" />
        </g>
        <circle cx="120" cy="50" r="34" fill="#c9d4f2" fillOpacity=".7" stroke="#3b5bdb" strokeWidth="1.5" strokeDasharray="4 3" />
        <rect x="105" y="42" width="30" height="16" rx="4" fill="#111827" />
        <circle cx="115" cy="50" r="2" fill="#fff" />
        <circle cx="125" cy="50" r="2" fill="#fff" />
        <circle cx="148" cy="38" r="9" fill="#157a45" stroke="#fff" strokeWidth="2" />
        <path d="m143.5 38 3 3 5-5.5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Daily tasks",
    text: "Assigned work with priority, due time and live status.",
    tone: "green",
    art: (
      <svg viewBox="0 0 240 100" aria-hidden="true">
        {[22, 46, 70].map((y, i) => (
          <g key={y}>
            <rect x="66" y={y - 9} width="108" height="20" rx="5" fill="#fff" />
            <circle cx="80" cy={y + 1} r="6" fill={i === 0 ? "#157a45" : "#fff"} stroke={i === 0 ? "#157a45" : i === 1 ? "#d97706" : "#d9141a"} strokeWidth="2" />
            {i === 0 ? <path d="m77 23 2.2 2.2 3.8-4.2" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /> : null}
            {i === 1 ? <path d="M80 41a5 5 0 0 0 0 10z" fill="#d97706" /> : null}
            <rect x="92" y={y - 4} width="52" height="4" rx="2" fill="#6b7280" />
            <rect x="92" y={y + 4} width="34" height="3" rx="1.5" fill="#d1d5db" />
          </g>
        ))}
      </svg>
    ),
  },
  {
    title: "Incident reporting",
    text: "Report hazards fast and follow them to resolution.",
    tone: "amber",
    art: (
      <svg viewBox="0 0 240 100" aria-hidden="true">
        <ellipse cx="116" cy="80" rx="46" ry="7" fill="#e8c999" />
        <path d="M116 18 148 72H84z" fill="none" stroke="#b45309" strokeWidth="7" strokeLinejoin="round" />
        <path d="M116 36v20" stroke="#b45309" strokeWidth="5" strokeLinecap="round" />
        <circle cx="116" cy="64" r="3" fill="#b45309" />
        <path d="m160 80 8-14 8 14z" fill="#d9141a" />
      </svg>
    ),
  },
  {
    title: "Leave and approvals",
    text: "Request leave, attach a sick note and track approval.",
    tone: "grey",
    art: (
      <svg viewBox="0 0 240 100" aria-hidden="true">
        <rect x="76" y="18" width="88" height="70" rx="7" fill="#fff" />
        <path d="M76 25a7 7 0 0 1 7-7h74a7 7 0 0 1 7 7v10H76z" fill="#374151" />
        <rect x="92" y="10" width="4" height="14" rx="2" fill="#9ca3af" />
        <rect x="144" y="10" width="4" height="14" rx="2" fill="#9ca3af" />
        {[96, 112, 128].map((x) => (
          <circle key={x} cx={x} cy="48" r="2.5" fill="#cbd0d8" />
        ))}
        <circle cx="144" cy="48" r="2.5" fill="#2563eb" />
        <circle cx="96" cy="62" r="2.5" fill="#cbd0d8" />
        <rect x="104" y="58" width="22" height="9" rx="4.5" fill="#157a45" />
        <circle cx="136" cy="62" r="2.5" fill="#cbd0d8" />
        {[112, 128, 144].map((x) => (
          <circle key={x} cx={x} cy="76" r="2.5" fill="#cbd0d8" />
        ))}
      </svg>
    ),
  },
] as const;

const ROLES = [
  { label: "Employee", title: "Check in, tasks, leave", text: "A simple mobile view for the working day." },
  { label: "Site manager", title: "Presence, tasks, incidents", text: "A live view of your site and your team." },
  { label: "Administrator", title: "People, sites, leave, audit", text: "Set the rules and keep a full activity history." },
] as const;

export default function Overview() {
  return (
    <div className="si ov" id="top">
      <div className="si-topbar">
        <div className="ov-topbar-inner">
          <span>Site Watch by Take Note Information Technologies · Engineered cyber security and IoT solutions</span>
          <nav aria-label="Utility">
            <Link href="#contact">Help</Link>
            <Link href="#contact">Privacy policy</Link>
            <Link href="/sign-in">Sign in</Link>
          </nav>
        </div>
      </div>

      <header className="ov-header">
        <div className="ov-header-inner">
          <Link href="/" className="si-wordmark ov-brand" aria-label="Take Note Site Watch home">
            <b>Take Note</b>
            <span>Site Watch</span>
          </Link>
          <nav className="ov-nav" aria-label="Primary">
            <Link href="#top">Overview</Link>
            <Link href="#features">Features</Link>
            <Link href="#roles">Roles</Link>
            <Link href="#security">Security</Link>
            <Link href="#contact">Contact</Link>
          </nav>
          <Link href="/sign-in" className="ov-btn ov-btn-red ov-header-cta">Sign in</Link>
          <OverviewMenu />
        </div>
      </header>

      <main>
        <section className="si-hero ov-hero">
          <div className="si-hero-inner">
            <div className="si-copy">
              <p className="si-eyebrow">Protect your people and your site</p>
              <h1>Know who is on site, what needs doing and what needs fixing.</h1>
              <p className="si-lead">
                Check in only when you are on the company network and inside the site. Managers get a live view of
                presence, tasks and incidents in one place.
              </p>
              <div className="ov-cta">
                <Link href="/sign-in" className="ov-btn ov-btn-red">Sign in</Link>
                <Link href="#features" className="ov-btn ov-btn-outline">See how it works</Link>
              </div>
            </div>

            <div className="ov-site-card" id="security">
              <div className="ov-site-head">
                <div>
                  <small>My site</small>
                  <h2>Company Headquarters</h2>
                </div>
                <span className="ov-pill">Within site</span>
              </div>
              <dl>
                <div><dt>Company network</dt><dd className="good">Connected</dd></div>
                <div><dt>Distance from centre</dt><dd>42 m of 200 m</dd></div>
                <div><dt>Working hours</dt><dd>08:00 to 17:00</dd></div>
              </dl>
              <Link href="/sign-in" className="ov-btn ov-btn-red ov-block">Check in</Link>
            </div>
          </div>
        </section>

        <section className="ov-section" id="features" aria-labelledby="features-title">
          <div className="ov-wrap">
            <p className="ov-kicker">What Site Watch does</p>
            <h2 id="features-title" className="ov-title">One system for every site</h2>
            <p className="ov-sub">
              Built for the people on site, the managers running it and the administrators who set the rules.
            </p>

            <div className="ov-cards">
              {FEATURES.map((f) => (
                <article key={f.title} className="ov-card">
                  <div className={`ov-art ov-art-${f.tone}`}>{f.art}</div>
                  <div className="ov-card-body">
                    <h3>{f.title}</h3>
                    <p>{f.text}</p>
                    <Link href="#roles">Learn more</Link>
                  </div>
                </article>
              ))}
            </div>

            <div className="ov-roles" id="roles">
              {ROLES.map((r) => (
                <div key={r.label}>
                  <small>{r.label}</small>
                  <h3>{r.title}</h3>
                  <p>{r.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="si-footer ov-footer" id="contact">
        <div className="ov-footer-inner">
          <div>
            <div className="si-wordmark light">
              <b>Take Note</b>
              <span>Site Watch</span>
            </div>
            <p>
              Attendance, tasks and site safety in one place, part of Take Note&apos;s engineered security and IoT
              solutions. Accounts are created by your administrator.
            </p>
            <small>2026 © Take Note Information Technologies. All rights reserved.</small>
          </div>
          <nav className="ov-footer-links" aria-label="Footer">
            <div>
              <Link href="#top">Home</Link>
              <Link href="#features">Features</Link>
              <Link href="#contact">Contact</Link>
            </div>
            <div>
              <Link href="#contact">Privacy policy</Link>
              <Link href="#contact">POPIA notice</Link>
              <Link href="#contact">Help</Link>
            </div>
          </nav>
        </div>
      </footer>
    </div>
  );
}
