// Generates the "សៀវភៅ PN" logo as pure SVG paths (no font dependency).
// Text is shaped with HarfBuzz (correct Khmer vowel ordering) and converted to outlines.
const fs = require('fs');
const path = require('path');

const OUT = process.argv[2] ?? path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

const C = {
  bg: '#141414',
  white: '#FFFFFF',
  cyan: '#29B5E8',
  shadow: '#6E6E6E',
  page1: '#B9BDC1',
  page2: '#8A8F94',
};

/** Shapes `text` and returns one SVG path in pixels plus its bounding box. */
async function outline(hb, fontFile, text, sizePx, variations) {
  const blob = hb.createBlob(fs.readFileSync(fontFile));
  const face = hb.createFace(blob, 0);
  const font = hb.createFont(face);
  if (variations) font.setVariations(variations);
  const upem = face.upem;
  const buffer = hb.createBuffer();
  buffer.addText(text);
  buffer.guessSegmentProperties();
  hb.shape(font, buffer);
  const glyphs = buffer.json();
  const s = sizePx / upem;
  let penX = 0;
  let d = '';
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const g of glyphs) {
    const ox = penX + g.dx;
    const oy = g.dy;
    const raw = font.glyphToPath(g.g);
    const tokens = raw.match(/[MLQCZ]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
    let i = 0;
    while (i < tokens.length) {
      const cmd = tokens[i++];
      const n = { M: 1, L: 1, Q: 2, C: 3, Z: 0 }[cmd];
      d += cmd;
      const pts = [];
      for (let k = 0; k < n; k++) {
        const x = (Number(tokens[i++]) + ox) * s;
        const y = -(Number(tokens[i++]) + oy) * s;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        pts.push(`${x.toFixed(2)} ${y.toFixed(2)}`);
      }
      d += pts.join(' ');
    }
    penX += g.ax;
  }
  buffer.destroy();
  font.destroy();
  face.destroy();
  blob.destroy();
  return { d, box: { x: minX, y: minY, w: maxX - minX, h: maxY - minY } };
}

/** Places an outline so its bbox has the given top-left and returns a <path>. */
function place(o, x, y, fill, extra = '') {
  return `<path transform="translate(${(x - o.box.x).toFixed(2)} ${(y - o.box.y).toFixed(2)})" d="${o.d}" fill="${fill}"${extra}/>`;
}

async function main() {
  const hb = await require('harfbuzzjs');
  const pn = await outline(hb, path.join(__dirname, 'fonts/Anton.ttf'), 'PN', 210);
  const km = await outline(hb, path.join(__dirname, 'fonts/NotoSansKhmer.ttf'), 'សៀវភៅ', 70, {
    wght: 800,
    wdth: 100,
  });

  // ---- Layout (before the italic skew), 512 × 512 canvas -------------------------------
  const pnScale = 205 / pn.box.h; // cap height 205 px
  const pnW = pn.box.w * pnScale;
  const barW = pnW + 40;
  const barH = 80;
  // Vertically centre PN + bar + pages (346 px tall).
  const top = Math.round((512 - (205 + 20 + 80 + 14 + 27)) / 2);
  const pnX = 256 - pnW / 2;
  const barX = 256 - barW / 2;
  const barY = top + 205 + 20;
  const kmScale = Math.min((barH - 26) / km.box.h, (barW - 40) / km.box.w);
  const kmW = km.box.w * kmScale;
  const kmH = km.box.h * kmScale;
  const sh = 9; // shadow offset

  const pnPath = (fill, dx, dy) =>
    `<g transform="translate(${(pnX + dx).toFixed(2)} ${(top + dy).toFixed(2)}) scale(${pnScale.toFixed(4)}) translate(${(-pn.box.x).toFixed(2)} ${(-pn.box.y).toFixed(2)})"><path d="${pn.d}" fill="${fill}"/></g>`;
  const kmPath = `<g transform="translate(${(256 - kmW / 2).toFixed(2)} ${(barY + (barH - kmH) / 2).toFixed(2)}) scale(${kmScale.toFixed(4)}) translate(${(-km.box.x).toFixed(2)} ${(-km.box.y).toFixed(2)})"><path d="${km.d}" fill="${C.white}"/></g>`;

  const pageY = barY + barH + 14;
  const pages = `
    <rect x="${(barX + 14).toFixed(1)}" y="${pageY}" width="${(barW - 28).toFixed(1)}" height="10" rx="2" fill="${C.page1}"/>
    <rect x="${(barX + 34).toFixed(1)}" y="${pageY + 17}" width="${(barW - 68).toFixed(1)}" height="10" rx="2" fill="${C.page2}"/>`;

  const content = `
  <g transform="translate(256 256) skewY(-14) translate(-256 -256)">
    ${pnPath(C.shadow, -sh, sh)}
    ${pnPath(C.white, 0, 0)}
    <rect x="${(barX - sh + 2).toFixed(1)}" y="${barY + sh - 2}" width="${barW.toFixed(1)}" height="${barH}" fill="${C.shadow}"/>
    <rect x="${barX.toFixed(1)}" y="${barY}" width="${barW.toFixed(1)}" height="${barH}" fill="${C.cyan}"/>
    ${kmPath}
    ${pages}
  </g>`;

  const title = 'សៀវភៅ PN';
  const logo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="${title}">
  <title>${title}</title>
  <circle cx="256" cy="256" r="256" fill="${C.bg}"/>${content}
</svg>
`;
  fs.writeFileSync(path.join(OUT, 'logo.svg'), logo);

  // Small-size mark (favicon/app icon): same composition without the Khmer text, thicker pages.
  const mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="${title}">
  <title>${title}</title>
  <circle cx="256" cy="256" r="256" fill="${C.bg}"/>
  <g transform="translate(256 256) skewY(-14) translate(-256 -256)">
    ${pnPath(C.shadow, -sh - 3, sh + 3)}
    ${pnPath(C.white, 0, 0)}
    <rect x="${barX.toFixed(1)}" y="${barY}" width="${barW.toFixed(1)}" height="${barH - 10}" fill="${C.cyan}"/>
    <rect x="${(barX + 20).toFixed(1)}" y="${barY + barH + 4}" width="${(barW - 40).toFixed(1)}" height="16" rx="3" fill="${C.page1}"/>
  </g>
</svg>
`;
  fs.writeFileSync(path.join(OUT, 'logo-mark.svg'), mark);
  console.log('written', OUT, {
    pnW: pnW.toFixed(0),
    barW: barW.toFixed(0),
    kmW: kmW.toFixed(0),
    kmH: kmH.toFixed(0),
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
