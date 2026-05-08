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
  ws.isAlive = true;
  console.log('connected, total:', clients.size);

  ws.on('pong', () => { ws.isAlive = true; });

  ws.send(encode({
    type: 'version_info',
    serverVersion: 2,
    minClientVersion: 1,
  }));

  ws.on('message', data => {
    let msg;
    try { msg = decode(data); } catch (e) { console.log('decode err:', e.message); return; }
    if (msg.api_key !== 'LynxWave_secret_key_1488') return;

    let type = msg.type;
    if (!type && msg.message) type = 'text';

    switch (type) {
      case 'register':
      case 'login': {
        const username = String(msg.username || '').trim();
        if (!username) return;
        clients.set(ws, { username, nickname: username });
        ws.send(encode({
          type: 'login_success',
          message: type === 'register' ? 'Регистрация успешна' : 'Вход выполнен успешно',
          user: {
            username,
            nickname: username,
            isModerator: false,
            isAdmin: false,
          },
        }));
        console.log('login:', username);
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
        console.log('msg:', author, '->', message.slice(0, 60));
        break;
      }
      case 'presence':
        break;
      default:
        console.log('unhandled type:', type);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log('disconnected, total:', clients.size);
  });

  ws.on('error', err => {
    console.log('ws error:', err.message);
  });
});

// Heartbeat: каждые 30 секунд пингуем всех клиентов
const heartbeat = setInterval(() => {
  for (const ws of clients.keys()) {
    if (ws.isAlive === false) {
      console.log('terminating dead connection');
      clients.delete(ws);
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30_000);

wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, '0.0.0.0', () => {
  console.log('IRC server listening on port', PORT);
});
