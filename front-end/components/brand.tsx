export function BrandLogo({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand-logo${small ? " small-logo" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/take-note-logo.png" alt="Take Note Information Technologies" />
    </div>
  );
}

export function initialsOf(name: string): string {
  const parts = name
    .replace(/[._-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0];
  return letters.toUpperCase();
}

export function Avatar({ name, red = false, large = false }: { name: string; red?: boolean; large?: boolean }) {
  return (
    <span className={`avatar${red ? " red" : ""}${large ? " lg" : ""}`} aria-hidden="true">
      {initialsOf(name)}
    </span>
  );
}
