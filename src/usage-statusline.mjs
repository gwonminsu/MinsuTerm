#!/usr/bin/env node
/*
 * MinsuTerm's status line link for Claude Code (copied to ~/.claude/minsuterm/statusline.mjs when the user links it
 * from MinsuTerm; src/usage.js). Claude Code runs it with its status line input on stdin:
 *   1. a copy of the numbers MinsuTerm's usage gauge shows goes to ~/.claude/minsuterm/usage/<session>.json
 *   2. the user's own status line (kept in statusline-prev.json) runs with the same input; its output is ours,
 *      so the status line looks as it did before. With none, nothing is printed.
 * It never fails loudly: any error leaves the status line as the user's own command makes it.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const DIR = path.join(os.homedir(), '.claude', 'minsuterm');
const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const input = Buffer.concat(chunks).toString('utf8');

try {
  const j = JSON.parse(input);
  const id = String(j.session_id || '');
  if (/^[0-9a-zA-Z-]{8,80}$/.test(id)) {
    const cw = j.context_window || {};
    const copy = {
      at: Date.now(),
      model: j.model || null,
      effort: j.effort || null,
      context_window: { used_percentage: cw.used_percentage ?? null, context_window_size: cw.context_window_size ?? null },
      rate_limits: j.rate_limits || null,
      cwd: (j.workspace && j.workspace.current_dir) || j.cwd || '',
    };
    const out = path.join(DIR, 'usage', `${id}.json`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(`${out}.tmp`, JSON.stringify(copy));
    fs.renameSync(`${out}.tmp`, out);
  }
} catch { /* not the input we know: just pass it on */ }

let prev = null;
try { prev = JSON.parse(fs.readFileSync(path.join(DIR, 'statusline-prev.json'), 'utf8')).statusLine; } catch { /* none */ }
if (prev && typeof prev.command === 'string' && prev.command.trim()) {
  // the user's command in a shell like Claude Code's: Git Bash on Windows when there is one, else the system shell
  let bash = '';
  if (process.platform === 'win32') {
    for (const p of [process.env.CLAUDE_CODE_GIT_BASH_PATH, 'C:/Program Files/Git/bin/bash.exe', 'C:/Program Files (x86)/Git/bin/bash.exe']) {
      if (p && fs.existsSync(p)) { bash = p; break; }
    }
  }
  const opts = { input, encoding: 'utf8', timeout: 10000, windowsHide: true, maxBuffer: 1024 * 1024 };
  const r = bash ? spawnSync(bash, ['-c', prev.command], opts) : spawnSync(prev.command, { ...opts, shell: true });
  if (r.stdout) process.stdout.write(r.stdout);
}
