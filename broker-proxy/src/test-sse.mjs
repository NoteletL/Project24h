/**
 * Test d'intégration SSE — simule un message AMQP via /mock-event
 * et vérifie qu'il est bien retransmis à un client SSE.
 *
 * Usage : node src/test-sse.mjs  (le proxy doit tourner sur le port 4000)
 */

const BASE = 'http://localhost:4000';

async function run() {
  console.log('[Test] Connexion SSE…');

  const received = await new Promise((resolve, reject) => {
    const ctrl    = new AbortController();
    const timeout = setTimeout(() => { ctrl.abort(); reject(new Error('Timeout: aucun événement reçu en 5 s')); }, 5_000);

    // Ouvre le flux SSE
    fetch(`${BASE}/events`, { signal: ctrl.signal })
      .then(async res => {
        const reader = res.body.getReader();
        const dec    = new TextDecoder();
        let buffer   = '';

        // Envoie le mock après 200 ms (temps de connexion SSE)
        setTimeout(() => {
          fetch(`${BASE}/mock-event`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ type: 'market.offer.created', payload: { id: 'test-123', resourceType: 'BOISIUM', quantityIn: 10, pricePerResource: 3 } }),
          }).then(() => console.log('[Test] Mock event envoyé'));
        }, 200);

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += dec.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'market.offer.created') {
                clearTimeout(timeout);
                ctrl.abort();
                resolve(data);
                return;
              }
            }
          }
        }
      })
      .catch(err => {
        if (err.name !== 'AbortError') reject(err);
      });
  });

  console.log('[Test] ✅ Événement reçu via SSE :', JSON.stringify(received, null, 2));
  process.exit(0);
}

run().catch(err => {
  console.error('[Test] ❌', err.message);
  process.exit(1);
});

