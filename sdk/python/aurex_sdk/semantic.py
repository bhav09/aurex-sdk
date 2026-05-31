import re

def jaccard_ngram_similarity(a: str, b: str, n: int = 4) -> float:
    """N-gram Jaccard similarity for semantic loop detection."""
    if not a or not b:
        return 0.0
        
    def get_ngrams(s: str) -> set:
        res = set()
        t = re.sub(r"\s+", " ", s.lower())
        for i in range(len(t) - n + 1):
            res.add(t[i : i + n])
        return res
        
    A = get_ngrams(a)
    B = get_ngrams(b)
    if not A or not B:
        return 0.0
        
    inter = len(A.intersection(B))
    return inter / (len(A) + len(B) - inter)
