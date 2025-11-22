import express, { type Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import passport from 'passport';
import http from 'http';
import { config } from './config';
import { logger } from './utils/logger';
import { initQdrantCollections } from './lib/qdrant';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { initializeWebSocket, getWebSocketServer } from './lib/websocket';

// Routes
import authRoutes from './routes/auth.routes';
import organizationRoutes from './routes/organization.routes';
import projectRoutes from './routes/project.routes';
import milestoneRoutes from './routes/milestone.routes';
import aiMilestoneRoutes from './routes/ai-milestone.routes';
import submilestoneRoutes from './routes/submilestone.routes';
import contributionRoutes from './routes/contribution.routes';
import webhookRoutes from './routes/webhook.routes';
import healthRoutes from './routes/health.routes';
import fundingRoutes from './routes/funding.routes';
import paymentRoutes from './routes/payment.routes';
import chatRoutes from './routes/chat.routes';
import documentRoutes from './routes/document.routes';
import billingRoutes from './routes/billing.routes';
import aiRoutes from './routes/ai.routes';
import githubRoutes from './routes/github.routes';
import testRoutes from './routes/test.routes';

// Inngest
import { serve } from 'inngest/express';
import { inngest } from './lib/inngest';
import { functions } from './inngest/functions';

const app: Express = express();

// Middleware
app.use(helmet());
app.use(
  cors({
    origin: config.server.frontendUrl,
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// Session configuration
app.use(
  session({
    secret: config.auth.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: config.server.nodeEnv === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// Inngest serve endpoint (must be registered before other routes)
app.use(
  '/api/inngest',
  serve({
    client: inngest,
    functions: functions,
  })
);

// Routes
app.use('/health', healthRoutes);
app.use('/auth', authRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/milestones', milestoneRoutes);
app.use('/api/ai/milestones', aiMilestoneRoutes);
app.use('/api/submilestones', submilestoneRoutes);
app.use('/api/contributions', contributionRoutes);
app.use('/api/funding', fundingRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/github', githubRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/test', testRoutes);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler (must be last)
app.use(errorHandler);

// Create HTTP server for Socket.io
const httpServer = http.createServer(app);

// Graceful shutdown
const gracefulShutdown = async () => {
  logger.info('Shutting down gracefully...');

  // Shutdown WebSocket server
  const ws = getWebSocketServer();
  if (ws) {
    await ws.shutdown();
  }

  // Close HTTP server
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
const startServer = async () => {
  try {
    // Initialize external services
    await initQdrantCollections();

    // Initialize WebSocket server
    initializeWebSocket(httpServer);
    logger.info('✅ WebSocket server initialized');

    // Start email consumer worker
    import('./workers/email-consumer')
      .then(({ startEmailConsumer }) => {
        startEmailConsumer().catch((error) => {
          logger.error('❌ Failed to start email consumer:', error);
        });
      })
      .catch((error) => {
        logger.error('❌ Failed to import email consumer:', error);
      });

    // Start repo analysis consumer worker
    import('./workers/repo-analysis-consumer')
      .then(({ startRepoAnalysisConsumer }) => {
        startRepoAnalysisConsumer().catch((error) => {
          logger.error('❌ Failed to start repo analysis consumer:', error);
        });
      })
      .catch((error) => {
        logger.error('❌ Failed to import repo analysis consumer:', error);
      });

    httpServer.listen(config.server.port, () => {
      logger.info(`🚀 Server running on port ${config.server.port}`);
      logger.info(`📝 Environment: ${config.server.nodeEnv}`);
      logger.info(`🔗 API URL: ${config.server.apiBaseUrl}`);
      logger.info(`🔌 WebSocket server ready`);
      logger.info(`📊 Repo analysis consumer ready`);
    });
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  startServer();
}

export default app;
