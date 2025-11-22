import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { publishEvent, KAFKA_TOPICS } from '../lib/kafka';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import crypto from 'crypto';
import { config } from '../config';

const router: Router = Router();

// GitHub webhook handler
router.post(
  '/github',
  asyncHandler(async (req: Request, res: Response) => {
    const signature = req.headers['x-hub-signature-256'] as string;
    const event = req.headers['x-github-event'] as string;

    // Verify signature if webhook secret is configured
    if (config.github.webhookSecret) {
      const hmac = crypto.createHmac('sha256', config.github.webhookSecret);
      const digest = 'sha256=' + hmac.update(JSON.stringify(req.body)).digest('hex');

      if (signature !== digest) {
        logger.warn('Invalid GitHub webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    logger.info(`Received GitHub webhook: ${event}`, {
      event,
      action: req.body.action,
    });

    // Log webhook
    await prisma.webhookLog.create({
      data: {
        source: 'github',
        event: event,
        payload: req.body,
      },
    });

    // Handle installation events
    if (event === 'installation') {
      const { action, installation } = req.body;
      logger.info(`GitHub App installation ${action}:`, {
        installationId: installation.id,
        account: installation.account.login,
      });

      if (action === 'deleted') {
        // Mark installation as inactive
        await prisma.gitHubInstallation.updateMany({
          where: { installationId: installation.id.toString() },
          data: {
            isActive: false,
            suspendedAt: new Date(),
          },
        });
        logger.info(`Marked installation ${installation.id} as inactive`);
      }
    }

    // Handle installation repositories events
    if (event === 'installation_repositories') {
      const { action, installation, repositories_added, repositories_removed } = req.body;
      logger.info(`GitHub App installation repositories ${action}:`, {
        installationId: installation.id,
        added: repositories_added?.length || 0,
        removed: repositories_removed?.length || 0,
      });
    }

    // Handle push events (commits)
    if (event === 'push') {
      const { commits, repository, pusher } = req.body;

      for (const commit of commits) {
        await publishEvent(KAFKA_TOPICS.GITHUB_COMMIT, {
          commitHash: commit.id,
          message: commit.message,
          author: commit.author,
          pusher,
          repository: {
            id: repository.id,
            name: repository.full_name,
            url: repository.html_url,
          },
          timestamp: commit.timestamp,
        });

        logger.info(`Published GitHub commit event: ${commit.id}`);
      }
    }

    // Handle pull request events
    if (event === 'pull_request') {
      const { action, pull_request } = req.body;

      if (action === 'opened' || action === 'synchronize' || action === 'reopened') {
        logger.info(`PR ${action}: ${pull_request.html_url}`);

        // You can publish a PR event here if needed
      }
    }

    return res.json({ received: true });
  })
);

export default router;
