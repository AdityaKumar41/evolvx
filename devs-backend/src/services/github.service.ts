import { Octokit } from '@octokit/rest';
import { config } from '../config';
import { logger } from '../utils/logger';

export class GitHubService {
  public octokit: Octokit;

  constructor(accessToken?: string) {
    this.octokit = new Octokit({
      auth: accessToken || config.github.clientSecret, // Use user token if provided, otherwise fallback to client secret
    });
  }

  async getCommit(owner: string, repo: string, commitSha: string) {
    try {
      const response = await this.octokit.repos.getCommit({
        owner,
        repo,
        ref: commitSha,
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to get commit:', error);
      throw error;
    }
  }

  async getPullRequest(owner: string, repo: string, prNumber: number) {
    try {
      const response = await this.octokit.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to get PR:', error);
      throw error;
    }
  }

  async getPullRequestDiff(owner: string, repo: string, prNumber: number): Promise<string> {
    try {
      const response = await this.octokit.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
        mediaType: {
          format: 'diff',
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return response.data as any;
    } catch (error) {
      logger.error('Failed to get PR diff:', error);
      throw error;
    }
  }

  async createCheckRun(owner: string, repo: string, headSha: string, name: string) {
    try {
      const response = await this.octokit.checks.create({
        owner,
        repo,
        name,
        head_sha: headSha,
        status: 'in_progress',
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to create check run:', error);
      throw error;
    }
  }

  async updateCheckRun(
    owner: string,
    repo: string,
    checkRunId: number,
    status: 'completed',
    conclusion: 'success' | 'failure' | 'neutral',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    output?: any
  ) {
    try {
      const response = await this.octokit.checks.update({
        owner,
        repo,
        check_run_id: checkRunId,
        status,
        conclusion,
        output,
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to update check run:', error);
      throw error;
    }
  }

  async getRepository(owner: string, repo: string) {
    try {
      const response = await this.octokit.repos.get({
        owner,
        repo,
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to get repository:', error);
      throw error;
    }
  }

  async getFileContent(owner: string, repo: string, path: string, ref?: string): Promise<string> {
    try {
      const response = await this.octokit.repos.getContent({
        owner,
        repo,
        path,
        ref,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const content = response.data as any;
      if (content.content) {
        return Buffer.from(content.content, 'base64').toString('utf-8');
      }

      throw new Error('File content not found');
    } catch (error) {
      logger.error('Failed to get file content:', error);
      throw error;
    }
  }

  /**
   * Add a collaborator to a repository (for private repo access)
   */
  async addCollaborator(repositoryUrl: string, username: string) {
    try {
      const { owner, repo } = this.parseRepoUrl(repositoryUrl);

      const response = await this.octokit.repos.addCollaborator({
        owner,
        repo,
        username,
        permission: 'pull', // Read-only access
      });

      logger.info(`Added collaborator ${username} to ${owner}/${repo}`);
      return {
        invitationId: response.data.id?.toString(),
        status: response.status,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      logger.error('Failed to add collaborator:', error);
      throw new Error(`Failed to add collaborator: ${error.message}`);
    }
  }

  /**
   * Check if a user is a collaborator on a repository
   */
  async checkCollaborator(repositoryUrl: string, username: string): Promise<boolean> {
    try {
      const { owner, repo } = this.parseRepoUrl(repositoryUrl);

      await this.octokit.repos.checkCollaborator({
        owner,
        repo,
        username,
      });

      return true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      if (error.status === 404) {
        return false;
      }
      logger.error('Failed to check collaborator:', error);
      throw error;
    }
  }

  /**
   * Remove a collaborator from a repository
   */
  async removeCollaborator(repositoryUrl: string, username: string) {
    try {
      const { owner, repo } = this.parseRepoUrl(repositoryUrl);

      await this.octokit.repos.removeCollaborator({
        owner,
        repo,
        username,
      });

      logger.info(`Removed collaborator ${username} from ${owner}/${repo}`);
      return { success: true };
    } catch (error) {
      logger.error('Failed to remove collaborator:', error);
      throw error;
    }
  }

  /**
   * Get repository structure (file tree)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getRepoStructure(
    owner: string,
    repo: string,
    path: string = '',
    ref?: string
  ): Promise<any> {
    try {
      const response = await this.octokit.repos.getContent({
        owner,
        repo,
        path,
        ...(ref && { ref }),
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to get repo structure:', error);
      throw error;
    }
  }

  /**
   * Get README from repository
   */
  async getReadme(repositoryUrl: string): Promise<string> {
    try {
      const { owner, repo } = this.parseRepoUrl(repositoryUrl);

      try {
        // Try to get README.md
        const content = await this.getFileContent(owner, repo, 'README.md');
        return content;
      } catch (error) {
        // Try README (no extension)
        try {
          const content = await this.getFileContent(owner, repo, 'README');
          return content;
        } catch {
          logger.warn(`No README found for ${owner}/${repo}`);
          return '';
        }
      }
    } catch (error) {
      logger.error('Failed to get README:', error);
      return '';
    }
  }

  /**
   * Detect technologies used in repository based on file structure
   */
  detectTechnologies(structure: any): string[] {
    try {
      const technologies: Set<string> = new Set();

      if (!Array.isArray(structure)) {
        return [];
      }

      // Check for common files/patterns
      const fileChecks: Record<string, string[]> = {
        'package.json': ['Node.js', 'JavaScript'],
        'tsconfig.json': ['TypeScript'],
        'requirements.txt': ['Python'],
        Pipfile: ['Python'],
        'Cargo.toml': ['Rust'],
        'go.mod': ['Go'],
        'pom.xml': ['Java', 'Maven'],
        'build.gradle': ['Java', 'Gradle'],
        Dockerfile: ['Docker'],
        'docker-compose.yml': ['Docker Compose'],
        '.github': ['GitHub Actions'],
        prisma: ['Prisma'],
        'next.config': ['Next.js'],
        'vite.config': ['Vite'],
        'webpack.config': ['Webpack'],
      };

      structure.forEach((item: any) => {
        const name = item.name || '';

        Object.entries(fileChecks).forEach(([pattern, techs]) => {
          if (name.includes(pattern)) {
            techs.forEach((tech) => technologies.add(tech));
          }
        });
      });

      return Array.from(technologies);
    } catch (error) {
      logger.error('Failed to detect technologies:', error);
      return [];
    }
  }

  /**
   * Parse GitHub repository URL to extract owner and repo
   */
  public parseRepoUrl(url: string): { owner: string; repo: string } {
    try {
      // Handle formats: https://github.com/owner/repo or git@github.com:owner/repo.git
      const match = url.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
      if (!match) {
        throw new Error('Invalid GitHub repository URL');
      }

      return {
        owner: match[1],
        repo: match[2].replace('.git', ''),
      };
    } catch (error) {
      logger.error('Failed to parse repository URL:', error);
      throw new Error('Invalid GitHub repository URL format');
    }
  }

  /**
   * Get repository from URL (helper)
   */
  async getRepositoryFromUrl(repositoryUrl: string) {
    try {
      const { owner, repo } = this.parseRepoUrl(repositoryUrl);
      return await this.getRepository(owner, repo);
    } catch (error) {
      logger.error('Failed to get repository from URL:', error);
      throw error;
    }
  }

  /**
   * Merge a pull request
   */
  async mergePR(
    owner: string,
    repo: string,
    prNumber: number,
    mergeMethod: 'merge' | 'squash' | 'rebase' = 'squash'
  ): Promise<boolean> {
    try {
      const octokit = this.octokit;
      const response = await octokit.pulls.merge({
        owner,
        repo,
        pull_number: prNumber,
        merge_method: mergeMethod,
      });

      logger.info(`PR #${prNumber} merged successfully in ${owner}/${repo}`);
      return response.status === 200;
    } catch (error: any) {
      logger.error(`Failed to merge PR #${prNumber}:`, error);
      if (error.status === 405) {
        logger.error('PR cannot be merged - may not be mergeable or checks not passing');
      }
      return false;
    }
  }

  /**
   * Create a check run for PR status
   */
  async createCheck(
    owner: string,
    repo: string,
    sha: string,
    status: 'queued' | 'in_progress' | 'completed',
    conclusion?:
      | 'success'
      | 'failure'
      | 'neutral'
      | 'cancelled'
      | 'skipped'
      | 'timed_out'
      | 'action_required'
  ): Promise<any> {
    try {
      const octokit = this.octokit;
      const checkData: any = {
        owner,
        repo,
        name: 'DevSponsor AI Review',
        head_sha: sha,
        status,
      };

      if (status === 'completed' && conclusion) {
        checkData.conclusion = conclusion;
      }

      const response = await octokit.checks.create(checkData);
      return response.data;
    } catch (error) {
      logger.error('Failed to create check:', error);
      throw error;
    }
  }
}

export const githubService = new GitHubService();
