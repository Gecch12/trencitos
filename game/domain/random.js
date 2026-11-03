"use strict";

// The caller owns the random stream. Neither operation mutates its input.
function shuffle(items, random) {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function sampleIndexes(length, count, random) {
  const pool = Array.from({ length }, (_, i) => i), selected = [];
  for (let i = 0; i < count; i++) selected.push(...pool.splice(random(pool.length), 1));
  return selected;
}

module.exports = { shuffle, sampleIndexes };
