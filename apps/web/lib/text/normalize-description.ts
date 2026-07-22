// Normalizes a Spanish asset description into a comparison key used to cluster
// near-identical names (typos, word order, filler words, singular/plural).
// It deliberately does NOT stem verbs/nouns (TRANSPORTAR vs TRANSPORTE) — those
// harder cases are left to manual multi-select batch editing so the tool never
// silently merges genuinely different items.

const STOPWORDS = new Set([
  'PARA', 'DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'CON', 'Y', 'E',
  'A', 'AL', 'EN', 'POR', 'UN', 'UNA', 'UNOS', 'UNAS', 'O', 'U', 'SU',
])

function singularize(token: string): string {
  if (token.length > 4 && token.endsWith('ES')) return token.slice(0, -2)
  if (token.length > 3 && token.endsWith('S')) return token.slice(0, -1)
  return token
}

export function normalizeDescriptionKey(input: string): string {
  const deburred = input.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const cleaned = deburred.toUpperCase().replace(/[^A-Z0-9\s]/g, ' ')
  const tokens = cleaned
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !STOPWORDS.has(t))
    .map(singularize)
    .filter(Boolean)
  // de-duplicate + sort so word order and repeats don't matter
  return Array.from(new Set(tokens)).sort().join(' ')
}
