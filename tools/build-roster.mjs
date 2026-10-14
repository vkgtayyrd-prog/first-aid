// يشفّر سجل الطلاب لصفحة الإداريين.
//
// الاستخدام (من مجلد المشروع):
//   node tools/build-roster.mjs            يشفّر private/students.json إلى data/roster.enc.json
//   node tools/build-roster.mjs --new-code يولّد كوداً جديداً (إذا تسرّب القديم) ثم يشفّر
//
// المدخلات في private/ (لا يُرفع أبداً). المخرج الوحيد data/roster.enc.json وهو مشفّر.
// يجب أن تطابق إعدادات التشفير هنا ما في js/admin.js.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STUDENTS = join(ROOT, 'private', 'students.json');
const CODE_FILE = join(ROOT, 'private', 'roster-code.txt');
const OUT = join(ROOT, 'data', 'roster.enc.json');

const ITER = 600000;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // بدون الأحرف المتشابهة O/0 I/1 L
const LIMITS = { n: 60, k: 30, d: 200, a: 300, m: 120, p: 20 };
const CODES = new Set('adexho');

function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(40));
  let out = '';
  for (const b of bytes) {
    if (b >= ALPHABET.length * 8) continue; // تجنّب انحياز القسمة
    out += ALPHABET[b % ALPHABET.length];
    if (out.length === 20) break;
  }
  if (out.length < 20) return newCode();
  return out.match(/.{4}/g).join('-');
}

/** نفس التوحيد في js/admin.js: حروف كبيرة بدون شرطات أو مسافات. */
export const normalizeCode = (code) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

function clean(s) {
  const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  return {
    n: str(s.n, LIMITS.n),
    k: str(s.k, LIMITS.k),
    c: [...new Set(String(s.c || ''))].filter((c) => CODES.has(c)).join(''),
    d: str(s.d, LIMITS.d),
    a: str(s.a, LIMITS.a),
    m: str(s.m, LIMITS.m),
    p: str(s.p, LIMITS.p).replace(/[^\d+\s-]/g, ''),
  };
}

const b64 = (bytes) => Buffer.from(bytes).toString('base64');

async function main() {
  let code;
  let generated = false;
  if (process.argv.includes('--new-code') || !existsSync(CODE_FILE)) {
    code = newCode();
    writeFileSync(CODE_FILE, code + '\n', 'utf8');
    generated = true;
  } else {
    code = readFileSync(CODE_FILE, 'utf8').trim();
  }

  const all = existsSync(STUDENTS) ? JSON.parse(readFileSync(STUDENTS, 'utf8')) : [];
  const students = all.filter((s) => s.consent === true).map(clean).filter((s) => s.n);
  const skipped = all.length - students.length;

  const plain = new TextEncoder().encode(JSON.stringify({ v: 1, builtAt: Date.now(), students }));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(normalizeCode(code)), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt'],
  );
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));

  writeFileSync(OUT, JSON.stringify({ v: 1, kdf: 'PBKDF2-SHA256', iter: ITER, salt: b64(salt), iv: b64(iv), ct: b64(ct) }) + '\n', 'utf8');

  console.log(`تم تشفير ${students.length} طالب إلى data/roster.enc.json`);
  if (skipped) console.log(`تم تجاهل ${skipped} بدون موافقة أو بدون اسم.`);
  console.log(generated ? `كود جديد للإداريين: ${code}` : 'استُخدم الكود الحالي من private/roster-code.txt');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
