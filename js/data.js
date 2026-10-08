// تحميل ملفات المحتوى المحلية (تُخدَم من ذاكرة Service Worker بعد أول فتح).

let cache = null;

async function getJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`تعذر تحميل ${path}`);
  return res.json();
}

export async function loadData() {
  if (cache) return cache;
  const [conditions, synonyms, triage] = await Promise.all([
    getJson('data/conditions.json'),
    getJson('data/synonyms.json'),
    getJson('data/triage.json'),
  ]);
  const list = conditions.conditions;
  const byId = Object.fromEntries(list.map((c) => [c.id, c]));
  delete synonyms._note;
  cache = { conditions: list, byId, synonyms, triage };
  return cache;
}
