import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import amqp, { Connection, Channel, ChannelModel } from 'amqplib';

// ── Configuration ──────────────────────────────────────────────────────────────
const {
  AMQP_HOST = 'localhost',
  AMQP_PORT = '5671',
  AMQP_USER = 'guest',
  AMQP_PASS = 'guest',
  TEAM_ID   = 'team',
  PORT      = '4000',
} = process.env;

const AMQP_URL   = `amqps://${AMQP_USER}:${AMQP_PASS}@${AMQP_HOST}:${AMQP_PORT}`;
const QUEUE_NAME = `user.${TEAM_ID}`;
const HTTP_PORT  = parseInt(PORT, 10);

// ── Clients SSE et WS ──────────────────────────────────────────────────────────
const sseClients = new Set<Response>();
const wsClients  = new Set<WebSocket>();

function broadcast(payload: unknown): void {
  const json = JSON.stringify(payload);
  // SSE
  for (const res of sseClients) {
    try { res.write(`data: ${json}\n\n`); }
    catch { sseClients.delete(res); }
  }
  // WebSocket
  for (const ws of wsClients) {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(json); }
      catch { wsClients.delete(ws); }
    }
  }
}

// ── Express ────────────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);

app.use(cors({ origin: '*' }));
app.use(express.json());

/** Santé du proxy */
app.get('/health', (_req, res) => {
  res.json({
    status:      'ok',
    amqp:        amqpConnected,
    sseClients:  sseClients.size,
    wsClients:   wsClients.size,
    queue:       QUEUE_NAME,
    timestamp:   new Date().toISOString(),
  });
});

/** Flux SSE — chaque client Angular se connecte ici */
app.get('/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Heartbeat toutes les 15 s pour maintenir la connexion alive
  const hb = setInterval(() => {
    try { res.write(': heartbeat\n\n'); }
    catch { clearInterval(hb); }
  }, 15_000);

  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`);
  sseClients.add(res);

  req.on('close', () => {
    clearInterval(hb);
    sseClients.delete(res);
  });
});

/** Endpoint de test — injecte un faux message AMQP (utile sans credentials) */
app.post('/mock-event', (req: Request, res: Response) => {
  const payload = req.body ?? { type: 'market.offer.created', payload: req.body };
  broadcast(payload);
  res.json({ ok: true, broadcast: payload });
});

// ── WebSocket ──────────────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => {
  wsClients.add(ws);
  ws.send(JSON.stringify({ type: 'connected', timestamp: Date.now() }));
  ws.on('close', () => wsClients.delete(ws));
  ws.on('error', () => wsClients.delete(ws));
});

// ── AMQP (avec reconnexion exponentielle) ──────────────────────────────────────
let amqpConnected = false;
let retryCount    = 0;

async function connectAMQP(): Promise<void> {
  try {
    console.log(`[AMQP] Connexion à ${AMQP_HOST}:${AMQP_PORT} — queue: ${QUEUE_NAME}`);
    const conn: ChannelModel = await amqp.connect(AMQP_URL, {
      // Options TLS : si le certificat du serveur est auto-signé, activer ci-dessous
      // rejectUnauthorized: false,
    } as Parameters<typeof amqp.connect>[1]);

    const ch: Channel = await conn.createChannel();
    await ch.assertQueue(QUEUE_NAME, { durable: true });
    ch.prefetch(10);

    amqpConnected = true;
    retryCount    = 0;
    console.log(`[AMQP] ✅ Connecté — écoute sur ${QUEUE_NAME}`);

    ch.consume(QUEUE_NAME, (msg) => {
      if (!msg) return;
      try {
        const raw     = msg.content.toString('utf-8');
        const payload = JSON.parse(raw) as unknown;
        console.log(`[AMQP] Message reçu: ${raw.slice(0, 120)}`);
        broadcast(payload);
      } catch (e) {
        console.warn('[AMQP] Message non-JSON ignoré:', msg.content.toString().slice(0, 80));
      }
      ch.ack(msg);
    }, { noAck: false });

    conn.on('error',  (err) => { console.error('[AMQP] Erreur connexion:', err.message); amqpConnected = false; scheduleRetry(); });
    conn.on('close',  ()    => { console.warn('[AMQP] Connexion fermée');                amqpConnected = false; scheduleRetry(); });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[AMQP] Échec connexion: ${msg}`);
    amqpConnected = false;
    scheduleRetry();
  }
}

function scheduleRetry(): void {
  const delay = Math.min(1_000 * Math.pow(2, retryCount), 60_000);
  retryCount++;
  console.log(`[AMQP] Nouvelle tentative dans ${delay / 1000}s (essai #${retryCount})`);
  setTimeout(connectAMQP, delay);
}

// ── Démarrage ──────────────────────────────────────────────────────────────────
server.listen(HTTP_PORT, () => {
  console.log(`[Proxy] 🚀 Démarré sur http://localhost:${HTTP_PORT}`);
  console.log(`[Proxy]    SSE   → GET  http://localhost:${HTTP_PORT}/events`);
  console.log(`[Proxy]    WS    → ws://localhost:${HTTP_PORT}/ws`);
  console.log(`[Proxy]    Mock  → POST http://localhost:${HTTP_PORT}/mock-event`);
  console.log(`[Proxy]    Health→ GET  http://localhost:${HTTP_PORT}/health`);
  connectAMQP();
});

