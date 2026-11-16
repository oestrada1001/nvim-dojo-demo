// A small subsequence fuzzy matcher.
//
// This is the part that has to feel right. If filtering does not behave like
// Telescope -- tighter matches first, path segments weighted, consecutive runs
// rewarded -- the whole illusion collapses and it reads as a text box.

/**
 * Score `needle` against `haystack`. Returns null when it does not match.
 * Higher is better.
 */
export function score(needle, haystack) {
  if (!needle) return 0;
  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();

  let hi = 0;
  let total = 0;
  let run = 0;
  let firstIdx = -1;

  for (let ni = 0; ni < n.length; ni++) {
    const ch = n[ni];
    if (ch === ' ') continue;
    const found = h.indexOf(ch, hi);
    if (found === -1) return null;
    if (firstIdx === -1) firstIdx = found;

    // Consecutive characters are worth much more than scattered ones.
    run = found === hi ? run + 1 : 0;
    total += 1 + run * 4;

    // Matching at a path boundary or after a separator is a strong signal.
    const prev = found > 0 ? h[found - 1] : '/';
    if (prev === '/' || prev === '_' || prev === '.' || prev === '-') total += 6;

    hi = found + 1;
  }

  // Prefer shorter paths and earlier first matches, so exact-ish hits float up.
  total -= haystack.length * 0.08;
  total -= firstIdx * 0.15;
  return total;
}

/** Filter and rank `items`, best first. */
export function filter(needle, items) {
  if (!needle) return items.slice();
  const scored = [];
  for (const item of items) {
    const s = score(needle, item);
    if (s !== null) scored.push([s, item]);
  }
  scored.sort((a, b) => b[0] - a[0] || a[1].length - b[1].length);
  return scored.map((p) => p[1]);
}
