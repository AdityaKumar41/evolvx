import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { qdrant } from '../lib/qdrant';

const router: Router = Router();

// Health check endpoint
router.get('/', async (_req, res) => {
  try {
    // Check database
    await prisma.$queryRaw`SELECT 1`;

    // Check Redis
    await redis.ping();

    // Check Qdrant
    await qdrant.getCollections();

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'up',
        redis: 'up',
        qdrant: 'up',
      },
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Detailed health check
router.get('/detail', async (_req, res) => {
  const checks = {
    database: false,
    redis: false,
    qdrant: false,
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch (error) {
    // Database check failed
  }

  try {
    await redis.ping();
    checks.redis = true;
  } catch (error) {
    // Redis check failed
  }

  try {
    await qdrant.getCollections();
    checks.qdrant = true;
  } catch (error) {
    // Qdrant check failed
  }

  const allHealthy = Object.values(checks).every((check) => check === true);

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
  });
});

export default router;
