import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { InviteStatus, GitHubAccessState, OrganizationRole, RepoType } from '@prisma/client';
import { githubService } from './github.service';
import { notificationService } from './notification.service';
import { publishEvent, KAFKA_TOPICS } from '../lib/kafka';

export interface CreateProjectInviteData {
  projectId: string;
  fromUserId: string;
  toUserId?: string;
  email?: string;
  githubUsername?: string;
  role: OrganizationRole;
  message?: string;
}

export class InviteService {
  /**
   * Invite user to project
   */
  async inviteToProject(data: CreateProjectInviteData) {
    try {
      // Get project details
      const project = await prisma.project.findUnique({
        where: { id: data.projectId },
        select: {
          id: true,
          title: true,
          repoType: true,
          repositoryUrl: true,
          sponsorId: true,
          orgId: true,
        },
      });

      if (!project) {
        throw new Error('Project not found');
      }

      // Check if inviter has permission
      const hasPermission =
        project.sponsorId === data.fromUserId ||
        (project.orgId &&
          (await prisma.organizationMember.findFirst({
            where: {
              organizationId: project.orgId,
              userId: data.fromUserId,
              role: {
                in: [OrganizationRole.OWNER, OrganizationRole.MAINTAINER],
              },
            },
          })));

      if (!hasPermission) {
        throw new Error('Insufficient permissions to invite');
      }

      // Find or resolve user
      let toUserId = data.toUserId;
      if (!toUserId && data.githubUsername) {
        const user = await prisma.user.findFirst({
          where: { githubUsername: data.githubUsername },
        });
        toUserId = user?.id;
      }

      // Check if invite already exists
      const existingInvite = await prisma.projectInvite.findFirst({
        where: {
          projectId: data.projectId,
          OR: [
            { toUserId: toUserId },
            { email: data.email },
            { githubUsername: data.githubUsername },
          ],
          platformInviteStatus: InviteStatus.PENDING,
        },
      });

      if (existingInvite) {
        throw new Error('Invite already sent to this user');
      }

      // Create invite
      const invite = await prisma.projectInvite.create({
        data: {
          projectId: data.projectId,
          fromUserId: data.fromUserId,
          toUserId: toUserId,
          email: data.email,
          githubUsername: data.githubUsername,
          role: data.role,
          message: data.message,
          platformInviteStatus: InviteStatus.PENDING,
          githubInviteStatus: InviteStatus.PENDING,
          expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
        },
        include: {
          project: {
            select: {
              id: true,
              title: true,
              repoType: true,
            },
          },
          fromUser: {
            select: {
              id: true,
              githubUsername: true,
              avatarUrl: true,
            },
          },
        },
      });

      // Send notification if user exists
      if (toUserId) {
        await notificationService.sendInviteNotification(toUserId, {
          inviterName: invite.fromUser.githubUsername,
          projectName: invite.project.title,
        });
      }

      logger.info(`Project invite created: ${invite.id} for project ${data.projectId}`);
      return invite;
    } catch (error) {
      logger.error('Error creating project invite:', error);
      throw error;
    }
  }

  /**
   * Accept project invite
   */
  async acceptProjectInvite(inviteId: string, userId: string) {
    try {
      const invite = await prisma.projectInvite.findUnique({
        where: { id: inviteId },
        include: {
          project: {
            select: {
              id: true,
              title: true,
              repoType: true,
              repositoryUrl: true,
            },
          },
        },
      });

      if (!invite) {
        throw new Error('Invite not found');
      }

      if (invite.toUserId !== userId) {
        throw new Error('This invite is not for you');
      }

      if (invite.platformInviteStatus !== InviteStatus.PENDING) {
        throw new Error('Invite is no longer valid');
      }

      if (new Date() > invite.expiresAt) {
        await prisma.projectInvite.update({
          where: { id: inviteId },
          data: { platformInviteStatus: InviteStatus.EXPIRED },
        });
        throw new Error('Invite has expired');
      }

      // Update invite status
      const updated = await prisma.projectInvite.update({
        where: { id: inviteId },
        data: {
          platformInviteStatus: InviteStatus.ACCEPTED,
        },
      });

      // For private repos, initiate GitHub collaborator invite
      if (invite.project.repoType === RepoType.PRIVATE && invite.project.repositoryUrl) {
        await this.initiateGitHubAccess(invite.project.id, userId, invite.project.repositoryUrl);
      }

      logger.info(`User ${userId} accepted project invite ${inviteId}`);
      return updated;
    } catch (error) {
      logger.error('Error accepting project invite:', error);
      throw error;
    }
  }

  /**
   * Decline project invite
   */
  async declineProjectInvite(inviteId: string, userId: string) {
    try {
      const invite = await prisma.projectInvite.findUnique({
        where: { id: inviteId },
      });

      if (!invite) {
        throw new Error('Invite not found');
      }

      if (invite.toUserId !== userId) {
        throw new Error('This invite is not for you');
      }

      await prisma.projectInvite.update({
        where: { id: inviteId },
        data: {
          platformInviteStatus: InviteStatus.DECLINED,
        },
      });

      logger.info(`User ${userId} declined project invite ${inviteId}`);
      return { success: true };
    } catch (error) {
      logger.error('Error declining project invite:', error);
      throw error;
    }
  }

  /**
   * Initiate GitHub repository access (for private repos)
   */
  async initiateGitHubAccess(projectId: string, userId: string, repositoryUrl: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { githubUsername: true },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Create or update GitHub repo access record
      const existingAccess = await prisma.gitHubRepoAccess.findFirst({
        where: {
          userId,
          projectId,
        },
      });

      if (existingAccess && existingAccess.accessState === GitHubAccessState.ACCESS_GRANTED) {
        logger.info(`User ${userId} already has access to project ${projectId}`);
        return existingAccess;
      }

      // Add GitHub collaborator via GitHub App
      try {
        const inviteResult = await githubService.addCollaborator(
          repositoryUrl,
          user.githubUsername
        );

        const repoAccess = await prisma.gitHubRepoAccess.upsert({
          where: {
            userId_projectId: {
              userId,
              projectId,
            },
          },
          create: {
            userId,
            projectId,
            accessState: GitHubAccessState.INVITE_SENT,
            githubInvitationId: inviteResult.invitationId,
            lastSyncedAt: new Date(),
          },
          update: {
            accessState: GitHubAccessState.INVITE_SENT,
            githubInvitationId: inviteResult.invitationId,
            lastSyncedAt: new Date(),
          },
        });

        // Emit event for async processing
        await publishEvent(KAFKA_TOPICS.REPO_PRIVATE_INVITE_REQUIRED, {
          projectId,
          userId,
          githubUsername: user.githubUsername,
          repositoryUrl,
        });

        logger.info(
          `GitHub collaborator invite sent to ${user.githubUsername} for project ${projectId}`
        );
        return repoAccess;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (githubError: any) {
        logger.error('Error adding GitHub collaborator:', githubError);

        // Still create the record but mark it as failed
        await prisma.gitHubRepoAccess.upsert({
          where: {
            userId_projectId: {
              userId,
              projectId,
            },
          },
          create: {
            userId,
            projectId,
            accessState: GitHubAccessState.NONE,
          },
          update: {
            accessState: GitHubAccessState.NONE,
          },
        });

        throw new Error(
          'Failed to send GitHub collaborator invite. Please check repository permissions.'
        );
      }
    } catch (error) {
      logger.error('Error initiating GitHub access:', error);
      throw error;
    }
  }

  /**
   * Sync GitHub access status (called periodically or after webhook)
   */
  async syncGitHubAccessStatus(projectId: string, userId: string) {
    try {
      const repoAccess = await prisma.gitHubRepoAccess.findFirst({
        where: {
          userId,
          projectId,
        },
        include: {
          project: {
            select: {
              repositoryUrl: true,
            },
          },
          user: {
            select: {
              githubUsername: true,
            },
          },
        },
      });

      if (!repoAccess || !repoAccess.project.repositoryUrl) {
        return null;
      }

      // Check if user is now a collaborator
      const hasAccess = await githubService.checkCollaborator(
        repoAccess.project.repositoryUrl,
        repoAccess.user.githubUsername
      );

      if (hasAccess && repoAccess.accessState !== GitHubAccessState.ACCESS_GRANTED) {
        // Update access state
        const updated = await prisma.gitHubRepoAccess.update({
          where: { id: repoAccess.id },
          data: {
            accessState: GitHubAccessState.ACCESS_GRANTED,
            lastSyncedAt: new Date(),
          },
        });

        // Send notification
        await notificationService.sendRepoAccessGrantedNotification(userId, {
          projectName: repoAccess.project.repositoryUrl.split('/').pop() || 'project',
          repoUrl: repoAccess.project.repositoryUrl,
        });

        logger.info(`GitHub access granted for user ${userId} on project ${projectId}`);
        return updated;
      }

      // Update last synced time
      await prisma.gitHubRepoAccess.update({
        where: { id: repoAccess.id },
        data: {
          lastSyncedAt: new Date(),
        },
      });

      return repoAccess;
    } catch (error) {
      logger.error('Error syncing GitHub access status:', error);
      throw error;
    }
  }

  /**
   * Get project invites for a user
   */
  async getUserProjectInvites(userId: string, status?: InviteStatus) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: any = {
        toUserId: userId,
      };

      if (status) {
        where.platformInviteStatus = status;
      }

      const invites = await prisma.projectInvite.findMany({
        where,
        include: {
          project: {
            select: {
              id: true,
              title: true,
              description: true,
              repoType: true,
            },
          },
          fromUser: {
            select: {
              id: true,
              githubUsername: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return invites;
    } catch (error) {
      logger.error('Error fetching user project invites:', error);
      throw new Error('Failed to fetch project invites');
    }
  }

  /**
   * Check if user has GitHub access to project
   */
  async checkUserGitHubAccess(projectId: string, userId: string): Promise<boolean> {
    try {
      const access = await prisma.gitHubRepoAccess.findFirst({
        where: {
          projectId,
          userId,
          accessState: GitHubAccessState.ACCESS_GRANTED,
        },
      });

      return !!access;
    } catch (error) {
      logger.error('Error checking GitHub access:', error);
      return false;
    }
  }
}

export const inviteService = new InviteService();
