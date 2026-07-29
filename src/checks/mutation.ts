import type { Check, Finding, ToolSurface } from '../types.js';

/**
 * Verbs that indicate a tool changes state somewhere. Matched against whole
 * name segments rather than substrings, so `chess_get_current_games` isn't
 * caught by "create" and `reddit_get_post` isn't caught by "post".
 */
const MUTATION_VERBS = new Set([
  'add',
  'archive',
  'cancel',
  'create',
  'delete',
  'edit',
  'insert',
  'mark',
  'modify',
  'move',
  'post',
  'publish',
  'put',
  'rate',
  'remove',
  'rename',
  'reply',
  'revoke',
  'send',
  'set',
  'submit',
  'subscribe',
  'unsubscribe',
  'update',
  'upload',
  'vote',
  'write'
]);

/**
 * Phrases servers use when they know a tool is consequential. These are strong
 * evidence on their own — a description that says "immediately" is describing
 * an irreversible action whether or not the name contains a verb we know.
 */
const MUTATION_PHRASES = [
  'no confirmation',
  'immediately',
  'irreversible',
  'cannot be undone',
  'permanently'
];

/**
 * Read verbs, needed because plenty of nouns double as mutation verbs. In
 * `reddit_get_post`, "post" is the thing being fetched, not the action — so
 * whichever verb appears *first* decides what the tool does.
 */
const READ_VERBS = new Set([
  'describe',
  'fetch',
  'find',
  'get',
  'list',
  'load',
  'lookup',
  'query',
  'read',
  'retrieve',
  'search',
  'show',
  'view'
]);

/** Split `youtube_add_to_playlist` / `addToPlaylist` into lowercase segments. */
function segments(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((s) => s.toLowerCase());
}

function mutationSignal(tool: ToolSurface): string | null {
  for (const segment of segments(tool.name)) {
    // First verb wins: `get_post` reads, `post_comment` writes.
    if (READ_VERBS.has(segment)) return null;
    if (MUTATION_VERBS.has(segment)) return `its name contains "${segment}"`;
  }

  const description = (tool.description ?? '').toLowerCase();
  const phrase = MUTATION_PHRASES.find((p) => description.includes(p));
  if (phrase) return `its description says "${phrase}"`;

  return null;
}

/**
 * A tool that changes state but carries no annotations gives a client nothing
 * to gate on. Clients that auto-approve read-only calls decide by reading
 * `readOnlyHint`; with no annotations at all, a tool that posts publicly is
 * indistinguishable from one that reads a profile.
 *
 * This is a heuristic — it guesses from names and descriptions — so it warns
 * rather than errors, and says which signal triggered it so a false positive
 * is obvious at a glance. Silence it per-tool with `--skip`.
 */
export const mutationAnnotationsCheck: Check = {
  id: 'mutation-annotations',
  run(surface) {
    const findings: Finding[] = [];

    for (const tool of surface.tools) {
      // Any annotations at all mean the author has thought about this; we're
      // looking for the tools where nobody has said anything either way.
      if (tool.annotations && Object.keys(tool.annotations).length > 0) continue;

      const signal = mutationSignal(tool);
      if (!signal) continue;

      findings.push({
        rule: 'mutation-annotations',
        level: 'warn',
        subject: tool.name,
        message: `Looks like it changes state (${signal}) but declares no annotations — a client cannot tell it apart from a read, so it can't be gated or auto-approved. Add annotations.destructiveHint / readOnlyHint.`
      });
    }

    return findings;
  }
};
