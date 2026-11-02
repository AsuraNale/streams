// A child_process.spawn stand-in. fakeSpawn(script) -> spawnImpl with `.calls`.
//   script: { stdout, stderr, status, delayMs, error } or (call) => that object (per spawn).
//   call = { file, args, opts, input } (input is filled when the connector closes stdin).
//   `onSpawn(call)` inside the object runs synchronously at spawn time (to look at opts.cwd while it exists).
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';

export function fakeSpawn(script) {
  const calls = [];
  const impl = function spawn(file, args, opts) {
    const plan = typeof script === 'function' ? script({ file, args, opts, index: calls.length }) : script;
    const { stdout = '', stderr = '', status = 0, delayMs = 0, error = null, onSpawn } = plan || {};
    const call = { file, args, opts, input: '', killed: false };
    calls.push(call);
    if (typeof onSpawn === 'function') onSpawn(call);
    const child = new EventEmitter();
    child.pid = 4242;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    const chunks = [];
    child.stdin = new Writable({
      write(chunk, _enc, cb) { chunks.push(Buffer.from(chunk)); cb(); },
      final(cb) { call.input = Buffer.concat(chunks).toString('utf8'); cb(); },
    });
    let timer = null;
    child.kill = () => {
      call.killed = true;
      if (timer) clearTimeout(timer);
      setImmediate(() => child.emit('close', null, 'SIGTERM'));
      return true;
    };
    if (error) {
      setImmediate(() => child.emit('error', error));
      return child;
    }
    timer = setTimeout(() => {
      if (stdout) child.stdout.write(stdout);
      if (stderr) child.stderr.write(stderr);
      child.stdout.end();
      child.stderr.end();
      setImmediate(() => child.emit('close', status, null));
    }, delayMs);
    return child;
  };
  impl.calls = calls;
  return impl;
}

export function enoent(file) {
  const e = new Error(`spawn ${file} ENOENT`);
  e.code = 'ENOENT';
  return e;
}
