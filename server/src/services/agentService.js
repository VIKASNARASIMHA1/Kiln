import { env } from '../config/env.js';
import { complete, isLlmEnabled, isLlmLocal, parseJsonObject } from './llmService.js';

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Shuffles options and remaps the answer index so position carries no information. */
export function shuffleQuestion(q) {
  const order = shuffle([0, 1, 2, 3]);
  return {
    prompt: q.prompt,
    options: order.map((i) => q.options[i]),
    answer: order.indexOf(q.answer),
    explanation: q.explanation || '',
  };
}

/** Returns only well-formed multiple-choice questions. */
export function validateQuestions(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter(
      (q) =>
        q &&
        typeof q.prompt === 'string' &&
        q.prompt.length > 5 &&
        Array.isArray(q.options) &&
        q.options.length === 4 &&
        q.options.every((o) => typeof o === 'string' && o.length > 0) &&
        new Set(q.options).size === 4 &&
        Number.isInteger(q.answer) &&
        q.answer >= 0 &&
        q.answer <= 3
    )
    .map((q) => ({ prompt: q.prompt, options: q.options, answer: q.answer, explanation: String(q.explanation || '') }));
}

export function pickFromBank(bank, n = 5) {
  return shuffle(bank).slice(0, n).map(shuffleQuestion);
}

const QUIZ_SYSTEM =
  'You write fair multiple-choice questions for learners. Use ONLY facts stated in the lesson text. ' +
  'Respond with a single JSON object and nothing else.';

/** Quiz generation agent: LLM first (validated), question bank as a reliable fallback. */
export async function generateQuiz(lesson, n = 5) {
  if (isLlmEnabled() && (env.quizUseLlm ?? !isLlmLocal())) {
    // Local models are slower and less reliable, so ask for fewer questions and fall back quickly.
    const count = isLlmLocal() ? Math.min(n, 3) : n;
    try {
      const prompt =
        `Lesson title: ${lesson.title}\n\nLesson text:\n${lesson.body}\n\n` +
        `Write ${count} multiple-choice questions. Each has exactly 4 distinct options, one correct option, ` +
        'and a one-sentence explanation of why it is correct.\n' +
        'Format: {"questions":[{"prompt":"...","options":["a","b","c","d"],"answer":0,"explanation":"..."}]}';
      const text = await complete({ system: QUIZ_SYSTEM, prompt, maxTokens: 400 + count * 220, json: true, timeoutMs: 90_000 });
      const valid = validateQuestions(parseJsonObject(text).questions).map(shuffleQuestion);
      if (valid.length >= Math.min(3, count)) return { questions: valid.slice(0, count), source: 'llm' };
    } catch (e) {
      console.warn('Quiz generation fell back to the question bank:', e.userMessage || e.message);
    }
  }
  return { questions: pickFromBank(lesson.questions || [], n), source: 'bank' };
}

/** Personalised explanation of a wrong answer. Falls back to the stored explanation. */
export async function explainMistake({ lesson, question, chosenIndex }) {
  const stored = question.explanation || `The correct answer is "${question.options[question.answer]}".`;
  if (!isLlmEnabled()) return { explanation: stored, source: 'bank' };
  try {
    const text = await complete({
      system:
        'You are a patient tutor. In under 80 words, explain why the learner\'s answer is wrong and what the correct idea is. ' +
        'Use the lesson text. Do not be condescending.',
      prompt:
        `Lesson:\n${lesson.body}\n\nQuestion: ${question.prompt}\nOptions: ${question.options.join(' | ')}\n` +
        `Learner chose: ${question.options[chosenIndex]}\nCorrect: ${question.options[question.answer]}`,
      maxTokens: 300,
      timeoutMs: 45_000,
    });
    return { explanation: text.trim(), source: 'llm' };
  } catch (e) {
    console.warn('Mistake explanation fell back to the stored text:', e.userMessage || e.message);
    return { explanation: stored, source: 'bank' };
  }
}

export const TUTOR_SYSTEM =
  "You are Kiln's tutor for IT learners. Answer using the numbered course excerpts when they are relevant and cite them like [1]. " +
  'If the excerpts do not cover the question, say so briefly, then give a short general answer and label it as outside the course material. ' +
  'For exercises, give hints and explain concepts instead of writing the full solution. Keep answers under 200 words.';

export function buildContext(chunks) {
  return chunks.map((c, i) => `[${i + 1}] ${c.title}\n${c.text}`).join('\n\n');
}

export function mockTutorAnswer(chunks) {
  if (!chunks.length) {
    return 'Demo mode (no LLM key set): I could not find anything in the course material about that. Try different keywords or open a lesson first.';
  }
  const body = chunks
    .slice(0, 2)
    .map((c, i) => `[${i + 1}] ${c.title}: ${c.text.replace(/```[\s\S]*?```/g, '').replace(/\s+/g, ' ').trim()}`)
    .join('\n\n');
  return `Demo mode (no LLM key set). These passages from the course are the most relevant to your question:\n\n${body}`;
}
