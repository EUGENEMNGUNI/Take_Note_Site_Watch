import { randomInt } from "node:crypto";

// Characters that are easy to confuse (0/O, 1/l/I) are left out, because the
// administrator has to read this password to the employee.
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%&*?";
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

function pick(chars: string): string {
  return chars[randomInt(chars.length)];
}

/**
 * Random temporary password from the operating system's secure generator.
 * Always contains an upper-case letter, a lower-case letter, a digit and a
 * symbol. At 16 characters it carries roughly 100 bits of randomness.
 */
export function generateTemporaryPassword(length = 16): string {
  if (!Number.isInteger(length) || length < 12) {
    throw new Error("Temporary passwords must be at least 12 characters.");
  }

  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < length) {
    chars.push(pick(ALL));
  }

  // Fisher-Yates shuffle so the guaranteed characters are not always first.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
