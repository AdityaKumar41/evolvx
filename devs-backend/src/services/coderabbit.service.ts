import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';

interface CodeRabbitConfig {
  apiUrl: string;
  apiKey: string;
}

interface PRAnalysisRequest {
  owner: string;
  repo: string;
  pullNumber: number;
  prDiff: string; // CRITICAL: Pre-fetched diff from GitHub App (CodeRabbit cannot read private repos)
  includeSecurityScan?: boolean;
  includeCodeQuality?: boolean;
  includeTestCoverage?: boolean;
}

interface PRAnalysisResult {
  summary: string;
  score: number; // 0-100
  issues: Array<{
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    category: string;
    message: string;
    file: string;
    line?: number;
    suggestion?: string;
  }>;
  securityFindings: Array<{
    type: string;
    severity: string;
    description: string;
    file: string;
    line?: number;
    cwe?: string;
  }>;
  codeQualityMetrics: {
    complexity: number;
    maintainability: number;
    testCoverage?: number;
    duplication?: number;
  };
  suggestions: string[];
  filesChanged: number;
  linesAdded: number;
  linesDeleted: number;
}

interface RepoInsightsRequest {
  owner: string;
  repo: string;
  branch?: string;
}

interface RepoInsightsResult {
  summary: string;
  techStack: string[];
  architecture: {
    patterns: string[];
    structure: string;
    dependencies: string[];
  };
  codeQuality: {
    overallScore: number;
    complexity: number;
    maintainability: number;
    documentation: number;
  };
  recommendations: string[];
  risks: Array<{
    type: string;
    severity: string;
    description: string;
  }>;
}

interface CodeReviewRequest {
  owner: string;
  repo: string;
  pullNumber: number;
  focusAreas?: string[];
}

interface CodeReviewResult {
  overallAssessment: string;
  approvalRecommendation: 'approve' | 'request_changes' | 'comment';
  comments: Array<{
    file: string;
    line: number;
    message: string;
    severity: string;
  }>;
  positives: string[];
  concerns: string[];
  suggestions: string[];
}

export class CodeRabbitService {
  private client: AxiosInstance;
  private config: CodeRabbitConfig;

  constructor() {
    this.config = {
      apiUrl: process.env.CODERABBIT_API_URL || 'https://api.coderabbit.ai/v1',
      apiKey: process.env.CODERABBIT_API_KEY || '',
    };

    if (!this.config.apiKey) {
      logger.warn('CodeRabbit API key not configured');
    }

    this.client = axios.create({
      baseURL: this.config.apiUrl,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000, // 60 seconds
    });
  }

  /**
   * Analyze a pull request comprehensively
   *
   * CRITICAL: CodeRabbit cannot access private repositories directly.
   * We MUST send the pre-fetched diff from GitHub App.
   */
  async analyzePR(request: PRAnalysisRequest): Promise<PRAnalysisResult> {
    try {
      logger.info(`Analyzing PR #${request.pullNumber} in ${request.owner}/${request.repo}`);

      if (!request.prDiff || request.prDiff.trim().length === 0) {
        throw new Error('PR diff is required for CodeRabbit analysis');
      }

      const response = await this.client.post('/analyze/pr', {
        repository: {
          owner: request.owner,
          name: request.repo,
        },
        pullRequest: {
          number: request.pullNumber,
          diff: request.prDiff, // Send pre-fetched diff body
        },
        options: {
          securityScan: request.includeSecurityScan ?? true,
          codeQuality: request.includeCodeQuality ?? true,
          testCoverage: request.includeTestCoverage ?? true,
        },
      });

      logger.info(`PR analysis completed for #${request.pullNumber}`);
      return response.data;
    } catch (error) {
      logger.error('Error analyzing PR with CodeRabbit:', error);
      throw new Error('Failed to analyze PR with CodeRabbit');
    }
  }

  /**
   * Get comprehensive repository insights
   */
  async getRepoInsights(request: RepoInsightsRequest): Promise<RepoInsightsResult> {
    try {
      logger.info(`Fetching repo insights for ${request.owner}/${request.repo}`);

      const response = await this.client.post('/analyze/repository', {
        repository: {
          owner: request.owner,
          name: request.repo,
          branch: request.branch || 'main',
        },
        options: {
          includeArchitecture: true,
          includeDependencies: true,
          includeQualityMetrics: true,
        },
      });

      logger.info(`Repo insights fetched for ${request.owner}/${request.repo}`);
      return response.data;
    } catch (error) {
      logger.error('Error fetching repo insights:', error);
      throw new Error('Failed to fetch repository insights');
    }
  }

  /**
   * Perform automated code review
   */
  async performCodeReview(request: CodeReviewRequest): Promise<CodeReviewResult> {
    try {
      logger.info(`Performing code review for PR #${request.pullNumber}`);

      const response = await this.client.post('/review/pr', {
        repository: {
          owner: request.owner,
          name: request.repo,
        },
        pullRequest: {
          number: request.pullNumber,
        },
        reviewSettings: {
          focusAreas: request.focusAreas || ['security', 'performance', 'best-practices'],
          strictness: 'balanced',
        },
      });

      logger.info(`Code review completed for PR #${request.pullNumber}`);
      return response.data;
    } catch (error) {
      logger.error('Error performing code review:', error);
      throw new Error('Failed to perform code review');
    }
  }

  /**
   * Check if PR meets acceptance criteria
   */
  async validatePRAgainstCriteria(
    owner: string,
    repo: string,
    pullNumber: number,
    acceptanceCriteria: string[]
  ): Promise<{
    passed: boolean;
    score: number;
    results: Array<{
      criterion: string;
      met: boolean;
      confidence: number;
      explanation: string;
    }>;
  }> {
    try {
      logger.info(`Validating PR #${pullNumber} against acceptance criteria`);

      const response = await this.client.post('/validate/criteria', {
        repository: {
          owner,
          name: repo,
        },
        pullRequest: {
          number: pullNumber,
        },
        criteria: acceptanceCriteria,
      });

      return response.data;
    } catch (error) {
      logger.error('Error validating PR criteria:', error);
      throw new Error('Failed to validate PR against criteria');
    }
  }

  /**
   * Detect code smells and anti-patterns
   */
  async detectCodeSmells(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<{
    smells: Array<{
      type: string;
      severity: string;
      file: string;
      line: number;
      description: string;
      refactoringHint: string;
    }>;
    antiPatterns: Array<{
      pattern: string;
      location: string;
      impact: string;
      recommendation: string;
    }>;
  }> {
    try {
      logger.info(`Detecting code smells in PR #${pullNumber}`);

      const response = await this.client.post('/analyze/smells', {
        repository: {
          owner,
          name: repo,
        },
        pullRequest: {
          number: pullNumber,
        },
      });

      return response.data;
    } catch (error) {
      logger.error('Error detecting code smells:', error);
      throw new Error('Failed to detect code smells');
    }
  }

  /**
   * Generate test suggestions for PR
   */
  async suggestTests(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<{
    suggestions: Array<{
      file: string;
      testType: string;
      description: string;
      priority: string;
      exampleTest?: string;
    }>;
    coverage: {
      current: number;
      recommended: number;
      gaps: string[];
    };
  }> {
    try {
      logger.info(`Generating test suggestions for PR #${pullNumber}`);

      const response = await this.client.post('/suggest/tests', {
        repository: {
          owner,
          name: repo,
        },
        pullRequest: {
          number: pullNumber,
        },
      });

      return response.data;
    } catch (error) {
      logger.error('Error suggesting tests:', error);
      throw new Error('Failed to generate test suggestions');
    }
  }

  /**
   * Estimate PR complexity and effort
   */
  async estimatePRComplexity(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<{
    complexity: number; // 1-100
    estimatedReviewTime: number; // minutes
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    factors: Array<{
      factor: string;
      impact: string;
      value: number;
    }>;
  }> {
    try {
      logger.info(`Estimating complexity for PR #${pullNumber}`);

      const response = await this.client.post('/analyze/complexity', {
        repository: {
          owner,
          name: repo,
        },
        pullRequest: {
          number: pullNumber,
        },
      });

      return response.data;
    } catch (error) {
      logger.error('Error estimating PR complexity:', error);
      throw new Error('Failed to estimate PR complexity');
    }
  }

  /**
   * Check for security vulnerabilities
   */
  async scanSecurity(
    owner: string,
    repo: string,
    pullNumber?: number
  ): Promise<{
    vulnerabilities: Array<{
      id: string;
      severity: 'critical' | 'high' | 'medium' | 'low';
      type: string;
      cwe: string;
      file: string;
      line?: number;
      description: string;
      remediation: string;
    }>;
    summary: {
      critical: number;
      high: number;
      medium: number;
      low: number;
    };
  }> {
    try {
      logger.info(`Scanning for security vulnerabilities in ${owner}/${repo}`);

      const response = await this.client.post('/scan/security', {
        repository: {
          owner,
          name: repo,
        },
        ...(pullNumber && { pullRequest: { number: pullNumber } }),
      });

      return response.data;
    } catch (error) {
      logger.error('Error scanning security:', error);
      throw new Error('Failed to scan for security vulnerabilities');
    }
  }

  /**
   * Get code quality trends over time
   */
  async getQualityTrends(
    owner: string,
    repo: string,
    timeframe: '7d' | '30d' | '90d' = '30d'
  ): Promise<{
    trends: {
      complexity: Array<{ date: string; value: number }>;
      maintainability: Array<{ date: string; value: number }>;
      testCoverage: Array<{ date: string; value: number }>;
    };
    insights: string[];
  }> {
    try {
      logger.info(`Fetching quality trends for ${owner}/${repo}`);

      const response = await this.client.post('/analyze/trends', {
        repository: {
          owner,
          name: repo,
        },
        timeframe,
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching quality trends:', error);
      throw new Error('Failed to fetch quality trends');
    }
  }

  /**
   * Check API health
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.status === 200;
    } catch (error) {
      logger.error('CodeRabbit API health check failed:', error);
      return false;
    }
  }

  /**
   * Analyze a repository and return high-level insights
   * This is a simplified version that wraps getRepoInsights
   */
  async analyzeRepository(repositoryUrl: string): Promise<{
    summary: string;
    technologies: string[];
    architecture: string;
    codeQuality: {
      score: number;
      issues: string[];
      strengths: string[];
    };
    recommendations: string[];
    complexity: 'low' | 'medium' | 'high';
  }> {
    try {
      // Parse repository URL to extract owner and repo
      const urlMatch = repositoryUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
      if (!urlMatch) {
        throw new Error('Invalid GitHub repository URL');
      }

      const owner = urlMatch[1];
      const repo = urlMatch[2].replace('.git', '');

      logger.info(`[CodeRabbit] Analyzing repository: ${owner}/${repo}`);

      // Use existing getRepoInsights method
      const insights = await this.getRepoInsights({ owner, repo });

      // Transform to expected format
      return {
        summary: insights.summary,
        technologies: insights.techStack,
        architecture: insights.architecture.structure,
        codeQuality: {
          score: insights.codeQuality.overallScore,
          issues: insights.risks.map((r) => r.description),
          strengths: insights.recommendations.filter(
            (r) => r.includes('good') || r.includes('well')
          ),
        },
        recommendations: insights.recommendations,
        complexity: this.determineComplexity(insights.codeQuality.complexity),
      };
    } catch (error: unknown) {
      const err = error as { message?: string };
      logger.warn(`[CodeRabbit] Analysis failed: ${err.message || 'Unknown error'}`);
      logger.debug('[CodeRabbit] Falling back to basic repository analysis');
      // Return fallback analysis if CodeRabbit fails
      return {
        summary: 'Repository structure detected. CodeRabbit analysis unavailable.',
        technologies: [],
        architecture: 'Standard application structure',
        codeQuality: {
          score: 70,
          issues: [],
          strengths: ['Repository follows standard conventions'],
        },
        recommendations: ['Review repository structure', 'Ensure proper documentation'],
        complexity: 'medium',
      };
    }
  }

  private determineComplexity(complexityScore: number): 'low' | 'medium' | 'high' {
    if (complexityScore < 30) return 'low';
    if (complexityScore < 70) return 'medium';
    return 'high';
  }
}

export const codeRabbitService = new CodeRabbitService();
