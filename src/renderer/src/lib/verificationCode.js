// Derives a short, human-comparable verification code from two deviceIds.
// Deterministic AND symmetric: both devices sort the id pair first, so
// verificationCode(a, b) === verificationCode(b, a). Users compare the two-word
// code on both screens before accepting, which catches a spoofed or unintended
// peer on a shared network (the ids would differ, so the codes wouldn't match).

// 64 short, distinct, easy-to-read words → two picks give ~4096 combinations.
const WORDS = [
  'Amber', 'Anchor', 'Apple', 'Arrow', 'Aspen', 'Badge', 'Basil', 'Beacon',
  'Birch', 'Bison', 'Bloom', 'Boulder', 'Bramble', 'Breeze', 'Cedar', 'Cirrus',
  'Cobalt', 'Comet', 'Coral', 'Cove', 'Crest', 'Delta', 'Dune', 'Ember',
  'Fable', 'Falcon', 'Fern', 'Flint', 'Garnet', 'Glade', 'Harbor', 'Hazel',
  'Heron', 'Indigo', 'Ivory', 'Jasper', 'Kelp', 'Lagoon', 'Lark', 'Lotus',
  'Maple', 'Meadow', 'Mesa', 'Nimbus', 'Onyx', 'Opal', 'Orchid', 'Otter',
  'Pebble', 'Pine', 'Quartz', 'Raven', 'Reef', 'Ridge', 'River', 'Sable',
  'Slate', 'Sparrow', 'Spruce', 'Tundra', 'Umber', 'Valley', 'Willow', 'Zephyr'
]

// FNV-1a 32-bit — small, fast, deterministic across devices (no crypto needed
// for a short human-verification code).
function fnv1a(str) {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function verificationCode(idA, idB) {
  const key = [String(idA || ''), String(idB || '')].sort().join('|')
  const hash = fnv1a(key)
  const first = hash & 63
  let second = (hash >>> 6) & 63
  if (second === first) second = (second + 1) & 63
  return `${WORDS[first]} ${WORDS[second]}`
}
