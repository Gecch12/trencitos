"use strict";
const net = require("node:net");
const crypto = require("node:crypto");
const { EventEmitter, once } = require("node:events");

// A small RFC 6455 client keeps integration tests dependency-free on Node 20+.
async function connect(port, { cookie = "", origin = "", protocols = "" } = {}) {
  if([cookie, origin, protocols].some(value => /[\r\n]/.test(value))) throw Error("Invalid test headers");
  const socket = net.connect(port, "127.0.0.1");
  const events = new EventEmitter();
  const messages = [];
  let buffer = Buffer.alloc(0), upgraded = false;
  const key = crypto.randomBytes(16).toString("base64");
  function frame(opcode, payload) {
    payload = Buffer.from(payload);
    const header = Buffer.alloc(payload.length < 126 ? 6 : 8);
    header[0] = 128 | opcode;
    if (payload.length < 126) header[1] = 128 | payload.length;
    else { header[1] = 128 | 126; header.writeUInt16BE(payload.length, 2); }
    const mask = crypto.randomBytes(4);
    mask.copy(header, header.length - 4);
    const masked = Buffer.from(payload);
    for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i % 4];
    return Buffer.concat([header, masked]);
  }
  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    if (!upgraded) {
      const end = buffer.indexOf("\r\n\r\n");
      if (end < 0) return;
      const response = buffer.subarray(0, end).toString();
      if (!response.startsWith("HTTP/1.1 101")) {
        events.emit("error", new Error(response));
        return;
      }
      buffer = buffer.subarray(end + 4);
      upgraded = true;
      events.emit("open");
    }
    while (buffer.length >= 2) {
      const op = buffer[0] & 15;
      let length = buffer[1] & 127, header = 2;
      if (length === 126) {
        if (buffer.length < 4) return;
        length = buffer.readUInt16BE(2); header = 4;
      } else if (length === 127) {
        if (buffer.length < 10) return;
        length = Number(buffer.readBigUInt64BE(2)); header = 10;
      }
      if (buffer.length < header + length) return;
      const payload = buffer.subarray(header, header + length);
      buffer = buffer.subarray(header + length);
      if (op === 9) socket.write(frame(10, payload));
      else if (op === 1) {
        const message = JSON.parse(payload.toString());
        messages.push(message);
        events.emit("message");
      }
    }
  });
  socket.on("error", (error) => events.emit("error", error));
  await once(socket, "connect");
  const ready = once(events, "open");
  socket.write(`GET /socket HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${key}\r\n${cookie ? `Cookie: ${cookie}\r\n` : ""}${origin ? `Origin: ${origin}\r\n` : ""}${protocols ? `Sec-WebSocket-Protocol: ${protocols}\r\n` : ""}\r\n`);
  await ready;
  return {
    send: (message) => socket.write(frame(1, JSON.stringify(message))),
    close: () => socket.destroy(),
    async next(type, predicate = () => true, timeoutMs = 5000) {
      const abort = new AbortController();
      const timeout = setTimeout(() => abort.abort(), timeoutMs);
      try {
        while (true) {
          const index = messages.findIndex((message) => message.type === type && predicate(message));
          if (index >= 0) return messages.splice(index, 1)[0];
          await once(events, "message", { signal: abort.signal });
        }
      } finally { clearTimeout(timeout); }
    },
  };
}

module.exports = { connect };
