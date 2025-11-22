import { App } from '@octokit/app';
import { Octokit } from '@octokit/rest';
import { config } from '../config';
import { logger } from '../utils/logger';
import { prisma } from '../lib/prisma';
import * as fs from 'fs';
import * as path from 'path';

/**
 * GitHub App Service - Handles repository operations via GitHub App installation
 *
 * CRITICAL: This is separate from GitHub OAuth used for user login.
 *
 * GitHub OAuth (auth.service.ts):
 * - Purpose: User authentication and identification
 * - Scope: read:user, user:email
 * - Used for: Login flow only
 *
 * GitHub App (this file):
 * - Purpose: Repository operations (read code, merge PRs, create checks)
 * - Permissions: Contents R/W, Pull Requests R/W, Checks R/W
 * - Used for: All repo operations after project is connected
 */
export class GitHubAppService {
  private app: App;
  private installationTokenCache: Map<number, { token: string; expiresAt: Date }> = new Map();

  constructor() {
    // Load private key from file if path is provided, otherwise use the key directly
    let privateKey = config.github.privateKey;

    if (!privateKey && config.github.privateKeyPath) {
      try {
        const keyPath = path.resolve(process.cwd(), config.github.privateKeyPath);
        privateKey = fs.readFileSync(keyPath, 'utf8');
        logger.info('Loaded GitHub App private key from file');
      } catch (error) {
        logger.error('Failed to load GitHub App private key from file:', error);
        throw new Error('GitHub App private key file not found or unreadable');
      }
    }

    if (!config.github.appId || !privateKey) {
      throw new Error('GitHub App credentials not configured');
    }

    this.app = new App({
      appId: config.github.appId,
      privateKey,
    });
  }

  /**
   * Get installation access token (cached for 1 hour)
   */
  private async getInstallationToken(installationId: number): Promise<string> {
    const cached = this.installationTokenCache.get(installationId);

    if (cached && cached.expiresAt > new Date()) {
      return cached.token;
    }

    const response = await this.app.octokit.request(
      'POST /app/installations/{installation_id}/access_tokens',
      {
        installation_id: installationId,
      }
    );

    const { token, expires_at } = response.data;

    this.installationTokenCache.set(installationId, {
      token,
      expiresAt: new Date(expires_at),
    });

    return token;
  }

  /**
   * Get Octokit instance for specific installation
   */
  private async getOctokit(installationId: number): Promise<Octokit> {
    const token = await this.getInstallationToken(installationId);
    return new Octokit({ auth: token });
  }

  /**
   * Get installation ID for a repository
   */
  async getInstallationIdForRepo(owner: string, repo: string): Promise<number> {
    try {
      const installation = await this.app.octokit.request(
        'GET /repos/{owner}/{repo}/installation',
        { owner, repo }
      );
      return installation.data.id;
    } catch (error) {
      logger.error('GitHub App not installed for repository:', { owner, repo, error });
      throw new Error(`GitHub App not installed on ${owner}/${repo}`);
    }
  }

  /**
   * Get installation ID from project database
   */
  private async getProjectInstallationId(projectId: string): Promise<number> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        repositoryUrl: true,
        githubInstallationId: true,
      },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    // If cached in DB, use it
    if (project.githubInstallationId) {
      return project.githubInstallationId;
    }

    if (!project.repositoryUrl) {
      throw new Error('Project has no repository URL');
    }

    // Otherwise fetch and cache
    const [owner, repo] = this.ensureRepoUrl(project.repositoryUrl);
    const installationId = await this.getInstallationIdForRepo(owner, repo);

    // Cache in database
    await prisma.project.update({
      where: { id: projectId },
      data: { githubInstallationId: installationId },
    });

    return installationId;
  }

  /**
   * Parse GitHub repository URL
   */
  private parseRepoUrl(url: string): [string, string] {
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) {
      throw new Error('Invalid GitHub repository URL');
    }
    return [match[1], match[2].replace('.git', '')];
  }

  /**
   * Get PR details (requires GitHub App)
   */
  async getPR(projectId: string, prNumber: number) {
    const installationId = await this.getProjectInstallationId(projectId);
    const octokit = await this.getOctokit(installationId);

    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { repositoryUrl: true },
    });

    const [owner, repo] = this.ensureRepoUrl(project.repositoryUrl);

    const { data } = await octokit.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    return data;
  }

  /**
   * Get PR diff (requires GitHub App) - CRITICAL for CodeRabbit
   */
  async getPRDiff(projectId: string, prNumber: number): Promise<string> {
    const installationId = await this.getProjectInstallationId(projectId);
    const octokit = await this.getOctokit(installationId);

    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { repositoryUrl: true },
    });

    const [owner, repo] = this.ensureRepoUrl(project.repositoryUrl);

    try {
      const { data } = await octokit.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
        mediaType: { format: 'diff' },
      });

      return data as unknown as string;
    } catch (error) {
      logger.error('Failed to fetch PR diff:', { projectId, prNumber, error });
      throw new Error('Could not fetch PR diff from GitHub');
    }
  }

  /**
   * Get PR files changed list
   */
  async getPRFiles(projectId: string, prNumber: number) {
    const installationId = await this.getProjectInstallationId(projectId);
    const octokit = await this.getOctokit(installationId);

    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { repositoryUrl: true },
    });

    const [owner, repo] = this.ensureRepoUrl(project.repositoryUrl);

    const { data } = await octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
    });

    return data;
  }

  /**
   * Merge PR (requires GitHub App)
   */
  async mergePR(
    projectId: string,
    prNumber: number,
    mergeMethod: 'merge' | 'squash' | 'rebase' = 'squash'
  ): Promise<{ success: boolean; sha?: string; message?: string }> {
    try {
      const installationId = await this.getProjectInstallationId(projectId);
      const octokit = await this.getOctokit(installationId);

      const project = await prisma.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { repositoryUrl: true },
      });

      const [owner, repo] = this.ensureRepoUrl(project.repositoryUrl);

      const { data } = await octokit.pulls.merge({
        owner,
        repo,
        pull_number: prNumber,
        merge_method: mergeMethod,
      });

      return {
        success: data.merged,
        sha: data.sha,
        message: data.message,
      };
    } catch (error: any) {
      logger.error('Failed to merge PR:', { projectId, prNumber, error });

      // Check for specific errors
      if (error.status === 405) {
        return { success: false, message: 'PR has conflicts or checks failed' };
      }

      if (error.status === 404) {
        return { success: false, message: 'PR not found' };
      }

      return { success: false, message: error.message || 'Merge failed' };
    }
  }

  /**
   * Create GitHub Check Run
   */
  async createCheck(
    projectId: string,
    headSha: string,
    data: {
      name: string;
      status: 'queued' | 'in_progress' | 'completed';
      conclusion?: 'success' | 'failure' | 'neutral' | 'cancelled';
      output?: {
        title: string;
        summary: string;
        text?: string;
      };
    }
  ) {
    const installationId = await this.getProjectInstallationId(projectId);
    const octokit = await this.getOctokit(installationId);

    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { repositoryUrl: true },
    });

    const [owner, repo] = this.ensureRepoUrl(project.repositoryUrl);

    const { data: checkRun } = await octokit.checks.create({
      owner,
      repo,
      name: data.name,
      head_sha: headSha,
      status: data.status,
      conclusion: data.conclusion,
      output: data.output,
    });

    return checkRun;
  }

  /**
   * Add collaborator to repository
   */
  async addCollaborator(
    projectId: string,
    username: string,
    permission: 'pull' | 'push' | 'admin' = 'push'
  ) {
    const installationId = await this.getProjectInstallationId(projectId);
    const octokit = await this.getOctokit(installationId);

    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { repositoryUrl: true },
    });

    const [owner, repo] = this.ensureRepoUrl(project.repositoryUrl);

    await octokit.repos.addCollaborator({
      owner,
      repo,
      username,
      permission,
    });
  }

  /**
   * Get repository tree/structure
   */
  async getRepoTree(projectId: string, branch: string = 'main') {
    const installationId = await this.getProjectInstallationId(projectId);
    const octokit = await this.getOctokit(installationId);

    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { repositoryUrl: true },
    });

    const [owner, repo] = this.ensureRepoUrl(project.repositoryUrl);

    const { data } = await octokit.git.getTree({
      owner,
      repo,
      tree_sha: branch,
      recursive: 'true',
    });

    return data.tree;
  }

  /**
   * Get file content from repository
   */
  async getFileContent(projectId: string, path: string, ref: string = 'main'): Promise<string> {
    const installationId = await this.getProjectInstallationId(projectId);
    const octokit = await this.getOctokit(installationId);

    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { repositoryUrl: true },
    });

    const [owner, repo] = this.ensureRepoUrl(project.repositoryUrl);

    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    if ('content' in data) {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }

    throw new Error('Path is a directory, not a file');
  }

  /**
   * Check if GitHub App has required permissions on repository
   */
  async checkRepoAccess(projectId: string): Promise<{
    hasAccess: boolean;
    permissions: string[];
    missingPermissions: string[];
  }> {
    try {
      const installationId = await this.getProjectInstallationId(projectId);
      const installation = await this.app.octokit.request(
        'GET /app/installations/{installation_id}',
        { installation_id: installationId }
      );

      const requiredPermissions = ['contents', 'pull_requests', 'checks'];
      const grantedPermissions = Object.keys(installation.data.permissions || {});
      const missingPermissions = requiredPermissions.filter(
        (perm) => !grantedPermissions.includes(perm)
      );

      return {
        hasAccess: missingPermissions.length === 0,
        permissions: grantedPermissions,
        missingPermissions,
      };
    } catch (error) {
      logger.error('Failed to check repo access:', { projectId, error });
      return {
        hasAccess: false,
        permissions: [],
        missingPermissions: ['contents', 'pull_requests', 'checks'],
      };
    }
  }

  /**
   * Ensure repositoryUrl is not null and parse it
   */
  private ensureRepoUrl(repositoryUrl: string | null): [string, string] {
    if (!repositoryUrl) {
      throw new Error('Repository URL is required');
    }
    return this.parseRepoUrl(repositoryUrl);
  }

  /**
   * Get all installations for the GitHub App
   */
  async getInstallations() {
    try {
      const { data } = await this.app.octokit.request('GET /app/installations');
      return data;
    } catch (error) {
      logger.error('Failed to get installations:', error);
      throw error;
    }
  }

  /**
   * Get repositories accessible to a specific installation
   */
  async getInstallationRepositories(installationId: number) {
    try {
      const octokit = await this.getOctokit(installationId);
      const { data } = await octokit.request('GET /installation/repositories');
      return data.repositories;
    } catch (error) {
      logger.error('Failed to get installation repositories:', error);
      throw error;
    }
  }

  /**
   * Get all repositories accessible through GitHub App installations
   * This will return all repos from all installations
   */
  async getAllAccessibleRepositories() {
    try {
      const installations = await this.getInstallations();
      const allRepos = [];

      for (const installation of installations) {
        const repos = await this.getInstallationRepositories(installation.id);
        allRepos.push(...repos);
      }

      return allRepos;
    } catch (error) {
      logger.error('Failed to get all accessible repositories:', error);
      throw error;
    }
  }

  /**
   * Store GitHub installation in database
   */
  async storeInstallation(data: {
    installationId: string;
    accountId: string;
    accountLogin: string;
    accountType: string;
    targetType: string;
    userId: string;
    organizationId?: string;
    repositorySelection: string;
    selectedRepoIds?: number[];
    permissions?: any;
    events?: any;
  }) {
    try {
      return await prisma.gitHubInstallation.upsert({
        where: { installationId: data.installationId },
        create: {
          installationId: data.installationId,
          accountId: data.accountId,
          accountLogin: data.accountLogin,
          accountType: data.accountType,
          targetType: data.targetType,
          userId: data.userId,
          organizationId: data.organizationId,
          repositorySelection: data.repositorySelection,
          selectedRepoIds: data.selectedRepoIds ? JSON.stringify(data.selectedRepoIds) : null,
          permissions: data.permissions ? JSON.stringify(data.permissions) : null,
          events: data.events ? JSON.stringify(data.events) : null,
          isActive: true,
        },
        update: {
          accountId: data.accountId,
          accountLogin: data.accountLogin,
          accountType: data.accountType,
          targetType: data.targetType,
          repositorySelection: data.repositorySelection,
          selectedRepoIds: data.selectedRepoIds ? JSON.stringify(data.selectedRepoIds) : null,
          permissions: data.permissions ? JSON.stringify(data.permissions) : null,
          events: data.events ? JSON.stringify(data.events) : null,
          isActive: true,
          suspendedAt: null,
          suspendedBy: null,
        },
      });
    } catch (error) {
      logger.error('Failed to store installation:', error);
      throw error;
    }
  }

  /**
   * Get installation from database
   */
  async getInstallation(installationId: string) {
    try {
      return await prisma.gitHubInstallation.findUnique({
        where: { installationId },
      });
    } catch (error) {
      logger.error('Failed to get installation:', error);
      throw error;
    }
  }

  /**
   * Delete installation from database
   */
  async deleteInstallation(installationId: string) {
    try {
      return await prisma.gitHubInstallation.update({
        where: { installationId },
        data: { isActive: false },
      });
    } catch (error) {
      logger.error('Failed to delete installation:', error);
      throw error;
    }
  }

  /**
   * Suspend installation
   */
  async suspendInstallation(installationId: string, suspendedBy: string) {
    try {
      return await prisma.gitHubInstallation.update({
        where: { installationId },
        data: {
          isActive: false,
          suspendedAt: new Date(),
          suspendedBy,
        },
      });
    } catch (error) {
      logger.error('Failed to suspend installation:', error);
      throw error;
    }
  }

  /**
   * Update repository selection for installation
   */
  async updateRepositorySelection(
    installationId: string,
    repositorySelection: 'all' | 'selected',
    selectedRepoIds?: number[]
  ) {
    try {
      return await prisma.gitHubInstallation.update({
        where: { installationId },
        data: {
          repositorySelection,
          selectedRepoIds: selectedRepoIds ? JSON.stringify(selectedRepoIds) : null,
        },
      });
    } catch (error) {
      logger.error('Failed to update repository selection:', error);
      throw error;
    }
  }

  /**
   * Get user installations
   */
  async getUserInstallations(userId: string) {
    try {
      return await prisma.gitHubInstallation.findMany({
        where: { userId, isActive: true },
      });
    } catch (error) {
      logger.error('Failed to get user installations:', error);
      throw error;
    }
  }

  /**
   * Get organization installations
   */
  async getOrganizationInstallations(organizationId: string) {
    try {
      return await prisma.gitHubInstallation.findMany({
        where: { organizationId, isActive: true },
      });
    } catch (error) {
      logger.error('Failed to get organization installations:', error);
      throw error;
    }
  }

  /**
   * Handle installation callback after user installs the app
   */
  async handleInstallationCallback(
    installationId: string,
    userId: string,
    organizationId?: string | null
  ) {
    try {
      // Fetch installation details from GitHub
      const installation = await this.app.octokit.request(
        'GET /app/installations/{installation_id}',
        {
          installation_id: parseInt(installationId),
        }
      );

      const data = installation.data;

      // Store in database
      return await this.storeInstallation({
        installationId: data.id.toString(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        accountId: (data.account as any)?.id?.toString() || '',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        accountLogin: (data.account as any)?.login || '',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        accountType: (data.account as any)?.type || 'User',
        targetType: data.target_type,
        userId,
        organizationId: organizationId || undefined,
        repositorySelection: data.repository_selection,
        permissions: data.permissions,
        events: data.events,
      });
    } catch (error) {
      logger.error('Failed to handle installation callback:', error);
      throw error;
    }
  }

  /**
   * List repositories from a specific installation
   */
  async listInstallationRepositories(
    installationId: string,
    page: number = 1,
    perPage: number = 30
  ) {
    try {
      const octokit = await this.getOctokit(parseInt(installationId));
      const { data } = await octokit.request('GET /installation/repositories', {
        page,
        per_page: perPage,
      });

      return data.repositories;
    } catch (error) {
      logger.error('Failed to list installation repositories:', error);
      throw error;
    }
  }
}

export const githubAppService = new GitHubAppService();
