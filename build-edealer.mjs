// Generates team-edealer.html + team-edealer.css — eDealer /staff/ visual style,
// roster parsed out of team-d2c.html so the two can never drift.
// Re-run after any roster change:  node build-edealer.mjs
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const src = await readFile('team-d2c.html', 'utf8');

// Intrinsic size per photo. Most are 800x1067 but a few differ, and a wrong
// width/height hint causes a visible reflow when the image lands — so read the
// real numbers off disk rather than assuming a single ratio.
async function intrinsic(url) {
  const file = 'team-photos/' + decodeURIComponent((url.match(/team-photos\/(.+)$/) || [])[1] || '');
  try {
    const { width, height } = await sharp(file).metadata();
    return { width, height };
  } catch {
    return null; // photo not on disk — omit the hint rather than guess
  }
}

// --- parse roster out of team-d2c.html -------------------------------------
const depts = [];
for (const chunk of src.split('<div class="section-heading">').slice(1)) {
  const label = (chunk.match(/class="label">([^<]*)</) || [])[1] || '';
  const name = label.replace(/^\s*\d+\s*—\s*/, '').trim(); // "01 — Leadership" -> "Leadership"
  const members = [];
  for (const [, card] of chunk.matchAll(/<div class="staff-card">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g)) {
    const person = (card.match(/class="staff-name">([^<]*)</) || [])[1];
    if (!person) continue;
    members.push({
      name: person.trim(),
      role: ((card.match(/class="staff-role">([^<]*)</) || [])[1] || '').trim(),
      photo: (card.match(/<img src="([^"]+)"/) || [])[1],
      ext: ((card.match(/fa-phone icon"><\/i>([^<]*)</) || [])[1] || '').trim(),
      email: ((card.match(/href="mailto:([^"]+)"/) || [])[1] || '').trim(),
    });
  }
  if (members.length) depts.push({ name, members });
}
const total = depts.reduce((n, d) => n + d.members.length, 0);

for (const d of depts) {
  for (const m of d.members) m.dim = await intrinsic(m.photo);
}

// --- markup ----------------------------------------------------------------
// The icons are EMPTY spans, not inline <svg>. WordPress's sanitiser removed
// every <svg> element from the pasted content (confirmed on the live page:
// 0 of 60 survived), so the artwork has to arrive through CSS instead — as a
// data: URI background, which lives inside the stylesheet and is never touched.
const ICON_MAIL = '';
const ICON_PHONE = '';

const svgUri = (s) => 'url("data:image/svg+xml,' +
  s.replace(/</g, '%3C').replace(/>/g, '%3E').replace(/#/g, '%23').replace(/"/g, "'") + '")';
const ICON_MAIL_CSS = svgUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="none" stroke="#ca0000" stroke-width="1.4"/><path d="M6.5 9h11v6.2h-11z" fill="none" stroke="#ca0000" stroke-width="1.4"/><path d="m6.5 9.3 5.5 3.9 5.5-3.9" fill="none" stroke="#ca0000" stroke-width="1.4"/></svg>');
const ICON_PHONE_CSS = svgUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="none" stroke="#ca0000" stroke-width="1.4"/><path d="M9 7.4c.5 0 .8.2 1 .7l.7 1.6c.2.5.1.8-.3 1.1l-.6.5a7.4 7.4 0 0 0 2.9 2.9l.5-.6c.3-.4.6-.5 1.1-.3l1.6.7c.5.2.7.5.7 1 0 1.3-1 2.1-2.2 1.9A9.2 9.2 0 0 1 7.1 9.6C6.9 8.4 7.7 7.4 9 7.4Z" fill="#ca0000"/></svg>');

// All on ONE line, deliberately. wpautop converts a single newline inside a
// paragraph into <br>, so twelve radios on twelve lines became one <p> holding
// eleven <br> tags — a 275px blank gap above the tabs. No newlines, no <br>.
const radios = '  ' + depts.map((d, i) =>
  `<input class="gmc-radio" type="radio" name="gmc-dept" id="gmc-d${i}"${i === 0 ? ' checked' : ''}>`
).join('');

const tabs = depts.map((d, i) =>
  `        <li class="gmc-tab"><label class="gmc-tab-link" for="gmc-d${i}">${d.name}</label></li>`
).join('\n');

const card = (m) => {
  const rows = [
    m.ext ? `<li><span class="gmc-ico gmc-ico-phone">${ICON_PHONE}</span><span>${m.ext}</span></li>` : '',
    m.email ? `<li><span class="gmc-ico gmc-ico-mail">${ICON_MAIL}</span><a href="mailto:${m.email}">${m.email}</a></li>` : '',
  ].filter(Boolean);
  const contact = rows.length
    ? `\n              <ul class="gmc-contact">\n                ${rows.join('\n                ')}\n              </ul>`
    : '';
  return `          <div class="gmc-cell">
            <div class="gmc-box">
              <div class="gmc-img"><img src="${m.photo}" alt="${m.name}" loading="lazy"${m.dim ? ` width="${m.dim.width}" height="${m.dim.height}"` : ''}></div>
              <div class="gmc-details">
                <div class="gmc-name">${m.name}</div>
                <div class="gmc-title">${m.role}</div>${contact}
              </div>
            </div>
          </div>`;
};

const panels = depts.map((d, i) => `      <div class="gmc-panel gmc-panel-${i}">
        <div class="gmc-grid">
${d.members.map(card).join('\n')}
        </div>
      </div>`).join('\n');

// Two equivalent rule sets per department.
//
//   :has()  — ancestry-based. Survives a CMS wrapping or re-nesting our markup
//             (WordPress's wpautop happily drops <p> tags between siblings),
//             because it only needs the radio to stay INSIDE .gmc-staff.
//   ~       — sibling-based fallback for browsers without :has(). Correct only
//             while the original sibling order is intact.
//
// Both are emitted; whichever matches wins, and they never disagree.
const activeRules = depts.map((_, i) =>
  `.gmc-staff:has(#gmc-d${i}:checked) .gmc-tab-link[for="gmc-d${i}"]::after{opacity:1}\n` +
  `.gmc-staff:has(#gmc-d${i}:checked) .gmc-panel-${i}{display:block}\n` +
  `#gmc-d${i}:checked ~ .gmc-wrap .gmc-tab-link[for="gmc-d${i}"]::after{opacity:1}\n` +
  `#gmc-d${i}:checked ~ .gmc-wrap .gmc-panel-${i}{display:block}`
).join('\n');

const CDN = 'https://golden-mile-team-page.pages.dev/';

// Two builds from the same markup:
//   team-edealer.html        — for pasting into the CMS: absolute asset URLs (the
//                              editor's page is not served from our host).
//   team-edealer.local.html  — for previewing on localhost: relative URLs, so it
//                              renders correctly straight off disk with no network.
// `links: false` omits the <link> tags. WordPress KSES strips them from post
// content unless the author has unfiltered_html (single-site admins do,
// multisite non-super-admins do not) — shipping tags that get deleted just
// makes the paste look broken for no gain. The CSS goes in via the theme's
// Additional CSS box instead; see team-edealer.wp.css.
//
// No .gmc-titlebar either: the host page already renders its own "MEET OUR
// TEAM" band, so ours was a duplicate banner.
const buildHtml = ({ cssHref, rel, links = true }) => `${links ? `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${cssHref}">

` : ''}<div class="gmc-staff">

${radios}

  <div class="gmc-wrap">
    <div class="gmc-container">

      <ul class="gmc-tabs">
${tabs}
      </ul>

${panels}

    </div>
  </div>

</div>
`.replace(new RegExp(CDN, 'g'), rel ? '' : CDN);

// WordPress's wpautop turns a blank line in post content into a <p> tag, which
// would litter the markup and can break sibling-based CSS. The embed build ships
// with no blank lines so there is nothing for it to act on; the local preview
// keeps them for readability.
const deblank = s => s.replace(/\n[ \t]*\n+/g, '\n');

await writeFile('team-edealer.html', deblank(buildHtml({ cssHref: CDN + 'team-edealer.css', rel: false, links: false })));
await writeFile('team-edealer.local.html', buildHtml({ cssHref: 'team-edealer.css', rel: true, links: true }));

// --- stylesheet ------------------------------------------------------------
const css = `/* Golden Mile — staff page in the eDealer /staff/ visual style.
   Values measured from the live eDealer page's computed styles. */

.gmc-staff{--gmc-red:#ca0000;--gmc-dark:#222;--gmc-card:#ebebeb;--gmc-gut:37.5px;
  font-family:Arial,Helvetica,sans-serif;color:#000;-webkit-font-smoothing:antialiased}
.gmc-staff *,.gmc-staff *::before,.gmc-staff *::after{box-sizing:border-box}
.gmc-container{max-width:1440px;margin:0 auto;padding:0 83px}

/* department tabs — pure CSS, no JavaScript (CMS editors strip <script>) */
.gmc-radio{position:absolute;opacity:0;pointer-events:none;width:0;height:0}
/* WordPress's wpautop wraps each loose radio in its own <p>. The radio is taken
   out of flow, but the <p> still generates a line box with default margins —
   twelve of them stacked up as a large blank gap above the tabs. display:contents
   removes the wrapper's box while leaving the input where it is. */
.gmc-staff p:has(> .gmc-radio){display:contents}
.gmc-staff > p:empty{display:none}
/* and any <br> wpautop inserted between them — belt and braces, since the markup
   now keeps the radios on one line so there should be none to begin with */
.gmc-staff p:has(> .gmc-radio) br,.gmc-staff > br{display:none}
.gmc-tabs{display:flex;flex-wrap:wrap;row-gap:14px;list-style:none;margin:0 0 28px;padding:28px 0 0;
  border-bottom:1px solid #ddd}
.gmc-tab{padding:0 25px 0 0}
.gmc-tab-link{position:relative;display:inline-flex;padding-bottom:12px;font-size:17px;line-height:1.3;
  color:#000;cursor:pointer;text-transform:uppercase;white-space:nowrap}
.gmc-tab-link::after{content:"";position:absolute;left:0;bottom:-1px;width:100%;height:2px;
  background:var(--gmc-red);opacity:0;transition:opacity .15s ease}
.gmc-tab-link:hover::after{opacity:.45}
.gmc-radio:focus-visible + .gmc-wrap .gmc-tab-link{outline:2px solid var(--gmc-red);outline-offset:3px}

/* panels */
.gmc-panel{display:none}

/* grid — 1 / 2 / 3 up, matching eDealer's medium-6 xlarge-4 */
.gmc-grid{display:flex;flex-wrap:wrap;margin:0 calc(var(--gmc-gut) / -2)}
.gmc-cell{width:100%;padding:0 calc(var(--gmc-gut) / 2);margin-bottom:var(--gmc-gut)}
@media (min-width:640px){.gmc-cell{width:50%}}
@media (min-width:1200px){.gmc-cell{width:33.3333%}}

/* card */
.gmc-box{background:var(--gmc-card);padding:25px;height:100%}
.gmc-img{line-height:0}
.gmc-img img{width:100%;height:auto;display:block}
.gmc-details{padding-top:18px}
.gmc-name{font-family:Oswald,"Arial Narrow",Helvetica,Arial,sans-serif;font-size:25px;line-height:30px;
  font-weight:400;letter-spacing:.2px;color:#000}
.gmc-title{font-family:Oswald,"Arial Narrow",Helvetica,Arial,sans-serif;font-size:20px;line-height:25px;
  font-weight:600;letter-spacing:.4px;color:#000;margin-top:2px}

/* contact list */
.gmc-contact{list-style:none;margin:14px 0 0;padding:0}
.gmc-contact li{display:flex;align-items:center;gap:9px;font-size:13px;line-height:1.5;margin-top:7px}
.gmc-contact a{color:#000;text-decoration:none;word-break:break-all}
.gmc-contact a:hover{text-decoration:underline}
.gmc-ico{flex:0 0 20px;width:20px;height:20px;background-repeat:no-repeat;background-position:center;background-size:20px 20px}
.gmc-ico-phone{background-image:${ICON_PHONE_CSS}}
.gmc-ico-mail{background-image:${ICON_MAIL_CSS}}

/* active tab + visible panel */
${activeRules}

@media (max-width:900px){
  .gmc-container{padding:0 24px}
  .gmc-tabs{flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}
  .gmc-tabs::-webkit-scrollbar{display:none}
}
`;
await writeFile('team-edealer.css', css);

// Paste-into-Additional-CSS payload: same rules, plus the webfont as an @import
// (there is no <link> to carry it once KSES has been through the post content).
// @import must be the first rule in the sheet.
const wpCss = `@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&display=swap');\n\n${css}`;
await writeFile('team-edealer.wp.css', wpCss);

// THE ONE-PASTE BUILD: <style> carrying the whole stylesheet, then the markup.
//
// The <style> tag itself survives WordPress fine — but wpautop runs over its
// CONTENTS and turns every newline into <br /> and every blank line into <p>.
// Measured on the live page: 645 characters of HTML tags injected into the
// stylesheet, and the browser's CSS parser gave up after 1 rule out of 84.
//
// So the stylesheet ships as a SINGLE LINE. No newlines, nothing for wpautop to
// convert. Comments are stripped and whitespace collapsed to single spaces,
// which is enough to keep every selector and declaration valid.
const oneLine = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')   // comments (a stray */ would end the sheet)
  .replace(/\s+/g, ' ')               // all whitespace, newlines included -> one space
  .trim();

const embed = `<style>${oneLine(wpCss)}</style>` +
  deblank(buildHtml({ cssHref: '', rel: false, links: false }));
await writeFile('team-edealer.embed.html', embed);

console.log(`departments: ${depts.length}   people: ${total}`);
for (const d of depts) console.log(`  ${String(d.members.length).padStart(2)}  ${d.name}`);
console.log('\nwrote team-edealer.embed.html — THE ONE TO PASTE: <style> + markup, single block');
console.log('      team-edealer.html      — markup only (if the CSS is placed separately)');
console.log('      team-edealer.wp.css    — that separate CSS, for Customize > Additional CSS');
console.log('      team-edealer.local.html — local preview (relative URLs, keeps <link> tags)');
console.log('      team-edealer.css        — served from the CDN');
