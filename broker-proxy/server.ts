import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import * as amqp from 'amqplib';
import { createServer } from 'http';
import * as dotenv from 'dotenv';

dotenv.config();

// ─── Configuration ────────────────────────────────────────────────────────────

const PORT      = Number(process.env.PORT ?? 3001);
const AMQP_HOST = process.env.AMQP_HOST ?? 'b-a5095b9b-3c4d-4fe7-8df1-8031e8808618.mq.eu-west-3.on.aws';
const AMQP_PORT = Number(process.env.AMQP_PORT ?? 5671);  // AMQPs (SSL)

// ─── Serveur HTTP + WebSocket ─────────────────────────────────────────────────

const app    = express();
const server = createServer(app);
const wss    = new WebSocketServer({ server });

app.use(cors({ origin: '*' }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClientSession {
  ws:          WebSocket;
  conn:        amqp.ChannelModel | null;
  channel:     amqp.Channel | null;
  consumerTag: string | null;
}

// ─── WebSocket handlers ───────────────────────────────────────────────────────

wss.on('connection', (ws: WebSocket) => {
  const session: ClientSession = { ws, conn: null, channel: null, consumerTag: null };

  console.log('[WS] Client connecté');
  send(ws, { type: 'status', status: 'ws_ready', message: 'Proxy WebSocket prêt. En attente de connexion AMQP.' });

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      switch (msg.type) {
        case 'connect':
          await connectAmqp(session, msg.username, msg.password, msg.playerId);
          break;
        case 'disconnect':
          await disconnectAmqp(session);
          break;
      }
    } catch (e: any) {
      console.error('[WS] Erreur message:', e.message);
      send(ws, { type: 'error', message: e.message });
    }
  });

  ws.on('close', async () => {
    console.log('[WS] Client déconnecté');
    await disconnectAmqp(session);
  });

  ws.on('error', (err) => {
    console.error('[WS] Erreur socket:', err.message);
  });
});

// ─── AMQP ────────────────────────────────────────────────────────────────────

async function connectAmqp(
  session: ClientSession,
  username: string,
  password: string,
  playerId: string
): Promise<void> {
  // Déconnecter si déjà connecté
  if (session.conn) await disconnectAmqp(session);

  send(session.ws, {
    type: 'status', status: 'connecting',
    message: `Connexion AMQP en cours vers ${AMQP_HOST}:${AMQP_PORT}…`,
  });

  try {
    const conn = await amqp.connect({
      protocol: 'amqps',
      hostname: AMQP_HOST,
      port:     AMQP_PORT,
      username,
      password,
      vhost:    '/',
      // Ignorer les erreurs de certificat auto-signé si besoin
    });

    session.conn = conn;

    conn.on('error', (err) => {
      console.error('[AMQP] Erreur connexion:', err.message);
      send(session.ws, { type: 'error', message: `Erreur broker : ${err.message}` });
    });

    conn.on('close', () => {
      console.log('[AMQP] Connexion fermée');
      session.conn    = null;
      session.channel = null;
      send(session.ws, { type: 'status', status: 'disconnected', message: 'Connexion broker fermée.' });
    });

    const channel = await conn.createChannel();
    session.channel = channel;

    channel.on('error', (err) => {
      console.error('[AMQP] Erreur canal:', err.message);
      send(session.ws, { type: 'error', message: `Erreur canal : ${err.message}` });
    });

    const queue = `user.${playerId}`;

    // S'assurer que la file existe (passif = ne pas la créer si elle n'existe pas)
    try {
      await channel.checkQueue(queue);
    } catch {
      // La file n'existe peut-être pas encore — on continue
      console.warn(`[AMQP] File ${queue} introuvable, on tente quand même…`);
    }

    const { consumerTag } = await channel.consume(queue, (msg) => {
      if (!msg) return;

      const raw = msg.content.toString();
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = { text: raw };
      }

      send(session.ws, {
        type:      'message',
        timestamp: new Date().toISOString(),
        queue,
        data:      parsed,
        raw,
      });

      channel.ack(msg);
    }, { noAck: false });

    session.consumerTag = consumerTag;

    send(session.ws, {
      type:    'status',
      status:  'ready',
      message: `Connecté ✓ — écoute sur ${queue}`,
    });

    console.log(`[AMQP] Connecté en tant que ${username}, file : ${queue}`);
  } catch (e: any) {
    console.error('[AMQP] Échec connexion:', e.message);
    send(session.ws, {
      type:    'error',
      message: `Impossible de se connecter au broker : ${e.message}`,
    });
    session.conn    = null;
    session.channel = null;
  }
}

async function disconnectAmqp(session: ClientSession): Promise<void> {
  try {
    if (session.channel && session.consumerTag) {
      await session.channel.cancel(session.consumerTag).catch(() => {});
      session.consumerTag = null;
    }
    if (session.channel) {
      await session.channel.close().catch(() => {});
      session.channel = null;
    }
    if (session.conn) {
      await session.conn.close().catch(() => {});
      session.conn = null;
    }
  } catch { /* silencieux */ }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function send(ws: WebSocket, data: object): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

// ─── Démarrage ────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`\n🚀 Broker proxy 3026 démarré sur le port ${PORT}`);
  console.log(`   AMQP cible : ${AMQP_HOST}:${AMQP_PORT}`);
  console.log(`   Health     : http://localhost:${PORT}/health\n`);
});

