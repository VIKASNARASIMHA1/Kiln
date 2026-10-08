// Usage: npm run eval:rag   (needs a seeded database)
// Checks whether the tutor's retriever finds the right lesson for each quiz question.
// Caveat: the questions are written from the same lessons, so this measures retrieval wiring
// and keyword coverage, not how well it handles questions students would really ask.
import { closeDb, connectDb } from '../db/pool.js';
import { listAllLessons } from '../db/content.js';
import { retrieve } from '../services/ragService.js';

async function main() {
  await connectDb();
  const lessons = await listAllLessons();
  const byTrack = {};
  const misses = [];
  let total = 0;
  let hit1 = 0;
  let hit3 = 0;

  for (const lesson of lessons) {
    for (const q of lesson.questions) {
      const query = `${q.prompt} ${q.options[q.answer]}`;
      const hits = await retrieve(query, { k: 3 }); // global search: no hint about which lesson
      const ranks = hits.map((h) => h.lessonId);
      const id = lesson.id;
      const t = (byTrack[lesson.track] ??= { n: 0, hit1: 0, hit3: 0 });
      t.n++;
      total++;
      if (ranks[0] === id) { t.hit1++; hit1++; }
      if (ranks.includes(id)) { t.hit3++; hit3++; } else misses.push(`[${lesson.slug}] ${q.prompt}`);
    }
  }
  const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(0)}%` : 'n/a');
  console.log(`Questions evaluated: ${total}`);
  console.log(`Hit@1: ${hit1}/${total} (${pct(hit1, total)})   Hit@3: ${hit3}/${total} (${pct(hit3, total)})`);
  for (const [track, t] of Object.entries(byTrack)) console.log(`  ${track.padEnd(7)} hit@1 ${pct(t.hit1, t.n)}  hit@3 ${pct(t.hit3, t.n)}  (n=${t.n})`);
  if (misses.length) console.log('Not retrieved in top 3:\n  ' + misses.join('\n  '));
  await closeDb();
}

main().catch((e) => {
  console.error('Evaluation failed:', e.message);
  process.exit(1);
});
