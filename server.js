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
    try { msg = decode(data); } catch (e) { console.log('decode err'); return; }
    if (msg.api_key !== 'LynxWave_secret_key_1488') { console.log('bad api_key'); return; }
    console.log('received:', msg.type, JSON.stringify(msg).slice(0, 200));

    switch (msg.type) {
      case 'register':
      case 'login': {
        const username = String(msg.username || '').trim();
        if (!username) { console.log('empty username'); return; }
        clients.set(ws, { username, nickname: username });
        const reply = {
          type: 'login_success',
          message: msg.type === 'register' ? 'Регистрация успешна' : 'Вход выполнен успешно',
          user: {
            username,
            nickname: username,
            isModerator: false,
            isAdmin: false,
          },
        };
        ws.send(encode(reply));
        console.log('sent login_success for', username);
        break;
      }
      case 'text': {
        const session = clients.get(ws);
        const author = (session && session.nickname) || msg.author || 'guest';
        const message = String(msg.message || '');
        if (!message) return;
        const out = {
          type: 'text',
          message,
          author,
          client: 'LynxWave',
          prefix: msg.prefix || 'Default',
          server: 'my-server',
        };
        broadcast(out);
        console.log('broadcasted text from', author, '->', message.slice(0, 60));
        break;
      }
      case 'presence':
        // heartbeat — игнорируем тихо
        break;
      default:
        console.log('unhandled type:', msg.type);
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
