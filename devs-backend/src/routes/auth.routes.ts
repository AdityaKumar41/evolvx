import { Router } from 'express';
import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';
import jwt from 'jsonwebtoken';
import { ethers } from 'ethers';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { logger } from '../utils/logger';

const router: Router = Router();

// GitHub OAuth Strategy
passport.use(
  new GitHubStrategy(
    {
      clientID: config.github.clientId,
      clientSecret: config.github.clientSecret,
      callbackURL: config.github.callbackUrl,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (accessToken: string, _refreshToken: string, profile: any, done: any) => {
      try {
        let user = await prisma.user.findUnique({
          where: { githubId: profile.id },
        });

        // Calculate token expiry (GitHub tokens typically expire in 8 hours, but we'll set 7 for safety)
        const tokenExpiry = new Date(Date.now() + 7 * 60 * 60 * 1000);

        if (!user) {
          // Auto-fill user data from GitHub profile
          user = await prisma.user.create({
            data: {
              githubId: profile.id,
              githubUsername: profile.username,
              email: profile.emails?.[0]?.value,
              avatarUrl: profile.photos?.[0]?.value,
              name: profile.displayName || profile.username,
              bio: profile._json?.bio || null,
              // Set default role as CONTRIBUTOR
              role: 'CONTRIBUTOR',
              // Store GitHub access token
              githubAccessToken: accessToken,
              githubAccessTokenExpiry: tokenExpiry,
            },
          });
          logger.info(`New user created: ${user.id}`);
        } else {
          // Update existing user with new access token
          user = await prisma.user.update({
            where: { id: user.id },
            data: {
              githubAccessToken: accessToken,
              githubAccessTokenExpiry: tokenExpiry,
              // Also update profile info in case it changed
              email: profile.emails?.[0]?.value || user.email,
              avatarUrl: profile.photos?.[0]?.value || user.avatarUrl,
              name: profile.displayName || profile.username || user.name,
              bio: profile._json?.bio || user.bio,
            },
          });
          logger.info(`User ${user.id} GitHub token updated`);
        }

        return done(null, user);
      } catch (error) {
        logger.error('Error in GitHub OAuth:', error);
        return done(error);
      }
    }
  )
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user);
  } catch (error) {
    done(error);
  }
});

// GitHub OAuth routes
router.get('/github', (req, res, next) => {
  // Store wallet address in session if provided in query
  if (req.query.walletAddress) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req.session as any).walletAddress = req.query.walletAddress as string;
  }
  // Store invite token in session if provided in query
  if (req.query.inviteToken) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req.session as any).inviteToken = req.query.inviteToken as string;
  }
  passport.authenticate('github', { scope: ['user:email', 'repo'] })(req, res, next);
});

router.get(
  '/github/callback',
  passport.authenticate('github', { failureRedirect: '/auth/failed' }),
  asyncHandler(async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = req.user as any;

    // Link wallet if it was stored in session during wallet connection
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionWallet = (req.session as any).walletAddress;
    if (sessionWallet) {
      await prisma.user.update({
        where: { id: user.id },
        data: { walletAddress: sessionWallet },
      });
      logger.info(`Wallet auto-linked for user ${user.id}: ${sessionWallet}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (req.session as any).walletAddress; // Clear from session
    }

    // Check for invite token in session
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inviteToken = (req.session as any).inviteToken;
    let inviteAccepted = false;

    if (inviteToken) {
      // Validate and process the invite
      const invite = await prisma.organizationInvite.findUnique({
        where: { inviteToken },
      });

      if (invite && invite.status === 'PENDING' && new Date() <= invite.expiresAt) {
        // Check if user matches the invite
        const matchesEmail = invite.email && user.email === invite.email;
        const matchesGithub =
          invite.githubUsername && user.githubUsername === invite.githubUsername;

        if (matchesEmail || matchesGithub) {
          // Check if already a member
          const existingMember = await prisma.organizationMember.findUnique({
            where: {
              organizationId_userId: {
                organizationId: invite.organizationId,
                userId: user.id,
              },
            },
          });

          if (!existingMember) {
            // Add user to organization
            await prisma.organizationMember.create({
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

            // Update user role and mark onboarding as complete for invited users
            const updates: any = { onboardingCompleted: true };

            // If role is OWNER or ADMIN, set user role to SPONSOR
            if (invite.role === 'OWNER' || invite.role === 'ADMIN') {
              updates.role = 'SPONSOR';
            }

            await prisma.user.update({
              where: { id: user.id },
              data: updates,
            });

            inviteAccepted = true;
            logger.info(`Invite auto-accepted for user ${user.id} via token ${inviteToken}`);
          }
        }
      }

      // Clear invite token from session
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (req.session as any).inviteToken;
    }

    const token = jwt.sign(
      {
        id: user.id,
        githubId: user.githubId,
        walletAddress: user.walletAddress,
        role: user.role,
        exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours from now
      },
      config.auth.jwtSecret
    );

    // Redirect to frontend with token and invite status
    const redirectUrl = inviteAccepted
      ? `${config.server.frontendUrl}/auth/callback?token=${token}&inviteAccepted=true`
      : `${config.server.frontendUrl}/auth/callback?token=${token}`;

    res.redirect(redirectUrl);
  })
);

router.get('/failed', (_req, res) => {
  res.status(401).json({ error: 'Authentication failed' });
});

// Verify wallet signature (Step 1: Before GitHub login)
router.post(
  '/verify-wallet',
  asyncHandler(async (req, res) => {
    const { walletAddress, signature, message } = req.body;

    if (!walletAddress || !signature) {
      throw new AppError('Wallet address and signature are required', 400);
    }

    // Verify signature using ethers.js
    const expectedMessage =
      message || `Sign this message to verify your wallet address: ${walletAddress}`;
    try {
      const recoveredAddress = ethers.verifyMessage(expectedMessage, signature);
      if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
        throw new AppError('Invalid signature', 400);
      }
    } catch (error) {
      logger.error('Signature verification failed:', error);
      throw new AppError('Invalid signature', 400);
    }

    logger.info(`Wallet verified: ${walletAddress}`);

    res.json({
      message: 'Wallet verified successfully',
      walletAddress,
      // Return this URL for frontend to redirect to GitHub OAuth with wallet
      githubAuthUrl: `/auth/github?walletAddress=${walletAddress}`,
    });
  })
);

// Link wallet address (Works both before and after GitHub login)
router.post(
  '/link-wallet',
  asyncHandler(async (req, res) => {
    const { walletAddress, userId } = req.body;

    if (!walletAddress) {
      throw new AppError('Wallet address is required', 400);
    }

    // Check if user is authenticated via JWT
    const authHeader = req.headers.authorization;
    let user;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      // User is authenticated - link wallet to authenticated user
      const token = authHeader.substring(7);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const decoded = jwt.verify(token, config.auth.jwtSecret) as any;
        user = await prisma.user.update({
          where: { id: decoded.id },
          data: { walletAddress },
        });
        logger.info(`Wallet linked for authenticated user ${user.id}: ${walletAddress}`);

        return res.json({
          message: 'Wallet linked successfully',
          user: {
            id: user.id,
            walletAddress: user.walletAddress,
          },
        });
      } catch (error) {
        throw new AppError('Invalid token', 401);
      }
    } else if (userId) {
      // Pre-GitHub flow - link wallet to specific user ID
      user = await prisma.user.update({
        where: { id: userId },
        data: { walletAddress },
      });
      logger.info(`Wallet linked for user ${user.id}: ${walletAddress}`);

      return res.json({
        message: 'Wallet linked successfully',
        user: {
          id: user.id,
          walletAddress: user.walletAddress,
        },
      });
    } else {
      // No auth and no userId - just verify wallet for now (Step 1)
      logger.info(`Wallet verified (pre-auth): ${walletAddress}`);
      return res.json({
        message: 'Wallet verified successfully',
        walletAddress,
        // Return GitHub auth URL with wallet address
        githubAuthUrl: `${config.server.apiBaseUrl}/auth/github?walletAddress=${walletAddress}`,
      });
    }
  })
);

// Get current user
router.get(
  '/me',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        githubId: true,
        githubUsername: true,
        email: true,
        walletAddress: true,
        role: true,
        avatarUrl: true,
        name: true,
        bio: true,
        skills: true,
        organizationName: true,
        onboardingCompleted: true,
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    res.json({ user });
  })
);

// Update user role
router.put(
  '/role',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    const { role } = req.body;

    if (!role || !['SPONSOR', 'CONTRIBUTOR'].includes(role)) {
      throw new AppError('Valid role is required (SPONSOR or CONTRIBUTOR)', 400);
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
        exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours from now
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
  })
);

// Complete onboarding
router.post(
  '/onboarding',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    const { role, name, bio, skills, organizationName } = req.body;

    if (!role || !['SPONSOR', 'DEVELOPER', 'CONTRIBUTOR'].includes(role)) {
      throw new AppError('Valid role is required (SPONSOR, DEVELOPER, or CONTRIBUTOR)', 400);
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
        exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours from now
      },
      config.auth.jwtSecret
    );

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
  })
);

// Logout
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    return res.json({ message: 'Logged out successfully' });
  });
});

export default router;
