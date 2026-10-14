// رسومات توضيحية متحركة (SVG) مرسومة لتطبيق إسعافي.
// الألوان من متغيرات --ill-* في style.css فتتبع الوضع الفاتح والداكن، والحركة من فئات .ill-* هناك.
// المصاب بلون --ill-victim، والمسعف بلون --ill-rescuer.

const V = 'var(--ill-victim)';
const R = 'var(--ill-rescuer)';
const SKIN = 'var(--ill-skin)';
const RED = 'var(--ill-accent)';
const WATER = 'var(--ill-water)';
const MUTED = 'var(--ill-muted)';
const WHITE = 'var(--ill-white)';

/** عدّاد دائري يمتلئ، مع رقم ووحدة (مثل 10 دقائق). */
function timer(cx, cy, num, unit) {
  return `<g class="ill-timer">
    <circle cx="${cx}" cy="${cy}" r="24" fill="var(--surface)" stroke="${MUTED}" stroke-width="5"/>
    <circle class="ill-arc" cx="${cx}" cy="${cy}" r="24" fill="none" stroke="var(--green)" stroke-width="5"
      stroke-linecap="round" stroke-dasharray="151" stroke-dashoffset="151" transform="rotate(-90 ${cx} ${cy})"/>
    <text x="${cx}" y="${cy + 2}" text-anchor="middle" font-size="17" font-weight="700" fill="var(--text)">${num}</text>
    <text x="${cx}" y="${cy + 44}" text-anchor="middle" font-size="12" font-weight="600" fill="var(--muted)">${unit}</text>
  </g>`;
}

/** رقم الخطوة في دائرة. */
function step(x, y, n) {
  return `<g><circle cx="${x}" cy="${y}" r="13" fill="var(--blue)"/>
    <text x="${x}" y="${y + 5}" text-anchor="middle" font-size="15" font-weight="700" fill="var(--on-accent)">${n}</text></g>`;
}

const svg = (vb, label, body) => `<svg viewBox="${vb}" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="100%" height="100%" rx="14" fill="var(--ill-bg)"/>${body}</svg>`;

// شخص مبسّط: رأس دائري وجسم وأطراف بخطوط عريضة.
const limb = (d, color, w = 9) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const head = (cx, cy, color, r = 13) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>`;

export const ILLUSTRATIONS = {
  // اختناق: 1) خمس ضربات بين لوحي الكتف والمصاب مائل للأمام، 2) خمس ضغطات على البطن للداخل وللأعلى.
  choking: svg('0 0 360 220', 'خطوة 1: المسعف يضرب بكعب يده بين لوحي كتف المصاب وهو مائل للأمام. خطوة 2: المسعف خلف المصاب ويضغط بقبضته على البطن للداخل وللأعلى', `
    <line x1="180" y1="16" x2="180" y2="204" stroke="${MUTED}" stroke-width="2" stroke-dasharray="4 6"/>
    <g transform="translate(185 0)">
      ${step(158, 22, 1)}
      ${limb('M100 140 L92 200 M100 140 L112 200', V)}
      ${limb('M62 100 L100 140', V, 11)}
      ${limb('M70 108 L64 142', V)}
      ${head(50, 92, V)}
      ${limb('M137 135 L128 200 M137 135 L148 200', R)}
      ${limb('M135 64 L137 135', R, 11)}
      ${limb('M133 82 Q104 112 70 124', R, 7)}
      ${head(135, 46, R)}
      <g class="ill-strike">
        ${limb('M133 76 L108 80 L86 96', R)}
        <circle cx="84" cy="97" r="7" fill="${R}"/>
      </g>
      <g class="ill-impact" stroke="${RED}" stroke-width="3" stroke-linecap="round">
        <line x1="70" y1="84" x2="64" y2="76"/><line x1="80" y1="80" x2="80" y2="70"/><line x1="90" y1="82" x2="96" y2="74"/>
      </g>
    </g>
    <g transform="translate(5 0)">
      ${step(158, 22, 2)}
      ${limb('M62 135 L54 200 M62 135 L72 200', V)}
      ${limb('M60 66 L62 135', V, 11)}
      ${limb('M60 82 Q42 84 50 66', V, 7)}
      ${head(58, 50, V)}
      ${limb('M98 135 L90 200 M98 135 L110 200', R)}
      ${limb('M96 60 L98 135', R, 11)}
      ${head(98, 42, R)}
      <g class="ill-thrust">
        ${limb('M95 76 Q74 92 54 110', R)}
        <circle cx="51" cy="112" r="9" fill="${R}"/>
      </g>
      <path class="ill-pulse" d="M30 132 Q30 112 46 100" fill="none" stroke="${RED}" stroke-width="3.5" stroke-linecap="round"/>
      <path class="ill-pulse" d="M38 98 L47 99 L45 108" fill="none" stroke="${RED}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
    </g>`),

  // رعاف: الجلوس والميل للأمام والضغط على الجزء اللين من الأنف 10 دقائق.
  nosebleed: svg('0 0 360 220', 'شخص جالس يميل رأسه للأمام ويضغط بإصبعيه على الجزء اللين من أنفه، وبجانبه عدّاد 10 دقائق', `
    ${limb('M250 150 L300 150 M300 150 L300 205 M250 150 L250 205 M300 150 L304 92', MUTED, 6)}
    ${limb('M272 146 L222 150 L222 204 L206 204', V)}
    ${limb('M272 146 L238 96', V, 12)}
    <g class="ill-nod">
      ${head(222, 80, V, 17)}
      <path d="M205 80 L198 88 L206 90" fill="${V}" stroke="${V}" stroke-width="4" stroke-linejoin="round"/>
    </g>
    ${limb('M240 102 L222 128 L204 92', V)}
    <circle class="ill-pinch" cx="203" cy="90" r="6.5" fill="${SKIN}" stroke="${V}" stroke-width="2"/>
    <path d="M178 54 Q186 40 204 44" fill="none" stroke="var(--green)" stroke-width="4" stroke-linecap="round"/>
    <path d="M176 46 L178 56 L188 54" fill="none" stroke="var(--green)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    ${timer(84, 96, '10', 'دقائق')}`),

  // نزيف: ضغط مباشر بقطعة قماش نظيفة 10 دقائق دون رفعها.
  bleeding: svg('0 0 360 200', 'يدان تضغطان بقوة على قطعة شاش فوق جرح في الذراع، وبجانبهما عدّاد 10 دقائق', `
    <rect x="30" y="124" width="250" height="46" rx="23" fill="${SKIN}"/>
    <ellipse class="ill-wound" cx="155" cy="138" rx="34" ry="9" fill="${RED}"/>
    <g class="ill-press">
      <rect x="112" y="100" width="86" height="30" rx="6" fill="${WHITE}" stroke="${MUTED}" stroke-width="2"/>
      <rect x="118" y="62" width="74" height="38" rx="15" fill="${R}"/>
      <rect x="124" y="40" width="62" height="30" rx="13" fill="${R}" opacity=".8"/>
      ${limb('M140 42 L126 0 M170 42 L184 0', R, 14)}
    </g>
    <g class="ill-pulse" fill="none" stroke="var(--blue)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M92 70 L92 104 M84 96 L92 105 L100 96"/><path d="M218 70 L218 104 M210 96 L218 105 L226 96"/>
    </g>
    ${timer(320, 70, '10', 'دقائق')}`),

  // حروق: تبريد الحرق تحت ماء جارٍ 20 دقيقة.
  burns: svg('0 0 360 220', 'ماء بارد جارٍ من صنبور فوق حرق في الذراع، وبجانبه عدّاد 20 دقيقة', `
    <rect x="30" y="30" width="130" height="18" rx="9" fill="${MUTED}"/>
    <rect x="78" y="16" width="34" height="12" rx="6" fill="${MUTED}"/>
    <rect x="140" y="30" width="20" height="40" rx="8" fill="${MUTED}"/>
    <g class="ill-water" stroke="${WATER}" stroke-width="5" stroke-linecap="round" stroke-dasharray="10 12">
      <line x1="144" y1="76" x2="144" y2="140"/><line x1="150" y1="72" x2="150" y2="140"/><line x1="156" y1="76" x2="156" y2="140"/>
    </g>
    <rect x="40" y="142" width="230" height="40" rx="20" fill="${SKIN}"/>
    <ellipse class="ill-burn" cx="150" cy="152" rx="30" ry="8" fill="${RED}"/>
    <g class="ill-splash" fill="${WATER}">
      <circle cx="122" cy="136" r="3.5"/><circle cx="178" cy="134" r="3.5"/><circle cx="112" cy="128" r="2.5"/><circle cx="188" cy="126" r="2.5"/>
    </g>
    ${timer(310, 80, '20', 'دقيقة')}`),

  // حساسية شديدة: قلم الإبينفرين في الجزء الخارجي من الفخذ مع التثبيت 3 ثوانٍ.
  anaphylaxis: svg('0 0 360 220', 'قلم الإبينفرين يُضغط بقوة على الجزء الخارجي من الفخذ ويُثبّت 3 ثوانٍ', `
    ${limb('M58 110 L50 56', V, 40)}
    ${head(48, 24, V, 18)}
    ${limb('M40 128 L250 132', 'var(--ill-pants)', 56)}
    ${limb('M250 132 L262 210', 'var(--ill-pants)', 46)}
    <g class="ill-pen">
      <rect x="140" y="12" width="26" height="76" rx="9" fill="${WHITE}" stroke="${MUTED}" stroke-width="2"/>
      <rect x="143" y="2" width="20" height="14" rx="4" fill="var(--blue)"/>
      <rect x="143" y="84" width="20" height="14" rx="4" fill="#f28c28"/>
      <rect x="126" y="34" width="54" height="34" rx="14" fill="${R}"/>
    </g>
    <g class="ill-click" stroke="${RED}" stroke-width="3" stroke-linecap="round">
      <line x1="128" y1="96" x2="118" y2="90"/><line x1="178" y1="96" x2="188" y2="90"/>
    </g>
    <g font-size="13" font-weight="700" text-anchor="middle">
      <circle class="ill-dot1" cx="300" cy="60" r="13" fill="${MUTED}"/><text x="300" y="65" fill="var(--text)">1</text>
      <circle class="ill-dot2" cx="300" cy="96" r="13" fill="${MUTED}"/><text x="300" y="101" fill="var(--text)">2</text>
      <circle class="ill-dot3" cx="300" cy="132" r="13" fill="${MUTED}"/><text x="300" y="137" fill="var(--text)">3</text>
      <text x="300" y="168" font-size="12" fill="var(--muted)">ثوانٍ</text>
    </g>`),

  // كسور: تثبيت الذراع بحمّالة قماش دون تحريكها.
  fracture: svg('0 0 360 220', 'ذراع مثنية أمام الصدر ومعلّقة بحمّالة قماش مربوطة حول الرقبة', `
    ${head(180, 44, V, 24)}
    <rect x="128" y="76" width="104" height="144" rx="34" fill="${V}"/>
    ${limb('M226 92 L240 150', V, 22)}
    ${limb('M240 150 L150 136', SKIN, 20)}
    <path class="ill-sling" d="M140 122 L250 134 L238 176 L148 160 Z M146 126 L166 64 M244 138 L198 64"
      fill="none" stroke="${WHITE}" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"
      stroke-dasharray="520" stroke-dashoffset="520"/>
    <path class="ill-sling-fill" d="M140 122 L250 134 L238 176 L148 160 Z" fill="${WHITE}" opacity="0"/>`),
};
