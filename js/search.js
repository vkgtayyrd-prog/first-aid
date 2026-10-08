// بحث محلي يفهم العامية والمرادفات ويتحمل أخطاء الإملاء البسيطة.
import { normalizeArabic } from './util.js';

const STOP = new Set(`في من على عن الى الي او و ثم مع اذا ان انه لا ما لم لن قد كل هو هي هم له لها به بها
  عند حتى بعد قبل اي هذا هذه ذلك التي الذي كان يكون تكون شي شيء جدا او ايضا مثل غير فقط بين`.split(/\s+/));

// تقريب الحروف التي يكثر الخلط بينها في الكتابة العامية.
function fold(word) {
  return word.replace(/ظ/g, 'ض').replace(/ذ/g, 'ز').replace(/ث/g, 'س');
}

function stem(word) {
  for (const p of ['وال', 'بال', 'فال', 'كال']) {
    if (word.startsWith(p) && word.length - p.length >= 2) return word.slice(p.length);
  }
  if (word.startsWith('لل') && word.length > 4) return word.slice(2);
  if (word.startsWith('ال') && word.length > 3) return word.slice(2);
  return word;
}

function tokens(text, { keepStop = false } = {}) {
  const out = [];
  for (const raw of normalizeArabic(text).split(' ')) {
    if (!raw) continue;
    const w = fold(raw);
    if (!keepStop && (STOP.has(w) || w.length < 2)) continue;
    out.push(w);
  }
  return out;
}

function levenshtein(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** مدى تطابق كلمة البحث مع كلمة من الفهرس (0 إلى 1). */
function similarity(q, t) {
  if (q === t) return 1;
  const qs = stem(q);
  const ts = stem(t);
  if (qs === ts) return 0.95;
  const short = qs.length <= ts.length ? qs : ts;
  const long = short === qs ? ts : qs;
  if (short.length >= 3 && long.startsWith(short)) return 0.75;
  if (short.length >= 4 && long.includes(short)) return 0.6;
  if (qs.length >= 4) {
    const max = qs.length >= 7 ? 2 : 1;
    if (levenshtein(qs, ts, max) <= max) return 0.6;
  }
  return 0;
}

export function buildIndex(data) {
  return data.conditions.map((c) => {
    const words = new Map();
    const add = (text, weight) => {
      for (const t of tokens(text)) {
        if ((words.get(t) || 0) < weight) words.set(t, weight);
      }
    };
    const phrases = [];

    add(c.title, 10);
    phrases.push({ p: tokens(c.title, { keepStop: true }).join(' '), w: 12 });
    for (const syn of data.synonyms[c.id] || []) {
      add(syn, 6);
      const p = tokens(syn, { keepStop: true }).join(' ');
      phrases.push({ p, w: p.includes(' ') ? 10 : 8 });
    }
    add(c.summary, 3);
    (c.signs || []).forEach((s) => add(s, 3));
    [...(c.steps || []), ...(c.dont || []), ...(c.call || []), ...(c.after || [])].forEach((s) => add(s, 1));

    return { id: c.id, words, phrases };
  });
}

export function search(index, query) {
  const qAll = tokens(query, { keepStop: true });
  if (!qAll.length) return [];
  const qText = ` ${qAll.join(' ')} `;
  const qWords = qAll.filter((w) => !STOP.has(w) && w.length >= 2);

  const scored = index.map((entry) => {
    let score = 0;

    // عبارات كاملة (مثل "ما يتنفس" أو "بلع لسانه").
    for (const { p, w } of entry.phrases) {
      if (p && qText.includes(` ${p} `)) score += w;
    }

    // كلمة كلمة مع التسامح في الإملاء.
    for (const q of qWords) {
      let best = 0;
      for (const [t, w] of entry.words) {
        const sim = similarity(q, t);
        if (sim && sim * w > best) best = sim * w;
      }
      score += best;
    }
    return { id: entry.id, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored[0]?.score || 0;
  if (top < 1) return [];
  return scored.filter((r) => r.score >= Math.max(1, top * 0.3)).slice(0, 6);
}
