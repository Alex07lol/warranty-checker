"use strict";

const crypto = require("node:crypto");

// Attach a request ID to every request. An incoming X-Request-ID is echoed
// when it looks sane (a load balancer / client may already assign one);
// otherwise a UUID is generated. Exposed as req.id, echoed on the response
// header and included in every log line + error payload, so a user-reported
// error can be traced to the exact request in the server logs.
function requestId(req, res, next) {
  const incoming = req.get("X-Request-ID");
  const id =
    incoming && /^[A-Za-z0-9-]{1,64}$/.test(incoming)
      ? incoming
      : crypto.randomUUID();
  req.id = id;
  res.setHeader("X-Request-ID", id);
  next();
}

module.exports = requestId;
