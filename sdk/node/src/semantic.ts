/** N-gram Jaccard similarity for semantic loop detection. */

export function jaccardNGramSimilarity(a: string, b: string, n = 4): number {
  const ngrams = (s: string): Set<string> => {
    const set = new Set<string>();
    const t = s.toLowerCase().replace(/\s+/g, " ");
    for (let i = 0; i <= t.length - n; i++) {
      set.add(t.slice(i, i + n));
    }
    return set;
  };
  const A = ngrams(a);
  const B = ngrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) {
    if (B.has(x)) inter++;
  }
  return inter / (A.size + B.size - inter);
}
