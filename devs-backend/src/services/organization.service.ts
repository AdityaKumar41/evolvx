import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { OrganizationRole, InviteStatus } from '@prisma/client';

export class OrganizationService {
  /**
   * Create a new organization
   */
  async createOrganization(data: {
    ownerId: string;
    name: string;
    description?: string;
    avatarUrl?: string;
  }) {
    try {
      const organization = await prisma.organization.create({
        data: {
          ownerId: data.ownerId,
          name: data.name,
          description: data.description,
          avatarUrl: data.avatarUrl,
          members: {
            create: {
              userId: data.ownerId,
              role: OrganizationRole.OWNER,
            },
          },
        },
        include: {
          owner: {
            select: {
              id: true,
              githubUsername: true,
              email: true,
              avatarUrl: true,
            },
          },
          members: true,
        },
      });

      logger.info(`Organization created: ${organization.id} by user ${data.ownerId}`);
      return organization;
    } catch (error) {
      logger.error('Error creating organization:', error);
      throw new Error('Failed to create organization');
    }
  }

  /**
   * Get organization by ID
   */
  async getOrganizationById(orgId: string, userId?: string) {
    try {
      const organization = await prisma.organization.findUnique({
        where: { id: orgId },
        include: {
          owner: {
            select: {
              id: true,
              githubUsername: true,
              email: true,
              avatarUrl: true,
            },
          },
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  githubUsername: true,
                  email: true,
                  avatarUrl: true,
                  role: true,
                },
              },
            },
          },
          projects: {
            select: {
              id: true,
              title: true,
              description: true,
              status: true,
              createdAt: true,
            },
          },
        },
      });

      if (!organization) {
        throw new Error('Organization not found');
      }

      // Check if user has access
      if (userId) {
        const isMember = organization.members.some((m) => m.userId === userId);
        if (!isMember && organization.ownerId !== userId) {
          throw new Error('Access denied');
        }
      }

      return organization;
    } catch (error) {
      logger.error('Error fetching organization:', error);
      throw error;
    }
  }

  /**
   * Get all organizations for a user
   */
  async getUserOrganizations(userId: string) {
    try {
      const organizations = await prisma.organization.findMany({
        where: {
          OR: [
            { ownerId: userId },
            {
              members: {
                some: {
                  userId: userId,
                },
              },
            },
          ],
        },
        include: {
          owner: {
            select: {
              id: true,
              githubUsername: true,
              avatarUrl: true,
            },
          },
          members: {
            where: {
              userId: userId,
            },
            select: {
              role: true,
            },
          },
          _count: {
            select: {
              projects: true,
              members: true,
            },
          },
        },
      });

      return organizations;
    } catch (error) {
      logger.error('Error fetching user organizations:', error);
      throw new Error('Failed to fetch organizations');
    }
  }

  /**
   * Update organization
   */
  async updateOrganization(
    orgId: string,
    userId: string,
    data: {
      name?: string;
      description?: string;
      avatarUrl?: string;
    }
  ) {
    try {
      // Check if user is owner or maintainer
      const member = await prisma.organizationMember.findFirst({
        where: {
          organizationId: orgId,
          userId: userId,
          role: {
            in: [OrganizationRole.OWNER, OrganizationRole.MAINTAINER],
          },
        },
      });

      if (!member) {
        throw new Error('Insufficient permissions');
      }

      const updated = await prisma.organization.update({
        where: { id: orgId },
        data: data,
      });

      logger.info(`Organization ${orgId} updated by user ${userId}`);
      return updated;
    } catch (error) {
      logger.error('Error updating organization:', error);
      throw error;
    }
  }

  /**
   * Invite user to organization
   */
  async inviteToOrganization(data: {
    organizationId: string;
    invitedBy: string;
    email?: string;
    githubUsername?: string;
    role: OrganizationRole;
  }) {
    try {
      // Check if inviter has permission
      const inviter = await prisma.organizationMember.findFirst({
        where: {
          organizationId: data.organizationId,
          userId: data.invitedBy,
          role: {
            in: [OrganizationRole.OWNER, OrganizationRole.MAINTAINER],
          },
        },
      });

      if (!inviter) {
        throw new Error('Insufficient permissions to invite');
      }

      // Check if invite already exists
      const existingInvite = await prisma.organizationInvite.findFirst({
        where: {
          organizationId: data.organizationId,
          OR: [{ email: data.email }, { githubUsername: data.githubUsername }],
          status: InviteStatus.PENDING,
        },
      });

      if (existingInvite) {
        throw new Error('Invite already sent');
      }

      const invite = await prisma.organizationInvite.create({
        data: {
          organizationId: data.organizationId,
          invitedBy: data.invitedBy,
          email: data.email,
          githubUsername: data.githubUsername,
          role: data.role,
          status: InviteStatus.PENDING,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
            },
          },
          inviter: {
            select: {
              id: true,
              githubUsername: true,
              avatarUrl: true,
            },
          },
        },
      });

      logger.info(`Organization invite created: ${invite.id}`);
      return invite;
    } catch (error) {
      logger.error('Error creating organization invite:', error);
      throw error;
    }
  }

  /**
   * Accept organization invite
   */
  async acceptInvite(inviteId: string, userId: string) {
    try {
      const invite = await prisma.organizationInvite.findUnique({
        where: { id: inviteId },
        include: {
          organization: true,
        },
      });

      if (!invite) {
        throw new Error('Invite not found');
      }

      if (invite.status !== InviteStatus.PENDING) {
        throw new Error('Invite is no longer valid');
      }

      if (new Date() > invite.expiresAt) {
        await prisma.organizationInvite.update({
          where: { id: inviteId },
          data: { status: InviteStatus.EXPIRED },
        });
        throw new Error('Invite has expired');
      }

      // Check if user is already a member
      const existingMember = await prisma.organizationMember.findFirst({
        where: {
          organizationId: invite.organizationId,
          userId: userId,
        },
      });

      if (existingMember) {
        throw new Error('User is already a member');
      }

      // Add user to organization
      await prisma.$transaction([
        prisma.organizationMember.create({
          data: {
            organizationId: invite.organizationId,
            userId: userId,
            role: invite.role,
          },
        }),
        prisma.organizationInvite.update({
          where: { id: inviteId },
          data: { status: InviteStatus.ACCEPTED },
        }),
      ]);

      logger.info(`User ${userId} accepted invite ${inviteId}`);
      return invite.organization;
    } catch (error) {
      logger.error('Error accepting invite:', error);
      throw error;
    }
  }

  /**
   * Remove member from organization
   */
  async removeMember(orgId: string, memberUserId: string, requestingUserId: string) {
    try {
      // Check if requesting user is owner or maintainer
      const requester = await prisma.organizationMember.findFirst({
        where: {
          organizationId: orgId,
          userId: requestingUserId,
          role: {
            in: [OrganizationRole.OWNER, OrganizationRole.MAINTAINER],
          },
        },
      });

      if (!requester) {
        throw new Error('Insufficient permissions');
      }

      // Cannot remove owner
      const targetMember = await prisma.organizationMember.findFirst({
        where: {
          organizationId: orgId,
          userId: memberUserId,
        },
      });

      if (targetMember?.role === OrganizationRole.OWNER) {
        throw new Error('Cannot remove organization owner');
      }

      await prisma.organizationMember.delete({
        where: {
          id: targetMember!.id,
        },
      });

      logger.info(`User ${memberUserId} removed from org ${orgId} by ${requestingUserId}`);
      return { success: true };
    } catch (error) {
      logger.error('Error removing member:', error);
      throw error;
    }
  }

  /**
   * Update member role
   */
  async updateMemberRole(
    orgId: string,
    memberUserId: string,
    newRole: OrganizationRole,
    requestingUserId: string
  ) {
    try {
      // Check if requesting user is owner
      const requester = await prisma.organizationMember.findFirst({
        where: {
          organizationId: orgId,
          userId: requestingUserId,
          role: OrganizationRole.OWNER,
        },
      });

      if (!requester) {
        throw new Error('Only organization owner can change roles');
      }

      const member = await prisma.organizationMember.findFirst({
        where: {
          organizationId: orgId,
          userId: memberUserId,
        },
      });

      if (!member) {
        throw new Error('Member not found');
      }

      if (member.role === OrganizationRole.OWNER) {
        throw new Error('Cannot change owner role');
      }

      const updated = await prisma.organizationMember.update({
        where: { id: member.id },
        data: { role: newRole },
      });

      logger.info(`User ${memberUserId} role updated to ${newRole} in org ${orgId}`);
      return updated;
    } catch (error) {
      logger.error('Error updating member role:', error);
      throw error;
    }
  }
}

export const organizationService = new OrganizationService();
