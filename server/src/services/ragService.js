import { listAllLessons, listChunks, replaceChunks } from '../db/content.js';

const STOP = new Set(
  'a an the and or but if then of to in on for with without is are was were be been being it its this that these those as at by from into about what which who how why when do does did can could should would will you your i we they he she them his her our not no so than too very'.split(' ')
);

export const tokenize = (s = '') => (s.toLowerCase().match(/[a-z0-9_]+/g) || []).filter((w) => w.length > 1 && !STOP.has(w));

/** Splits markdown into ~maxLen character chunks on paragraph boundaries (keeps code blocks whole). */
export function chunkText(body, maxLen = 700) {
  const blocks = [];
  let inCode = false;
  let buf = [];
  for (const line of body.split('\n')) {
    if (line.trim().startsWith('```')) inCode = !inCode;
    if (!inCode && line.trim() === '') {
      if (buf.length) blocks.push(buf.join('\n'));
      buf = [];
    } else buf.push(line);
  }
  if (buf.length) blocks.push(buf.join('\n'));
  const chunks = [];
  let cur = '';
  for (const b of blocks.map((x) => x.trim()).filter(Boolean)) {
    if (cur && cur.length + b.length > maxLen) {
      chunks.push(cur);
      cur = b;
    } else cur = cur ? `${cur}\n\n${b}` : b;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

/** Okapi BM25 over an in-memory list of {text,title,...} docs. Returns [{doc,score}] best-first. */
export function bm25Search(docs, query, k = 4, { k1 = 1.5, b = 0.75 } = {}) {
  const qTerms = [...new Set(tokenize(query))];
  if (!qTerms.length || !docs.length) return [];
  const toks = docs.map((d) => tokenize(`${d.title || ''} ${d.text}`));
  const avgLen = toks.reduce((s, t) => s + t.length, 0) / docs.length || 1;
  const df = new Map();
  for (const t of toks) for (const w of new Set(t)) df.set(w, (df.get(w) || 0) + 1);
  const N = docs.length;

  return docs
    .map((doc, i) => {
      const tf = new Map();
      for (const w of toks[i]) tf.set(w, (tf.get(w) || 0) + 1);
      let score = 0;
      for (const w of qTerms) {
        const f = tf.get(w);
        if (!f) continue;
        const n = df.get(w) || 0;
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        score += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * toks[i].length) / avgLen));
      }
      return { doc, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, z) => z.score - a.score)
    .slice(0, k);
}

/** Turns lessons into the rows stored in the chunks table. */
export function lessonChunks(lessons) {
  const rows = [];
  for (const l of lessons) {
    chunkText(l.body).forEach((text, order) => rows.push({ lesson: l.id, track: l.track, title: l.title, text, order }));
  }
  return rows;
}

let cache = null;
export const invalidateIndex = () => {
  cache = null;
};
async function allChunks() {
  if (!cache) cache = await listChunks();
  return cache;
}

/** Rebuilds the chunk collection from all lessons. */
export async function ingestAll() {
  const rows = lessonChunks(await listAllLessons());
  await replaceChunks(rows);
  invalidateIndex();
  return rows.length;
}

/** Retrieves the best chunks for a question. Prefers the current lesson, falls back to everything. */
export async function retrieve(question, { lessonId = null, k = 3 } = {}) {
  const chunks = await allChunks();
  let hits = [];
  if (lessonId) {
    hits = bm25Search(chunks.filter((c) => String(c.lesson) === String(lessonId)), question, k);
  }
  if (hits.length < 1) hits = bm25Search(chunks, question, k);
  return hits.map(({ doc, score }) => ({
    lessonId: String(doc.lesson),
    title: doc.title,
    text: doc.text,
    score: Math.round(score * 100) / 100,
  }));
}
