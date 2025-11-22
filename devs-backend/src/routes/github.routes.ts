import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { githubAppService } from '../services/github-app.service';
import { config } from '../config';
import { logger } from '../utils/logger';

const router: Router = Router();

/**
 * Get GitHub App installation status
 * Public endpoint - no authentication required
 */
router.get(
  '/app/status',
  asyncHandler(async (_req, res) => {
    // Check if GitHub App is properly configured
    let privateKey = config.github.privateKey;

    if (!privateKey && config.github.privateKeyPath) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const fs = require('fs');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const path = require('path');
        const keyPath = path.resolve(process.cwd(), config.github.privateKeyPath);
        privateKey = fs.readFileSync(keyPath, 'utf8');
      } catch (error) {
        // Private key file not found
      }
    }

    const isConfigured = !!config.github.appId && !!privateKey;

    res.json({
      isConfigured,
      appName: config.github.appName || 'Evolvx-Ai',
      appId: config.github.appId,
    });
  })
);

/**
 * Get all repositories accessible via GitHub App installations
 * GET /api/github/repositories?userId={userId}
 */
router.get(
  '/repositories',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticate as any,
  asyncHandler(async (req, res) => {
    const userId = (req as any).user?.id;

    if (!userId) {
      logger.warn('Repository request without authentication');
      return res.status(401).json({ error: 'User not authenticated' });
    }

    logger.info(`Fetching repositories for user: ${userId}`);

    // Get user's installations from database
    const installations = await githubAppService.getUserInstallations(userId);

    logger.info(`Found ${installations.length} installations for user: ${userId}`);

    if (installations.length === 0) {
      logger.warn(`No GitHub App installations found for user: ${userId}`);
      return res.json({ repositories: [] });
    }

    // Fetch repositories from all user installations
    const allRepos = [];
    for (const installation of installations) {
      try {
        logger.info(`Fetching repos for installation: ${installation.installationId}`);
        const repos = await githubAppService.listInstallationRepositories(
          installation.installationId,
          1,
          100
        );
        logger.info(`Found ${repos.length} repos for installation: ${installation.installationId}`);
        allRepos.push(...repos);
      } catch (error) {
        logger.error('Failed to fetch repos for installation:', {
          installationId: installation.installationId,
          error,
        });
      }
    }

    // Format repositories to match frontend expectations
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formattedRepos = allRepos.map((repo: any) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      full_name: repo.full_name, // Keep both formats for compatibility
      owner: repo.owner?.login || repo.owner,
      private: repo.private,
      isPrivate: repo.private, // Add camelCase version
      htmlUrl: repo.html_url,
      html_url: repo.html_url, // Keep both formats
      url: repo.html_url,
      description: repo.description || null,
      language: repo.language || null,
      stargazersCount: repo.stargazers_count || 0,
      stargazers_count: repo.stargazers_count || 0, // Keep both formats
      stars: repo.stargazers_count || 0,
      forksCount: repo.forks_count || 0,
      forks_count: repo.forks_count || 0, // Keep both formats
      forks: repo.forks_count || 0,
      defaultBranch: repo.default_branch || 'main',
      default_branch: repo.default_branch || 'main', // Keep both formats
      updatedAt: repo.updated_at,
      updated_at: repo.updated_at, // Keep both formats
    }));

    logger.info(`Returning ${formattedRepos.length} formatted repositories`);
    return res.json({ repositories: formattedRepos });
  })
);

/**
 * Get user's GitHub App installations
 * GET /api/github/installations?userId={userId}
 */
router.get(
  '/installations',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticate as any,
  asyncHandler(async (req, res) => {
    const userId = (req as any).user?.id;
    const queryUserId = req.query.userId as string | undefined;

    const targetUserId = userId || queryUserId;

    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required',
      });
    }

    // Get installations from database
    const installations = await githubAppService.getUserInstallations(targetUserId);

    return res.json({
      success: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: installations.map((inst: any) => ({
        id: inst.id,
        installationId: inst.installationId,
        accountLogin: inst.accountLogin,
        accountType: inst.accountType,
        repositorySelection: inst.repositorySelection,
        isActive: inst.isActive,
        createdAt: inst.createdAt,
      })),
    });
  })
);

/**
 * GitHub App Installation Callback
 * GET /github/installation/callback
 * Note: No authentication middleware - GitHub calls this directly
 */
router.get(
  '/installation/callback',
  asyncHandler(async (req, res) => {
    const { installation_id, setup_action, state } = req.query;

    logger.info('GitHub App installation callback received:', {
      installation_id,
      setup_action,
      hasState: !!state,
    });

    if (!installation_id) {
      logger.error('Installation callback missing installation_id');
      throw new Error('Missing installation_id');
    }

    // Decode state parameter to get userId and organizationId
    let userId = 'unknown';
    let organizationId: string | null = null;

    if (state) {
      try {
        const decodedState = JSON.parse(Buffer.from(state as string, 'base64').toString('utf-8'));
        userId = decodedState.userId || 'unknown';
        organizationId = decodedState.organizationId || null;
        logger.info('Decoded state parameter:', { userId, organizationId });
      } catch (error) {
        logger.error('Failed to decode state parameter:', error);
      }
    } else {
      logger.warn('No state parameter provided in callback');
    }

    // Store installation with user and organization info
    logger.info(`Storing installation ${installation_id} for user ${userId}`);
    const installation = await githubAppService.handleInstallationCallback(
      installation_id as string,
      userId,
      organizationId
    );
    logger.info('Installation stored successfully:', {
      id: installation.id,
      installationId: installation.installationId,
      accountLogin: installation.accountLogin,
    });

    // Redirect to frontend callback
    const redirectUrl = `${config.server.frontendUrl}/auth/github-app/callback?installation_id=${installation_id}&setup_action=${setup_action || 'install'}`;
    logger.info('Redirecting to frontend:', redirectUrl);
    res.redirect(redirectUrl);
  })
);

/**
 * GitHub App Install Redirect
 * GET /github/install
 * Requires authentication to capture userId
 */
router.get(
  '/install',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticate as any,
  asyncHandler(async (req, res) => {
    const appName = config.github.appName || 'evolvx-ai';
    const userId = (req as any).user?.id;
    const organizationId = req.query.organizationId as string | undefined;

    if (!userId) {
      logger.error('Install endpoint called without authentication');
      return res.status(401).json({ error: 'User not authenticated' });
    }

    logger.info(`User ${userId} initiating GitHub App installation`);

    // Build state parameter
    const state = Buffer.from(
      JSON.stringify({
        userId,
        organizationId: organizationId || null,
        timestamp: Date.now(),
      })
    ).toString('base64');

    // Redirect to GitHub App installation
    const installUrl = `https://github.com/apps/${appName}/installations/new?state=${state}`;
    logger.info(`Redirecting to GitHub: ${installUrl}`);
    return res.redirect(installUrl);
  })
);

/**
 * List repositories from a specific installation
 * GET /api/github/installations/:installationId/repositories
 */
router.get(
  '/installations/:installationId/repositories',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticate as any,
  asyncHandler(async (req, res) => {
    const { installationId } = req.params;
    const page = parseInt((req.query.page as string) || '1', 10);
    const perPage = parseInt((req.query.per_page as string) || '100', 10);

    try {
      logger.info(`Fetching repos for installation: ${installationId}`);
      const repos = await githubAppService.listInstallationRepositories(
        installationId,
        page,
        perPage
      );

      // Format repositories consistently
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const formattedRepos = repos.map((repo: any) => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        full_name: repo.full_name,
        owner: repo.owner?.login || repo.owner,
        private: repo.private,
        isPrivate: repo.private,
        htmlUrl: repo.html_url,
        html_url: repo.html_url,
        url: repo.html_url,
        description: repo.description || null,
        language: repo.language || null,
        stargazersCount: repo.stargazers_count || 0,
        stargazers_count: repo.stargazers_count || 0,
        stars: repo.stargazers_count || 0,
        forksCount: repo.forks_count || 0,
        forks_count: repo.forks_count || 0,
        forks: repo.forks_count || 0,
        defaultBranch: repo.default_branch || 'main',
        default_branch: repo.default_branch || 'main',
        updatedAt: repo.updated_at,
        updated_at: repo.updated_at,
      }));

      logger.info(`Returning ${formattedRepos.length} repos for installation ${installationId}`);

      return res.json(formattedRepos);
    } catch (error) {
      logger.error('Failed to list repositories:', { installationId, error });
      return res.status(400).json({
        success: false,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        error: (error as any).message || 'Failed to fetch repositories',
      });
    }
  })
);

/**
 * List user's GitHub installations (for frontend to show installation picker)
 * GET /api/github/users/:userId/installations
 */
router.get(
  '/users/:userId/installations',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticate as any,
  asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const authenticatedUserId = (req as any).user?.id;

    // Verify user can only access their own installations
    if (authenticatedUserId !== userId) {
      return res.status(403).json({
        success: false,
        error: "Unauthorized to access this user's installations",
      });
    }

    logger.info(`Fetching installations for user: ${userId}`);

    const installations = await githubAppService.getUserInstallations(userId);

    logger.info(`Found ${installations.length} installations for user ${userId}`);

    return res.json(installations);
  })
);

export default router;
