"use strict";

// Minimal structured logger: one JSON object per line to stdout (info) or
// stderr (warn/error), with a timestamp, level, message and caller-supplied
// fields (request id, duration, error type, …). Callers decide what goes into
// fields — secrets, tokens and document contents must never be passed in.
function write(level, stream, msg, fields = {}) {
  const line = JSON.stringify({
    level,
    ts: new Date().toISOString(),
    msg,
    ...fields
  });
  stream.write(line + "\n");
}

const logger = {
  info: (msg, fields) => write("info", process.stdout, msg, fields),
  warn: (msg, fields) => write("warn", process.stderr, msg, fields),
  error: (msg, fields) => write("error", process.stderr, msg, fields)
};

module.exports = logger;
