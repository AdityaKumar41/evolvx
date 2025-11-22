import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { ProjectStatus, PaymentMode, RepoType, OrganizationRole } from '@prisma/client';

export interface CreateProjectData {
  orgId?: string;
  sponsorId: string;
  title: string;
  description?: string;
  repositoryUrl?: string;
  repoType: RepoType;
  tokenAddress?: string;
  tokenDecimals?: number;
  paymentMode?: PaymentMode;
}

export class ProjectService {
  /**
   * Create a new project
   */
  async createProject(data: CreateProjectData) {
    try {
      // If orgId is provided, check if user is member
      if (data.orgId) {
        const member = await prisma.organizationMember.findFirst({
          where: {
            organizationId: data.orgId,
            userId: data.sponsorId,
            role: {
              in: [OrganizationRole.OWNER, OrganizationRole.MAINTAINER, OrganizationRole.SPONSOR],
            },
          },
        });

        if (!member) {
          throw new Error('User is not authorized to create projects in this organization');
        }
      }

      const project = await prisma.project.create({
        data: {
          orgId: data.orgId || '', // TODO: Make orgId optional in schema
          sponsorId: data.sponsorId,
          title: data.title,
          description: data.description,
          repositoryUrl: data.repositoryUrl,
          repoType: data.repoType,
          tokenAddress: data.tokenAddress,
          tokenDecimals: data.tokenDecimals || 18,
          paymentMode: data.paymentMode,
          status: ProjectStatus.DRAFT,
        },
        include: {
          sponsor: {
            select: {
              id: true,
              githubUsername: true,
              email: true,
              avatarUrl: true,
            },
          },
          organization: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
            },
          },
        },
      });

      logger.info(`Project created: ${project.id} by sponsor ${data.sponsorId}`);

      // Trigger repository analysis if repository URL is provided
      if (project.repositoryUrl) {
        try {
          const { publishEvent, KAFKA_TOPICS } = await import('../lib/kafka');
          await publishEvent(KAFKA_TOPICS.REPO_ANALYSIS_REQUESTED, {
            projectId: project.id,
            repositoryUrl: project.repositoryUrl,
            userId: data.sponsorId,
          });
          logger.info(`[Project] Repository analysis requested for project ${project.id}`);
        } catch (error) {
          logger.error('[Project] Failed to trigger repository analysis:', error);
          // Don't fail project creation if analysis trigger fails
        }
      }

      return project;
    } catch (error) {
      logger.error('Error creating project:', error);
      throw error;
    }
  }

  /**
   * Get project by ID with access control
   */
  async getProjectById(projectId: string, userId?: string) {
    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          sponsor: {
            select: {
              id: true,
              githubUsername: true,
              avatarUrl: true,
            },
          },
          organization: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
            },
          },
          milestones: {
            include: {
              subMilestones: {
                select: {
                  id: true,
                  description: true,
                  checkpointAmount: true,
                  status: true,
                  assignedTo: true,
                },
              },
            },
          },
          fundings: true,
          _count: {
            select: {
              milestones: true,
            },
          },
        },
      });

      if (!project) {
        throw new Error('Project not found');
      }

      // Access control for private repos
      if (project.repoType === RepoType.PRIVATE && userId) {
        const hasAccess = await this.checkProjectAccess(projectId, userId);
        if (!hasAccess) {
          throw new Error('Access denied to private project');
        }
      }

      return project;
    } catch (error) {
      logger.error('Error fetching project:', error);
      throw error;
    }
  }

  /**
   * Check if user has access to project (for private repos)
   */
  async checkProjectAccess(projectId: string, userId: string): Promise<boolean> {
    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: {
          sponsorId: true,
          repoType: true,
          orgId: true,
        },
      });

      if (!project) {
        return false;
      }

      // Public repos are accessible to all
      if (project.repoType === RepoType.PUBLIC) {
        return true;
      }

      // Sponsor always has access
      if (project.sponsorId === userId) {
        return true;
      }

      // Check if user is in the organization
      if (project.orgId) {
        const orgMember = await prisma.organizationMember.findFirst({
          where: {
            organizationId: project.orgId,
            userId: userId,
          },
        });

        if (orgMember) {
          return true;
        }
      }

      // Check if user has been invited and GitHub access granted
      const invite = await prisma.projectInvite.findFirst({
        where: {
          projectId: projectId,
          toUserId: userId,
          platformInviteStatus: 'ACCEPTED',
        },
      });

      if (!invite) {
        return false;
      }

      // Check GitHub access status
      const githubAccess = await prisma.gitHubRepoAccess.findFirst({
        where: {
          projectId: projectId,
          userId: userId,
          accessState: 'ACCESS_GRANTED',
        },
      });

      return !!githubAccess;
    } catch (error) {
      logger.error('Error checking project access:', error);
      return false;
    }
  }

  /**
   * Get all projects accessible to a user
   */
  async getUserAccessibleProjects(userId: string) {
    try {
      const projects = await prisma.project.findMany({
        where: {
          OR: [
            // Public projects
            { repoType: RepoType.PUBLIC },
            // User is sponsor
            { sponsorId: userId },
            // User is in organization
            {
              organization: {
                members: {
                  some: {
                    userId: userId,
                  },
                },
              },
            },
            // User has been invited with GitHub access
            {
              projectInvites: {
                some: {
                  toUserId: userId,
                  platformInviteStatus: 'ACCEPTED',
                },
              },
              githubRepoAccess: {
                some: {
                  userId: userId,
                  accessState: 'ACCESS_GRANTED',
                },
              },
            },
          ],
        },
        include: {
          sponsor: {
            select: {
              id: true,
              githubUsername: true,
              avatarUrl: true,
            },
          },
          organization: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
            },
          },
          _count: {
            select: {
              milestones: true,
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
      });

      return projects;
    } catch (error) {
      logger.error('Error fetching accessible projects:', error);
      throw new Error('Failed to fetch projects');
    }
  }

  /**
   * Update project
   */
  async updateProject(
    projectId: string,
    userId: string,
    data: {
      title?: string;
      description?: string;
      repositoryUrl?: string;
      status?: ProjectStatus;
      tokenAddress?: string;
      paymentMode?: PaymentMode;
    }
  ) {
    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { sponsorId: true, orgId: true },
      });

      if (!project) {
        throw new Error('Project not found');
      }

      // Check permissions
      const hasPermission =
        project.sponsorId === userId ||
        (project.orgId &&
          (await prisma.organizationMember.findFirst({
            where: {
              organizationId: project.orgId,
              userId: userId,
              role: {
                in: [OrganizationRole.OWNER, OrganizationRole.MAINTAINER],
              },
            },
          })));

      if (!hasPermission) {
        throw new Error('Insufficient permissions');
      }

      const updated = await prisma.project.update({
        where: { id: projectId },
        data: data,
      });

      logger.info(`Project ${projectId} updated by user ${userId}`);
      return updated;
    } catch (error) {
      logger.error('Error updating project:', error);
      throw error;
    }
  }

  /**
   * Approve milestone structure (moves project from DRAFT to ACTIVE once funded)
   */
  async approveMilestoneStructure(projectId: string, userId: string) {
    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          milestones: {
            include: {
              subMilestones: true,
            },
          },
        },
      });

      if (!project) {
        throw new Error('Project not found');
      }

      if (project.sponsorId !== userId) {
        throw new Error('Only sponsor can approve milestone structure');
      }

      if (project.status !== ProjectStatus.DRAFT) {
        throw new Error('Project is not in draft status');
      }

      // Calculate total points
      const totalPoints = project.milestones.reduce(
        (sum, milestone) =>
          sum +
          milestone.subMilestones.reduce((subSum, sub) => subSum + Number(sub.checkpointAmount), 0),
        0
      );

      await prisma.project.update({
        where: { id: projectId },
        data: {
          totalPoints: totalPoints,
        },
      });

      logger.info(`Milestone structure approved for project ${projectId}`);
      return { totalPoints };
    } catch (error) {
      logger.error('Error approving milestone structure:', error);
      throw error;
    }
  }

  /**
   * Mark project as funded and activate
   */
  async markProjectAsFunded(
    projectId: string,
    fundingData: {
      amount: number;
      token: string;
      depositTxHash: string;
      oracleRate?: number;
    }
  ) {
    try {
      const [project, fundingRecord] = await prisma.$transaction([
        prisma.project.update({
          where: { id: projectId },
          data: {
            status: ProjectStatus.ACTIVE,
            totalTokenAmount: fundingData.amount,
            onchainContractAddress: fundingData.token,
          },
        }),
        prisma.fundingRecord.create({
          data: {
            projectId: projectId,
            amount: fundingData.amount,
            token: fundingData.token,
            mode: PaymentMode.ESCROW, // Default
            depositTxHash: fundingData.depositTxHash,
            oracleRate: fundingData.oracleRate,
          },
        }),
      ]);

      logger.info(`Project ${projectId} marked as funded with tx ${fundingData.depositTxHash}`);
      return { project, fundingRecord };
    } catch (error) {
      logger.error('Error marking project as funded:', error);
      throw error;
    }
  }

  /**
   * Delete project (only if in DRAFT status and no milestones generated)
   */
  async deleteProject(projectId: string, userId: string) {
    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          milestones: true,
        },
      });

      if (!project) {
        throw new Error('Project not found');
      }

      if (project.sponsorId !== userId) {
        throw new Error('Only sponsor can delete project');
      }

      if (project.status !== ProjectStatus.DRAFT) {
        throw new Error('Can only delete draft projects');
      }

      if (project.milestones.length > 0) {
        throw new Error('Cannot delete project with milestones');
      }

      await prisma.project.delete({
        where: { id: projectId },
      });

      logger.info(`Project ${projectId} deleted by user ${userId}`);
      return { success: true };
    } catch (error) {
      logger.error('Error deleting project:', error);
      throw error;
    }
  }
}

export const projectService = new ProjectService();
