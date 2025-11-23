import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import jwt from 'jsonwebtoken';
import { ethers } from 'ethers';
import { config } from '../config';
import { logger } from '../utils/logger';
import { smartAccountService } from '../services/smart-account.service';

export class AuthController {
  /**
   * Handle GitHub OAuth callback
   */
  static async githubCallback(req: AuthRequest, res: Response) {
    if (!req.user) {
      throw new AppError('Authentication failed', 401);
    }

    const token = jwt.sign(
      { id: req.user.id, githubId: req.user.githubId, role: req.user.role },
      config.auth.jwtSecret
    );

    // Fetch full user details from database
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    res.json({
      user: {
        id: user.id,
        githubId: user.githubId,
        githubUsername: user.githubUsername,
        email: user.email,
        role: user.role,
        walletAddress: user.walletAddress,
        avatarUrl: user.avatarUrl,
      },
      token,
    });
  }

  /**
   * Link wallet address to user account and create smart account
   */
  static async linkWallet(req: AuthRequest, res: Response) {
    const { walletAddress, signature, message } = req.body;

    if (!walletAddress || !signature) {
      throw new AppError('Wallet address and signature are required', 400);
    }

    // Verify signature using ethers.js
    const expectedMessage = message || `Link wallet ${walletAddress} to DevSponsor account`;
    try {
      const recoveredAddress = ethers.verifyMessage(expectedMessage, signature);
      if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
        throw new AppError('Invalid signature', 400);
      }
    } catch (error) {
      logger.error('Wallet signature verification failed:', error);
      throw new AppError('Invalid signature', 400);
    }

    // Update user with wallet address
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { walletAddress },
    });

    // Create smart account for the user (async - don't block response)
    if (!user.smartAccountAddress) {
      smartAccountService
        .onboardUser(user.id, walletAddress)
        .then((accountInfo) => {
          logger.info(
            `Smart account created for user ${user.id}: ${accountInfo.smartAccountAddress}`
          );
        })
        .catch((error) => {
          logger.error(`Failed to create smart account for user ${user.id}:`, error);
        });
    }

    res.json({
      message: 'Wallet linked successfully. Smart account is being created...',
      user: {
        id: user.id,
        walletAddress: user.walletAddress,
        smartAccountAddress: user.smartAccountAddress,
      },
    });
  }

  /**
   * Update user role (Sponsor or Contributor)
   */
  static async updateRole(req: AuthRequest, res: Response) {
    const { role } = req.body;

    if (!['SPONSOR', 'CONTRIBUTOR'].includes(role)) {
      throw new AppError('Invalid role. Must be SPONSOR or CONTRIBUTOR', 400);
    }

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { role },
    });

    // Generate new JWT with updated role
    const token = jwt.sign(
      {
        id: user.id,
        githubId: user.githubId,
        walletAddress: user.walletAddress,
        role: user.role,
      },
      config.auth.jwtSecret
    );

    res.json({
      message: 'Role updated successfully',
      token,
      user: {
        id: user.id,
        role: user.role,
      },
    });
  }

  /**
   * Complete onboarding with role, name, bio, and other details
   */
  static async completeOnboarding(req: AuthRequest, res: Response) {
    const { role, name, bio, skills, organizationName } = req.body;

    if (!role || !['SPONSOR', 'CONTRIBUTOR'].includes(role)) {
      throw new AppError('Valid role is required (SPONSOR or CONTRIBUTOR)', 400);
    }

    if (!name || name.trim() === '') {
      throw new AppError('Name is required', 400);
    }

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        role,
        name: name.trim(),
        bio: bio?.trim() || null,
        skills: skills || [],
        organizationName: organizationName?.trim() || null,
        onboardingCompleted: true,
      },
    });

    // Generate new JWT with updated role
    const token = jwt.sign(
      {
        id: user.id,
        githubId: user.githubId,
        walletAddress: user.walletAddress,
        role: user.role,
      },
      config.auth.jwtSecret
    );

    // Send welcome email asynchronously (don't block response)
    if (user.email) {
      import('../services/email.service').then(({ emailService }) => {
        emailService
          .sendWelcomeEmail({
            toEmail: user.email!,
            userName: user.name || user.githubUsername,
            role: user.role,
            githubUsername: user.githubUsername,
          })
          .catch((error) => {
            logger.error('Failed to send welcome email:', error);
          });
      });
    }

    res.json({
      message: 'Onboarding completed successfully',
      token,
      user: {
        id: user.id,
        githubId: user.githubId,
        githubUsername: user.githubUsername,
        email: user.email,
        role: user.role,
        walletAddress: user.walletAddress,
        avatarUrl: user.avatarUrl,
        name: user.name,
        bio: user.bio,
        skills: user.skills,
        organizationName: user.organizationName,
        onboardingCompleted: user.onboardingCompleted,
      },
    });
  }

  /**
   * Get current user
   */
  static async getCurrentUser(req: AuthRequest, res: Response) {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        githubId: true,
        githubUsername: true,
        email: true,
        role: true,
        walletAddress: true,
        avatarUrl: true,
        name: true,
        bio: true,
        skills: true,
        organizationName: true,
        onboardingCompleted: true,
        settings: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    res.json({ user });
  }

  /**
   * Logout (client-side JWT removal)
   */
  static async logout(_req: AuthRequest, res: Response) {
    res.json({ message: 'Logged out successfully' });
  }
}
