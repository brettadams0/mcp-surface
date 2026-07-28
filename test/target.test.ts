import { describe, expect, it } from 'vitest';
import { parseTarget } from '../src/connect.js';

describe('parseTarget', () => {
  it('treats an http URL as a Streamable HTTP target', () => {
    expect(parseTarget(['https://example.com/mcp'])).toEqual({
      kind: 'http',
      url: new URL('https://example.com/mcp')
    });
  });

  it('treats anything else as a command plus arguments', () => {
    expect(parseTarget(['node', 'server.js', '--flag'])).toEqual({
      kind: 'stdio',
      command: 'node',
      args: ['server.js', '--flag']
    });
  });

  it('honours --transport sse for a URL', () => {
    expect(parseTarget(['https://example.com/sse'], { transport: 'sse' }).kind).toBe('sse');
  });

  it('honours --transport stdio even when the command looks like a URL', () => {
    expect(parseTarget(['https://example.com'], { transport: 'stdio' })).toEqual({
      kind: 'stdio',
      command: 'https://example.com',
      args: []
    });
  });

  it('rejects an http transport without a URL', () => {
    expect(() => parseTarget(['node', 'server.js'], { transport: 'http' })).toThrow(/needs an http/);
  });

  it('rejects stray arguments after a URL', () => {
    expect(() => parseTarget(['https://example.com/mcp', 'extra'])).toThrow(/no extra arguments/);
  });

  it('rejects an empty target', () => {
    expect(() => parseTarget([])).toThrow(/No target/);
  });
});
