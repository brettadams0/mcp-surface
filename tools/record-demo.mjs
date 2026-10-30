// Record the README demo: mcp-surface run against test/fixtures/broken-server.js,
// a server that completes the handshake and would show as connected in any
// client, rendered as a looping terminal animation.
//
// Run once; the output is what gets committed.
//
//   npm run build && node tools/record-demo.mjs
//
// Runs the built CLI for real, keeps its coloured output and exit code, and
// writes docs/demo-light.svg and docs/demo-dark.svg. Nothing in the animation is
// typed by hand except the prompt line: every other line is the CLI's own
// output, including the timing it reports, so a rerun differs from the
// committed file only in that millisecond figure. No dependencies; the SVG
// animates with CSS, so it plays inside a README <img>.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

// What ran, under the bin name dist/cli.js is installed as.
const COMMAND = 'mcp-surface node test/fixtures/broken-server.js';
const ARGS = ['dist/cli.js', 'node', 'test/fixtures/broken-server.js'];

const COLS = 84; // wrap width, in characters
const FONT_SIZE = 13;
const CHAR_W = FONT_SIZE * 0.6; // monospace advance
const LINE_H = 19;
const PAD = 18;
const WIDTH = 720;

const TYPE_MS = 45; // per character of the prompt
const LINE_MS = 90; // between output lines
const HOLD_MS = 5000; // on the final frame before looping

const THEMES = {
  dark: {
    bg: '#0d1117', fg: '#e6edf3', dim: '#8b949e', border: '#30363d',
    red: '#ff7b72', cyan: '#79c0ff', green: '#7ee787', prompt: '#7ee787'
  },
  light: {
    bg: '#ffffff', fg: '#1f2328', dim: '#59636e', border: '#d0d7de',
    red: '#cf222e', cyan: '#0550ae', green: '#116329', prompt: '#116329'
  }
};

// Drop NO_COLOR rather than blanking it: Node warns when both are set, and that
// warning would end up in the recording.
const { NO_COLOR: _ignored, ...env } = process.env;
const run = spawnSync(process.execPath, ARGS, { encoding: 'utf8', env: { ...env, FORCE_COLOR: '1' } });
if (run.error) throw run.error;
const output = (run.stdout + run.stderr).replace(/\s+$/, '');

/** Split one line of SGR-coloured text into styled spans. */
function parseAnsi(line) {
  const spans = [];
  const style = { bold: false, dim: false, color: null };
  let last = 0;
  for (const m of line.matchAll(/\x1b\[([\d;]*)m/g)) {
    if (m.index > last) spans.push({ text: line.slice(last, m.index), ...style });
    for (const code of (m[1] || '0').split(';').map(Number)) {
      if (code === 0) Object.assign(style, { bold: false, dim: false, color: null });
      else if (code === 1) style.bold = true;
      else if (code === 2) style.dim = true;
      else if (code === 22) Object.assign(style, { bold: false, dim: false });
      else if (code === 31) style.color = 'red';
      else if (code === 32) style.color = 'green';
      else if (code === 36) style.color = 'cyan';
      else if (code === 39) style.color = null;
    }
    last = m.index + m[0].length;
  }
  if (last < line.length) spans.push({ text: line.slice(last), ...style });
  return spans;
}

/** Hard-wrap styled spans at COLS, indenting continuations to the first word. */
function wrap(spans) {
  const plain = spans.map((s) => s.text).join('');
  if (plain.length <= COLS) return [spans];
  const indent = ' '.repeat(Math.min(plain.search(/\S/) + 7, 16));
  const rows = [];
  let row = [];
  let width = 0;
  for (const span of spans) {
    for (const word of span.text.split(/(?<= )/)) {
      if (width + word.length > COLS && width > indent.length) {
        rows.push(row);
        row = [{ ...span, text: indent }];
        width = indent.length;
      }
      row.push({ ...span, text: word });
      width += word.length;
    }
  }
  rows.push(row);
  return rows;
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function render(theme) {
  const lines = output.split('\n').flatMap((l) => wrap(parseAnsi(l)));
  const exitLine = [{ text: `exit ${run.status}`, dim: true, bold: false, color: null }];
  const all = [null, ...lines, [], exitLine]; // null = the prompt line
  const height = PAD * 2 + 26 + all.length * LINE_H;

  const typeEnd = COMMAND.length * TYPE_MS + 400;
  const lineAt = (i) => typeEnd + i * LINE_MS;
  const total = lineAt(all.length) + HOLD_MS;
  const pct = (ms) => ((ms / total) * 100).toFixed(2);

  const css = [
    `text{font:${FONT_SIZE}px ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;white-space:pre;fill:${theme.fg}}`,
    `.d{fill:${theme.dim}}.b{font-weight:700}.red{fill:${theme.red}}.cyan{fill:${theme.cyan}}.green{fill:${theme.green}}`,
    // Each line is invisible until its moment, visible to the end, then resets.
    ...all.map((_, i) => {
      const at = i === 0 ? 0 : lineAt(i);
      return `@keyframes l${i}{0%,${pct(at)}%{opacity:0}${pct(at + 1)}%,99.9%{opacity:1}100%{opacity:0}}` +
        `.l${i}{animation:l${i} ${total}ms step-end infinite}`;
    }),
    // The prompt types out by widening a clip over it.
    `@keyframes type{0%{width:0}${pct(typeEnd - 400)}%,100%{width:${(COMMAND.length + 2) * CHAR_W + 2}px}}`,
    `.type{animation:type ${total}ms steps(${COMMAND.length + 2},end) infinite}`,
    `@media (prefers-reduced-motion:reduce){[class^=l],.type{animation:none!important;opacity:1}` +
      `.type{width:${(COMMAND.length + 2) * CHAR_W + 2}px}}`
  ];

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${height}" width="${WIDTH}" height="${height}">`,
    `<style>${css.join('')}</style>`,
    `<rect x="0.5" y="0.5" width="${WIDTH - 1}" height="${height - 1}" rx="8" fill="${theme.bg}" stroke="${theme.border}"/>`,
    ...['#ff5f57', '#febc2e', '#28c840'].map((c, i) => `<circle cx="${PAD + 4 + i * 16}" cy="${PAD + 2}" r="5" fill="${c}"/>`),
    `<clipPath id="c"><rect class="type" x="${PAD}" y="${PAD + 26}" height="${LINE_H}" width="0"/></clipPath>`
  ];
  all.forEach((spans, i) => {
    const y = PAD + 26 + i * LINE_H + FONT_SIZE;
    if (spans === null) {
      svg.push(`<text x="${PAD}" y="${y}" clip-path="url(#c)"><tspan class="green">$</tspan> ${esc(COMMAND)}</text>`);
      return;
    }
    const tspans = spans.map((s) => {
      const cls = [s.dim && 'd', s.bold && 'b', s.color].filter(Boolean).join(' ');
      return cls ? `<tspan class="${cls}">${esc(s.text)}</tspan>` : esc(s.text);
    });
    svg.push(`<text class="l${i}" x="${PAD}" y="${y}">${tspans.join('')}</text>`);
  });
  svg.push('</svg>');
  return svg.join('\n') + '\n';
}

mkdirSync('docs', { recursive: true });
for (const [name, theme] of Object.entries(THEMES)) writeFileSync(`docs/demo-${name}.svg`, render(theme));
console.log(`exit ${run.status}; wrote docs/demo-light.svg and docs/demo-dark.svg`);
