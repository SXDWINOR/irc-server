const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('IRC server is running');
});

const wss = new WebSocketServer({ server });

const xor = buf => Buffer.from(buf).map(b => b ^ 0x14);
const encode = obj => xor(Buffer.from(JSON.stringify(obj), 'utf8'));
const decode = buf => JSON.parse(xor(buf).toString('utf8'));

const clients = new Map();

function broadcast(obj) {
  const payload = encode(obj);
  for (const c of clients.keys()) {
    if (c.readyState === 1) c.send(payload);
  }
}

wss.on('connection', ws => {
  clients.set(ws, null);
  console.log('connected, total:', clients.size);

  ws.send(encode({
    type: 'version_info',
    serverVersion: 2,
    minClientVersion: 1,
  }));

ws.on('message', data => {
    let msg;
    try { msg = decode(data); } catch (e) { console.log('decode error:', e.message); return; }
    console.log('received:', msg.type, JSON.stringify(msg).slice(0, 200));

    switch (msg.type) {
      case 'register':
      case 'login': {
        const username = String(msg.username || '').trim();
        if (!username) return;
        clients.set(ws, { username, nickname: username });
        ws.send(encode({
          type: 'login_success',
          message: msg.type === 'register' ? 'Регистрация успешна' : 'Вход выполнен успешно',
          user: {
            username,
            nickname: username,
            isModerator: false,
            isAdmin: false,
          },
        }));
        break;
      }
      case 'text': {
        const session = clients.get(ws);
        const author = (session && session.nickname) || msg.author || 'guest';
        const message = String(msg.message || '');
        if (!message) return;
        broadcast({
          type: 'text',
          message,
          author,
          client: 'LynxWave',
          prefix: msg.prefix || 'Default',
          server: msg.server || 'my-server',
        });
        break;
      }
      case 'presence':
        break;
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log('disconnected, total:', clients.size);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('IRC server listening on port', PORT);
});
