// An in-memory stand-in for Redis with the few commands api/letters.js uses, for the local
// server and the tests. maxRequest: refuse values bigger than this, like a hosted plan's limit.
module.exports = function memoryStore(opts) {
  opts = opts || {};
  const m = new Map();
  function run(cmd) {
    const [op, key, ...rest] = cmd.map(String);
    const size = cmd.reduce((n, a) => n + String(a).length, 0);
    if (opts.maxRequest && size > opts.maxRequest) throw new Error("ERR max request size exceeded");
    switch (op.toUpperCase()) {
      case "PING": return "PONG";
      case "GET": return m.has(key) ? m.get(key) : null;
      case "SET": {
        const flags = rest.slice(1).map((s) => s.toUpperCase());
        if (flags.includes("NX") && m.has(key)) return null;
        m.set(key, rest[0]);
        return "OK";
      }
      case "INCR": { const n = Number(m.get(key) || 0) + 1; m.set(key, String(n)); return n; }
      case "DEL": return m.delete(key) ? 1 : 0;
      default: throw new Error("ERR unknown command " + op);
    }
  }
  return { kind: "memory", m, run: async (cmd) => run(cmd), many: async (cmds) => cmds.map(run) };
};
