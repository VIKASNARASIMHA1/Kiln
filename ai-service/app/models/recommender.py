from __future__ import annotations

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


def similar_lessons(lessons: list[dict], completed_ids: list[str], k: int = 3) -> list[dict]:
    """Rank unfinished lessons by TF-IDF cosine similarity to the learner's completed lessons."""
    if len(lessons) < 2:
        return []
    ids = [l["id"] for l in lessons]
    done_set = set(completed_ids)
    done = [i for i, lid in enumerate(ids) if lid in done_set]
    todo = [i for i in range(len(ids)) if i not in done]
    if not done or not todo:
        return []
    tfidf = TfidfVectorizer(stop_words="english", ngram_range=(1, 2)).fit_transform([l["text"] for l in lessons])
    centroid = np.asarray(tfidf[done].mean(axis=0))
    sims = cosine_similarity(centroid, tfidf[todo])[0]
    ranked = sorted(zip(todo, sims), key=lambda t: -t[1])[:k]
    return [{"id": ids[i], "score": round(float(s), 3)} for i, s in ranked]
