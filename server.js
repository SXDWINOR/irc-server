const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

const xor = buf => Buffer.from(buf).map(b => b ^ 0x14);
const encode = obj => xor(Buffer.from(JSON.stringify(obj), 'utf8'));
const decode = buf => JSON.parse(xor(buf).toString('utf8'));

const clients = new Set();

wss.on('connection', ws => {
  clients.add(ws);
  console.log('client connected, total:', clients.size);

  ws.on('message', data => {
    let msg;
    try { msg = decode(data); } catch { return; }
    if (msg.api_key !== 'LynxWave_secret_key_1488') return;

    if (msg.type === 'login' || msg.type === 'register') {
      ws.send(encode({
        type: 'login_success',
        username: msg.username,
        nickname: msg.username,
        isModerator: false,
        isAdmin: false,
      }));
    }
    if (msg.type === 'text') {
      const out = encode({
        type: 'text',
        author: msg.author,
        client: 'LynxWave',
        prefix: 'user',
        message: msg.message,
        server: 'my-server',
      });
      for (const c of clients) if (c.readyState === 1) c.send(out);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log('client disconnected, total:', clients.size);
  });
});

console.log('IRC server listening on port', PORT);
