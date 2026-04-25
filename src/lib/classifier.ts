export function tokenize(memo: string): string[] {
  return memo
    .toLowerCase()
    .replace(/\d+/g, '')
    .replace(/[^a-záéíóúàãõâêôç\s]/gi, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2)
}

export function jaccardSimilarity(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 && tokensB.length === 0) return 1
  if (tokensA.length === 0 || tokensB.length === 0) return 0
  const setA = new Set(tokensA)
  const setB = new Set(tokensB)
  const intersection = Array.from(setA).filter(t => setB.has(t)).length
  const union = new Set(Array.from(setA).concat(Array.from(setB))).size
  return intersection / union
}
