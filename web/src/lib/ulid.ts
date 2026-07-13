// ULID generator (Crockford base32, 48-bit timestamp + 80-bit randomness).
// Kept dependency-free and pure so it is trivially unit-testable. The export
// contract (docs/PLAN.md) stamps example ids as `ex_01J...` — an "ex_" prefix
// in front of a ULID — and requires them stable across versions, so ids are
// generated once at creation and never re-derived.

// Crockford base32 alphabet: no I, L, O, or U (avoids visual/typo ambiguity).
const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TIME_LEN = 10;
const RANDOM_LEN = 16;

function encodeTime(ms: number): string {
  let out = "";
  let n = ms;
  for (let i = 0; i < TIME_LEN; i++) {
    // charAt always returns a string (n % 32 is in-range), so this stays
    // clean under noUncheckedIndexedAccess.
    out = ENCODING.charAt(n % 32) + out;
    n = Math.floor(n / 32);
  }
  return out;
}

function encodeRandom(): string {
  // 256 is a multiple of 32, so `byte % 32` is a uniform 5-bit draw.
  const bytes = new Uint8Array(RANDOM_LEN);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) {
    out += ENCODING.charAt(byte % 32);
  }
  return out;
}

// A 26-char ULID. `now` is injectable for deterministic tests.
export function ulid(now: number = Date.now()): string {
  return encodeTime(now) + encodeRandom();
}

// The stored/exported example id: "ex_" + ULID.
export function newExampleId(): string {
  return `ex_${ulid()}`;
}
