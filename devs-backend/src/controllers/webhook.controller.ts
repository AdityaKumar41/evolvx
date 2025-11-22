import { Request, Response } from 'express';
import { publishEvent, KAFKA_TOPICS } from '../lib/kafka';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { createHmac } from 'crypto';
import { config } from '../config';

export class WebhookController {
  /**
   * Handle GitHub webhooks
   */
  static async handleGitHubWebhook(req: Request, res: Response) {
    const signature = req.headers['x-hub-signature-256'] as string;
    const event = req.headers['x-github-event'] as string;

    // Verify webhook signature
    if (!WebhookController.verifySignature(req.body, signature)) {
      throw new AppError('Invalid webhook signature', 401);
    }

    // Log webhook
    await prisma.webhookLog.create({
      data: {
        source: 'github',
        event,
        payload: req.body,
        processed: false,
      },
    });

    // Handle different event types
    switch (event) {
      case 'push':
        await WebhookController.handlePushEvent(req.body);
        break;
      case 'pull_request':
        await WebhookController.handlePullRequestEvent(req.body);
        break;
      case 'check_run':
        await WebhookController.handleCheckRunEvent(req.body);
        break;
      default:
        console.log(`Unhandled GitHub event: ${event}`);
    }

    res.status(200).json({ message: 'Webhook received' });
  }

  /**
   * Verify GitHub webhook signature
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static verifySignature(payload: any, signature: string): boolean {
    if (!signature) return false;

    const hmac = createHmac('sha256', config.github.webhookSecret || '');
    const digest = 'sha256=' + hmac.update(JSON.stringify(payload)).digest('hex');

    return signature === digest;
  }

  /**
   * Handle push events (commits)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static async handlePushEvent(payload: any) {
    const { commits, repository, ref, pusher: _pusher } = payload; // eslint-disable-line @typescript-eslint/no-unused-vars

    for (const commit of commits) {
      // Find associated sub-milestone by commit or PR
      const contribution = await prisma.contribution.findFirst({
        where: {
          commitHash: commit.id,
        },
      });

      if (contribution) {
        // Publish commit event to Kafka for verification
        await publishEvent(KAFKA_TOPICS.GITHUB_COMMIT, {
          commitHash: commit.id,
          contributionId: contribution.id,
          repository: repository.full_name,
          branch: ref,
          message: commit.message,
          author: commit.author,
          timestamp: commit.timestamp,
        });
      } else {
        // Try to match by PR link
        const prLink = await prisma.prLink.findFirst({
          where: {
            repositoryUrl: repository.html_url,
          },
        });

        if (prLink) {
          // Create contribution record
          const newContribution = await prisma.contribution.create({
            data: {
              subMilestoneId: prLink.subMilestoneId,
              contributorId: prLink.userId,
              commitHash: commit.id,
              amountPaid: 0, // Will be set after verification
              status: 'PENDING',
            },
          });

          // Publish commit event
          await publishEvent(KAFKA_TOPICS.GITHUB_COMMIT, {
            commitHash: commit.id,
            contributionId: newContribution.id,
            repository: repository.full_name,
            branch: ref,
            message: commit.message,
            author: commit.author,
            timestamp: commit.timestamp,
          });
        }
      }
    }
  }

  /**
   * Handle pull request events
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static async handlePullRequestEvent(payload: any) {
    const { action, pull_request, repository } = payload;

    if (action === 'opened' || action === 'synchronize') {
      // Find PR link
      const prLink = await prisma.prLink.findFirst({
        where: {
          prNumber: pull_request.number,
          repositoryUrl: repository.html_url,
        },
      });

      if (prLink) {
        // Update sub-milestone status
        await prisma.subMilestone.update({
          where: { id: prLink.subMilestoneId },
          data: {
            status: 'IN_PROGRESS',
          },
        });
      }
    }

    if (action === 'closed' && pull_request.merged) {
      // PR merged, mark sub-milestone as completed
      const prLink = await prisma.prLink.findFirst({
        where: {
          prNumber: pull_request.number,
          repositoryUrl: repository.html_url,
        },
      });

      if (prLink) {
        await prisma.subMilestone.update({
          where: { id: prLink.subMilestoneId },
          data: {
            status: 'COMPLETED',
          },
        });
      }
    }
  }

  /**
   * Handle check run events
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static async handleCheckRunEvent(payload: any) {
    const { check_run, repository } = payload;

    // Log check run results
    console.log(`Check run ${check_run.name} completed with status: ${check_run.conclusion}`);

    // Use check run results to update PR verification status
    if (check_run.pull_requests && check_run.pull_requests.length > 0) {
      for (const pr of check_run.pull_requests) {
        // Find PRSubmission by PR number and repository
        const prSubmission = await prisma.pRSubmission.findFirst({
          where: {
            prNumber: pr.number,
            prUrl: { contains: repository.name }, // Match by repo name in URL
          },
        });

        if (prSubmission) {
          // Update status based on check run conclusion
          const allChecksPassed = check_run.conclusion === 'success';
          const hasFailures =
            check_run.conclusion === 'failure' || check_run.conclusion === 'cancelled';

          // Store check run results in metadata
          const currentMetadata = (prSubmission.aiReviewFeedback as any) || {};
          const checkResults = currentMetadata.checkRuns || [];
          checkResults.push({
            name: check_run.name,
            conclusion: check_run.conclusion,
            completedAt: check_run.completed_at,
            htmlUrl: check_run.html_url,
          });

          await prisma.pRSubmission.update({
            where: { id: prSubmission.id },
            data: {
              aiReviewFeedback: {
                ...currentMetadata,
                checkRuns: checkResults,
                allChecksPassed,
              },
              // Update status if checks failed and currently in AI review
              ...(hasFailures &&
                prSubmission.status === 'AI_REVIEW' && {
                  status: 'PENDING',
                }),
            },
          });

          console.log(
            `Updated PR submission ${prSubmission.id} with check run result: ${check_run.conclusion}`
          );
        }
      }
    }
  }
}
