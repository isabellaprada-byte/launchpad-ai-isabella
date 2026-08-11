import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import { censusRoutes } from './routes/census';

const app = Fastify({ logger: true });

async function start() {
  await app.register(helmet, {
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  await app.register(cors, {
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    methods: ['GET', 'POST'],
  });

  await app.register(rateLimit, {
    max: 20,
    timeWindow: '1 minute',
  });

  await app.register(multipart, {
    limits: { fileSize: 25 * 1024 * 1024 },
  });

  await app.register(censusRoutes);

  app.get('/health', async () => ({ status: 'ok' }));

  const port = parseInt(process.env.PORT ?? '4000');
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`Backend running on port ${port}`);
}

start().catch(err => {
  console.error(err);
  process.exit(1);
});
