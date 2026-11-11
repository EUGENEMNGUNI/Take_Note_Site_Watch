"use client";

import Link from "next/link";
import { useState } from "react";

const ITEMS = [
  { href: "#top", label: "Overview" },
  { href: "#features", label: "Features" },
  { href: "#roles", label: "Roles" },
  { href: "#security", label: "Security" },
  { href: "#contact", label: "Contact" },
] as const;

/** Compact navigation shown on narrow screens; closes after a link is chosen. */
export function OverviewMenu() {
  const [open, setOpen] = useState(false);
  return (
    <div className="ov-menu">
      <button
        type="button"
        className="ov-menu-toggle"
        aria-expanded={open}
        aria-controls="ov-menu-panel"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {open ? (
        <nav id="ov-menu-panel" className="ov-menu-panel" aria-label="Primary">
          {ITEMS.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>
              {item.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
