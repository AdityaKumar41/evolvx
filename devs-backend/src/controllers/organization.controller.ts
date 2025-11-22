import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { publishEvent, KAFKA_TOPICS } from '../lib/kafka';
import { logger } from '../utils/logger';

export class OrganizationController {
  /**
   * Create a new organization
   */
  static async createOrganization(req: AuthRequest, res: Response) {
    const { name, description, avatarUrl } = req.body;

    const organization = await prisma.organization.create({
      data: {
        name,
        description,
        avatarUrl,
        ownerId: req.user!.id,
      },
      include: {
        owner: {
          select: {
            id: true,
            githubUsername: true,
            avatarUrl: true,
          },
        },
      },
    });

    res.status(201).json({ organization });
  }

  /**
   * Get all organizations for the current user
   */
  static async getUserOrganizations(req: AuthRequest, res: Response) {
    const organizations = await prisma.organization.findMany({
      where: {
        OR: [
          { ownerId: req.user!.id },
          {
            members: {
              some: {
                userId: req.user!.id,
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
        _count: {
          select: {
            projects: true,
            members: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json({ organizations });
  }

  /**
   * Get organization by ID
   */
  static async getOrganizationById(req: AuthRequest, res: Response) {
    const { id } = req.params;

    const organization = await prisma.organization.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            githubUsername: true,
            avatarUrl: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                githubUsername: true,
                avatarUrl: true,
                email: true,
              },
            },
          },
        },
        projects: {
          include: {
            _count: {
              select: {
                milestones: true,
              },
            },
          },
        },
      },
    });

    if (!organization) {
      throw new AppError('Organization not found', 404);
    }

    res.json({ organization });
  }

  /**
   * Update organization
   */
  static async updateOrganization(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const { name, description, avatarUrl } = req.body;

    const organization = await prisma.organization.findUnique({
      where: { id },
    });

    if (!organization) {
      throw new AppError('Organization not found', 404);
    }

    if (organization.ownerId !== req.user!.id) {
      throw new AppError('Only the organization owner can update it', 403);
    }

    const updated = await prisma.organization.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description && { description }),
        ...(avatarUrl && { avatarUrl }),
      },
    });

    res.json({ organization: updated });
  }

  /**
   * Delete organization
   */
  static async deleteOrganization(req: AuthRequest, res: Response) {
    const { id } = req.params;

    const organization = await prisma.organization.findUnique({
      where: { id },
    });

    if (!organization) {
      throw new AppError('Organization not found', 404);
    }

    if (organization.ownerId !== req.user!.id) {
      throw new AppError('Only the organization owner can delete it', 403);
    }

    await prisma.organization.delete({
      where: { id },
    });

    res.json({ message: 'Organization deleted successfully' });
  }

  /**
   * Invite member to organization
   */
  static async inviteMember(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const { email, githubUsername, role } = req.body;

    if (!email && !githubUsername) {
      throw new AppError('Either email or GitHub username is required', 400);
    }

    // Fetch current user with email
    const currentUser = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        name: true,
        githubUsername: true,
      },
    });

    if (!currentUser) {
      throw new AppError('User not found', 404);
    }

    const organization = await prisma.organization.findUnique({
      where: { id },
    });

    if (!organization) {
      throw new AppError('Organization not found', 404);
    }

    if (organization.ownerId !== req.user!.id) {
      throw new AppError('Only the organization owner can invite members', 403);
    }

    // Find user by email or GitHub username
    let invitedUser;
    if (email) {
      invitedUser = await prisma.user.findUnique({ where: { email } });
    } else if (githubUsername) {
      invitedUser = await prisma.user.findUnique({
        where: { githubUsername },
      });
    }

    if (!invitedUser) {
      // Generate unique invite token for non-existing users
      const crypto = await import('crypto');
      const inviteToken = crypto.randomBytes(32).toString('hex');

      // Create pending invite
      const invite = await prisma.organizationInvite.create({
        data: {
          organizationId: id,
          invitedBy: req.user!.id,
          email: email || null,
          githubUsername: githubUsername || null,
          inviteToken,
          role: role || 'MEMBER',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
            },
          },
          inviter: {
            select: {
              id: true,
              githubUsername: true,
              name: true,
            },
          },
        },
      });

      // Generate invite URL
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const inviteUrl = `${frontendUrl}/auth/invite/${inviteToken}`;

      // Send email notification with invite link
      if (email) {
        import('../services/email.service').then(({ emailService }) => {
          emailService
            .sendOrganizationInvite({
              toEmail: email,
              toGithubUsername: githubUsername || undefined,
              fromUserName: currentUser.name || currentUser.githubUsername,
              fromUserEmail: currentUser.email || '',
              organizationName: invite.organization.name,
              inviterName: invite.inviter.name || invite.inviter.githubUsername || 'A team member',
              inviteLink: inviteUrl,
            })
            .catch((error) => {
              logger.error('Failed to send organization invite email:', error);
            });
        });
      }

      await publishEvent(KAFKA_TOPICS.AUDIT_LOG, {
        type: 'ORGANIZATION_INVITE_CREATED',
        organizationId: id,
        inviteId: invite.id,
        invitedBy: req.user!.id,
        email,
        githubUsername,
        inviteToken,
      });

      res.status(201).json({
        message: 'Invite sent successfully',
        invite: {
          id: invite.id,
          status: invite.status,
          expiresAt: invite.expiresAt,
          inviteUrl,
          organization: invite.organization,
        },
      });
    } else {
      // Check if user is already a member
      const existingMember = await prisma.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId: id,
            userId: invitedUser.id,
          },
        },
      });

      if (existingMember) {
        throw new AppError('User is already a member of this organization', 400);
      }

      // User exists, add them directly to the organization
      const member = await prisma.organizationMember.create({
        data: {
          organizationId: id,
          userId: invitedUser.id,
          role: role || 'MEMBER',
        },
        include: {
          user: {
            select: {
              id: true,
              githubUsername: true,
              avatarUrl: true,
              email: true,
            },
          },
        },
      });

      res.status(201).json({
        message: 'Member added successfully',
        member,
      });
    }
  }

  /**
   * Get pending invites for an organization
   */
  static async getPendingInvites(req: AuthRequest, res: Response) {
    const { id } = req.params;

    const organization = await prisma.organization.findUnique({
      where: { id },
    });

    if (!organization) {
      throw new AppError('Organization not found', 404);
    }

    if (organization.ownerId !== req.user!.id) {
      throw new AppError('Only the organization owner can view invites', 403);
    }

    const invites = await prisma.organizationInvite.findMany({
      where: {
        organizationId: id,
        status: 'PENDING',
      },
      include: {
        inviter: {
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

    res.json({ invites });
  }

  /**
   * Validate invite token (public endpoint - no auth required)
   */
  static async validateInviteToken(req: AuthRequest, res: Response) {
    const { token } = req.params;

    const invite = await prisma.organizationInvite.findUnique({
      where: { inviteToken: token },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            description: true,
            avatarUrl: true,
          },
        },
        inviter: {
          select: {
            githubUsername: true,
            name: true,
          },
        },
      },
    });

    if (!invite) {
      throw new AppError('Invalid invite token', 404);
    }

    if (invite.status !== 'PENDING') {
      throw new AppError('Invite is no longer valid', 400);
    }

    if (new Date() > invite.expiresAt) {
      await prisma.organizationInvite.update({
        where: { id: invite.id },
        data: { status: 'EXPIRED' },
      });
      throw new AppError('Invite has expired', 400);
    }

    res.json({
      invite: {
        id: invite.id,
        email: invite.email,
        githubUsername: invite.githubUsername,
        role: invite.role,
        organization: invite.organization,
        inviter: invite.inviter,
        expiresAt: invite.expiresAt,
      },
    });
  }

  /**
   * Accept organization invite
   */
  static async acceptInvite(req: AuthRequest, res: Response) {
    const { inviteId } = req.params;

    const invite = await prisma.organizationInvite.findUnique({
      where: { id: inviteId },
      include: {
        organization: true,
      },
    });

    if (!invite) {
      throw new AppError('Invite not found', 404);
    }

    if (invite.status !== 'PENDING') {
      throw new AppError('Invite is no longer valid', 400);
    }

    if (new Date() > invite.expiresAt) {
      await prisma.organizationInvite.update({
        where: { id: inviteId },
        data: { status: 'EXPIRED' },
      });
      throw new AppError('Invite has expired', 400);
    }

    // Check if user matches invite - fetch full user data
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) {
      throw new AppError('User not found', 404);
    }
    const matchesEmail = invite.email && user.email === invite.email;
    const matchesGithub = invite.githubUsername && user.githubUsername === invite.githubUsername;

    if (!matchesEmail && !matchesGithub) {
      throw new AppError('This invite is not for you', 403);
    }

    // Check if already a member
    const existingMember = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: invite.organizationId,
          userId: user.id,
        },
      },
    });

    if (existingMember) {
      // Already a member, just mark invite as accepted
      await prisma.organizationInvite.update({
        where: { id: inviteId },
        data: { status: 'ACCEPTED' },
      });

      return res.json({
        message: 'You are already a member of this organization',
        organization: invite.organization,
      });
    }

    // Create member
    const member = await prisma.organizationMember.create({
      data: {
        organizationId: invite.organizationId,
        userId: user.id,
        role: invite.role,
      },
    });

    // Update invite status
    await prisma.organizationInvite.update({
      where: { id: inviteId },
      data: { status: 'ACCEPTED' },
    });

    await publishEvent(KAFKA_TOPICS.AUDIT_LOG, {
      type: 'ORGANIZATION_INVITE_ACCEPTED',
      inviteId,
      organizationId: invite.organizationId,
      userId: user.id,
    });

    return res.json({
      message: 'Invite accepted successfully',
      member,
      organization: invite.organization,
    });
  }

  /**
   * Get organization members
   */
  static async getMembers(req: AuthRequest, res: Response) {
    const { id } = req.params;

    const members = await prisma.organizationMember.findMany({
      where: { organizationId: id },
      include: {
        user: {
          select: {
            id: true,
            githubUsername: true,
            avatarUrl: true,
            email: true,
            walletAddress: true,
          },
        },
      },
      orderBy: {
        joinedAt: 'asc',
      },
    });

    res.json({ members });
  }

  /**
   * Accept invite by token (for new users after completing onboarding)
   */
  static async acceptInviteByToken(req: AuthRequest, res: Response) {
    const { token } = req.params;

    const invite = await prisma.organizationInvite.findUnique({
      where: { inviteToken: token },
      include: {
        organization: true,
      },
    });

    if (!invite) {
      throw new AppError('Invalid invite token', 404);
    }

    if (invite.status !== 'PENDING') {
      throw new AppError('Invite is no longer valid', 400);
    }

    if (new Date() > invite.expiresAt) {
      await prisma.organizationInvite.update({
        where: { id: invite.id },
        data: { status: 'EXPIRED' },
      });
      throw new AppError('Invite has expired', 400);
    }

    // Get current user
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Check if user matches the invite email or github username
    const matchesEmail = invite.email && user.email === invite.email;
    const matchesGithub = invite.githubUsername && user.githubUsername === invite.githubUsername;

    if (!matchesEmail && !matchesGithub) {
      throw new AppError('This invite is not for you', 403);
    }

    // Check if already a member
    const existingMember = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: invite.organizationId,
          userId: user.id,
        },
      },
    });

    if (existingMember) {
      await prisma.organizationInvite.update({
        where: { id: invite.id },
        data: { status: 'ACCEPTED' },
      });

      return res.json({
        message: 'You are already a member of this organization',
        organization: invite.organization,
      });
    }

    // Add user to organization
    const member = await prisma.organizationMember.create({
      data: {
        organizationId: invite.organizationId,
        userId: user.id,
        role: invite.role,
      },
    });

    // Update invite status
    await prisma.organizationInvite.update({
      where: { id: invite.id },
      data: { status: 'ACCEPTED' },
    });

    // If the role in invite is OWNER or ADMIN, update user role to SPONSOR
    if (invite.role === 'OWNER' || invite.role === 'ADMIN') {
      await prisma.user.update({
        where: { id: user.id },
        data: { role: 'SPONSOR' },
      });
    }

    await publishEvent(KAFKA_TOPICS.AUDIT_LOG, {
      type: 'ORGANIZATION_INVITE_ACCEPTED_BY_TOKEN',
      inviteId: invite.id,
      organizationId: invite.organizationId,
      userId: user.id,
      token,
    });

    return res.json({
      message: 'Invite accepted successfully',
      member,
      organization: invite.organization,
    });
  }

  /**
   * Decline organization invite
   */
  static async declineInvite(req: AuthRequest, res: Response) {
    const { inviteId } = req.params;

    const invite = await prisma.organizationInvite.findUnique({
      where: { id: inviteId },
    });

    if (!invite) {
      throw new AppError('Invite not found', 404);
    }

    if (invite.status !== 'PENDING') {
      throw new AppError('Invite is no longer valid', 400);
    }

    // Check if user matches invite
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const matchesEmail = invite.email && user.email === invite.email;
    const matchesGithub = invite.githubUsername && user.githubUsername === invite.githubUsername;

    if (!matchesEmail && !matchesGithub) {
      throw new AppError('This invite is not for you', 403);
    }

    // Mark invite as declined
    await prisma.organizationInvite.update({
      where: { id: inviteId },
      data: { status: 'DECLINED' },
    });

    res.json({ message: 'Invite declined successfully' });
  }

  /**
   * Decline organization invite by token
   */
  static async declineInviteByToken(req: AuthRequest, res: Response) {
    const { token } = req.params;

    const invite = await prisma.organizationInvite.findUnique({
      where: { inviteToken: token },
    });

    if (!invite) {
      throw new AppError('Invalid invite token', 404);
    }

    if (invite.status !== 'PENDING') {
      throw new AppError('Invite is no longer valid', 400);
    }

    // Mark invite as declined
    await prisma.organizationInvite.update({
      where: { id: invite.id },
      data: { status: 'DECLINED' },
    });

    res.json({ message: 'Invite declined successfully' });
  }

  /**
   * Remove member from organization
   */
  static async removeMember(req: AuthRequest, res: Response) {
    const { id, memberId } = req.params;

    const organization = await prisma.organization.findUnique({
      where: { id },
    });

    if (!organization) {
      throw new AppError('Organization not found', 404);
    }

    if (organization.ownerId !== req.user!.id) {
      throw new AppError('Only the organization owner can remove members', 403);
    }

    await prisma.organizationMember.delete({
      where: { id: memberId },
    });

    res.json({ message: 'Member removed successfully' });
  }
}
