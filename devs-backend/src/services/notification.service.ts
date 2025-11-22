import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { NotificationType } from '@prisma/client';
import { publishEvent, KAFKA_TOPICS } from '../lib/kafka';
import { emailService } from './email.service';

export interface CreateNotificationData {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export class NotificationService {
  /**
   * Create a notification
   */
  async createNotification(data: CreateNotificationData) {
    try {
      const notification = await prisma.notification.create({
        data: {
          userId: data.userId,
          type: data.type,
          title: data.title,
          message: data.message,
          metadata: data.metadata || {},
          read: false,
        },
      });

      // Publish to Kafka for real-time delivery
      await publishEvent(KAFKA_TOPICS.NOTIFICATION_TRIGGERED, {
        notificationId: notification.id,
        userId: data.userId,
        type: data.type,
        title: data.title,
        message: data.message,
        createdAt: notification.createdAt,
      });

      logger.info(`Notification created: ${notification.id} for user ${data.userId}`);
      return notification;
    } catch (error) {
      logger.error('Error creating notification:', error);
      throw new Error('Failed to create notification');
    }
  }

  /**
   * Create multiple notifications (batch)
   */
  async createBulkNotifications(notifications: CreateNotificationData[]) {
    try {
      const created = await prisma.notification.createMany({
        data: notifications.map((n) => ({
          userId: n.userId,
          type: n.type,
          title: n.title,
          message: n.message,
          metadata: n.metadata || {},
          read: false,
        })),
      });

      // Publish batch event
      for (const notif of notifications) {
        await publishEvent(KAFKA_TOPICS.NOTIFICATION_TRIGGERED, {
          userId: notif.userId,
          type: notif.type,
          title: notif.title,
          message: notif.message,
        });
      }

      logger.info(`Bulk notifications created: ${created.count} notifications`);
      return created;
    } catch (error) {
      logger.error('Error creating bulk notifications:', error);
      throw new Error('Failed to create bulk notifications');
    }
  }

  /**
   * Get user notifications
   */
  async getUserNotifications(
    userId: string,
    options?: {
      unreadOnly?: boolean;
      limit?: number;
      offset?: number;
      type?: NotificationType;
    }
  ) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: any = { userId };

      if (options?.unreadOnly) {
        where.read = false;
      }

      if (options?.type) {
        where.type = options.type;
      }

      const [notifications, total, unreadCount] = await prisma.$transaction([
        prisma.notification.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: options?.limit || 50,
          skip: options?.offset || 0,
        }),
        prisma.notification.count({ where }),
        prisma.notification.count({
          where: {
            userId,
            read: false,
          },
        }),
      ]);

      return {
        notifications,
        total,
        unreadCount,
        limit: options?.limit || 50,
        offset: options?.offset || 0,
      };
    } catch (error) {
      logger.error('Error fetching notifications:', error);
      throw new Error('Failed to fetch notifications');
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId: string) {
    try {
      const notification = await prisma.notification.findUnique({
        where: { id: notificationId },
      });

      if (!notification) {
        throw new Error('Notification not found');
      }

      if (notification.userId !== userId) {
        throw new Error('Access denied');
      }

      const updated = await prisma.notification.update({
        where: { id: notificationId },
        data: { read: true },
      });

      logger.info(`Notification ${notificationId} marked as read by user ${userId}`);
      return updated;
    } catch (error) {
      logger.error('Error marking notification as read:', error);
      throw error;
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string) {
    try {
      const result = await prisma.notification.updateMany({
        where: {
          userId: userId,
          read: false,
        },
        data: {
          read: true,
        },
      });

      logger.info(`All notifications marked as read for user ${userId}, count: ${result.count}`);
      return result;
    } catch (error) {
      logger.error('Error marking all notifications as read:', error);
      throw new Error('Failed to mark all as read');
    }
  }

  /**
   * Delete notification
   */
  async deleteNotification(notificationId: string, userId: string) {
    try {
      const notification = await prisma.notification.findUnique({
        where: { id: notificationId },
      });

      if (!notification) {
        throw new Error('Notification not found');
      }

      if (notification.userId !== userId) {
        throw new Error('Access denied');
      }

      await prisma.notification.delete({
        where: { id: notificationId },
      });

      logger.info(`Notification ${notificationId} deleted by user ${userId}`);
      return { success: true };
    } catch (error) {
      logger.error('Error deleting notification:', error);
      throw error;
    }
  }

  /**
   * Get unread count for user
   */
  async getUnreadCount(userId: string): Promise<number> {
    try {
      const count = await prisma.notification.count({
        where: {
          userId: userId,
          read: false,
        },
      });

      return count;
    } catch (error) {
      logger.error('Error getting unread count:', error);
      return 0;
    }
  }

  // ===== Notification Creators (Helper Methods) =====

  /**
   * Send invite notification
   */
  async sendInviteNotification(
    userId: string,
    data: {
      inviterName: string;
      orgName?: string;
      projectName?: string;
    }
  ) {
    const title = data.orgName
      ? `Invited to ${data.orgName}`
      : `Invited to project: ${data.projectName}`;

    const message = `${data.inviterName} has invited you to join ${data.orgName || data.projectName}`;

    // Get user email
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    // Send email notification
    if (user?.email) {
      try {
        const inviteUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/invites`;
        await emailService.sendOrganizationInvite({
          toEmail: user.email,
          fromUserName: data.inviterName,
          fromUserEmail: 'noreply@devsponsor.dev',
          organizationName: data.orgName || data.projectName || 'Organization',
          inviterName: data.inviterName,
          inviteLink: inviteUrl,
        });
      } catch (error) {
        logger.error('Failed to send invite email:', error);
        // Don't fail the whole operation if email fails
      }
    }

    return this.createNotification({
      userId,
      type: NotificationType.INVITE,
      title,
      message,
      metadata: data,
    });
  }

  /**
   * Send PR linked notification
   */
  async sendPRLinkedNotification(
    userId: string,
    data: {
      projectName: string;
      taskDescription: string;
      prUrl: string;
    }
  ) {
    return this.createNotification({
      userId,
      type: NotificationType.PR_LINKED,
      title: 'PR Linked Successfully',
      message: `Your PR for "${data.taskDescription}" in ${data.projectName} has been linked and is under verification`,
      metadata: data,
    });
  }

  /**
   * Send payment notification
   */
  async sendPaymentNotification(
    userId: string,
    data: {
      amount: number;
      token: string;
      projectName: string;
      taskDescription: string;
      txHash?: string;
    }
  ) {
    return this.createNotification({
      userId,
      type: NotificationType.PAYMENT_SENT,
      title: 'Payment Released!',
      message: `You've received ${data.amount} ${data.token} for completing "${data.taskDescription}" in ${data.projectName}`,
      metadata: data,
    });
  }

  /**
   * Send verification success notification
   */
  async sendVerificationSuccessNotification(
    userId: string,
    data: {
      projectName: string;
      taskDescription: string;
    }
  ) {
    return this.createNotification({
      userId,
      type: NotificationType.VERIFICATION_SUCCESS,
      title: 'Verification Passed!',
      message: `Your submission for "${data.taskDescription}" in ${data.projectName} has been verified successfully`,
      metadata: data,
    });
  }

  /**
   * Send task claimed notification (to sponsor)
   */
  async sendTaskClaimedNotification(
    userId: string,
    data: {
      contributorName: string;
      projectName: string;
      taskDescription: string;
    }
  ) {
    return this.createNotification({
      userId,
      type: NotificationType.TASK_CLAIMED,
      title: 'Task Claimed',
      message: `${data.contributorName} has claimed the task "${data.taskDescription}" in ${data.projectName}`,
      metadata: data,
    });
  }

  /**
   * Send AI milestone ready notification
   */
  async sendAIMilestoneReadyNotification(
    userId: string,
    data: {
      projectName: string;
      milestonesCount: number;
    }
  ) {
    return this.createNotification({
      userId,
      type: NotificationType.AI_MILESTONE_READY,
      title: 'AI Milestones Generated',
      message: `AI has generated ${data.milestonesCount} milestones for your project ${data.projectName}. Review and approve them to proceed.`,
      metadata: data,
    });
  }

  /**
   * Send repo access granted notification
   */
  async sendRepoAccessGrantedNotification(
    userId: string,
    data: {
      projectName: string;
      repoUrl: string;
    }
  ) {
    return this.createNotification({
      userId,
      type: NotificationType.REPO_ACCESS_GRANTED,
      title: 'Repository Access Granted',
      message: `You now have access to the repository for ${data.projectName}`,
      metadata: data,
    });
  }

  /**
   * Send project funded notification
   */
  async sendProjectFundedNotification(
    userId: string,
    data: {
      projectName: string;
      amount: number;
      token: string;
    }
  ) {
    return this.createNotification({
      userId,
      type: NotificationType.PROJECT_FUNDED,
      title: 'Project Funded Successfully',
      message: `${data.projectName} has been funded with ${data.amount} ${data.token}. Contributors can now claim tasks!`,
      metadata: data,
    });
  }
}

export const notificationService = new NotificationService();
