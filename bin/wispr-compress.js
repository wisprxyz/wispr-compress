#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { compress } from '../src/index.js';

const args = process.argv.slice(2);
const opts = {};
let file = null;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '-q' || a === '--query') opts.query = args[++i];
  else if (a === '-r' || a === '--ratio') opts.ratio = Number(args[++i]);
  else if (a === '-t' || a === '--max-tokens') opts.maxTokens = Number(args[++i]);
  else if (a === '--clean') opts.mode = 'clean';
  else if (a === '--no-gap') opts.gap = '';
  else if (a === '--stats') opts._stats = true;
  else if (a === '-h' || a === '--help') { help(); process.exit(0); }
  else file = a;
}
const input = readFileSync(file ?? 0, 'utf8');
const { text, stats } = compress(input, opts);
process.stdout.write(text + '\n');
if (opts._stats) process.stderr.write(`${stats.tokensBefore} -> ${stats.tokensAfter} tokens (${Math.round(stats.saved * 100)}% saved, ${stats.kept}/${stats.units} units)\n`);

function help() {
  process.stdout.write(`wispr-compress [file] [-q "question"] [-r 0.3] [-t 2000] [--clean] [--no-gap] [--stats]
Reads a file or stdin, writes the compressed text to stdout. --stats prints the token figures to stderr.
`);
}
