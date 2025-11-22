import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { logger } from '../utils/logger';
import { githubService } from './github.service';
import { aiOrchestrator } from './ai.service';
import { qdrantClient, QDRANT_COLLECTIONS } from '../lib/qdrant';

export interface FileAnalysis {
  filePath: string;
  language: string;
  purpose: string;
  complexity: 'low' | 'medium' | 'high';
  dependencies: string[];
  exports: string[];
  summary: string;
}

export interface CodeChunk {
  content: string;
  startLine: number;
  endLine: number;
  context: string; // function name, class name, etc.
}

/**
 * Repository Analyzer Service
 * Performs deep analysis of code repositories using Claude AI and CodeRabbit
 */
export class RepositoryAnalyzerService {
  private readonly claudeModel = anthropic('claude-3-5-haiku-latest');
  private readonly maxFileSize = 100000; // 100KB
  private readonly chunkSize = 2000; // characters
  private readonly chunkOverlap = 200;

  /**
   * Analyze entire repository
   */
  async analyzeRepository(
    projectId: string,
    repositoryUrl: string,
    accessToken?: string
  ): Promise<{
    filesAnalyzed: number;
    embeddingsCreated: number;
    technologies: string[];
    complexity: string;
  }> {
    try {
      logger.info(`[RepoAnalyzer] Starting analysis for project ${projectId}`);

      // Create GitHub service instance with user's access token
      const userGithubService = accessToken
        ? new (githubService.constructor as any)(accessToken)
        : githubService;

      // Get file tree from GitHub
      const { owner, repo } = userGithubService.parseRepoUrl(repositoryUrl);

      // Get default branch first
      const repoData = await userGithubService.getRepository(owner, repo);
      const defaultBranch = repoData.default_branch || 'main';
      logger.info(`[RepoAnalyzer] Using branch: ${defaultBranch}`);

      const structure = await userGithubService.getRepoStructure(owner, repo, '', defaultBranch);

      // Build file list
      const files = await this.buildFileList(
        owner,
        repo,
        structure,
        userGithubService,
        '',
        defaultBranch
      );
      const codeFiles = files.filter((f) => this.isCodeFile(f.path));

      logger.info(`[RepoAnalyzer] Found ${codeFiles.length} code files to analyze`);

      let filesAnalyzed = 0;
      let embeddingsCreated = 0;
      const detectedTechnologies = new Set<string>();

      // Process files in batches
      const batchSize = 5; // Reduced batch size for better stability
      for (let i = 0; i < codeFiles.length; i += batchSize) {
        const batch = codeFiles.slice(i, i + batchSize);

        const results = await Promise.allSettled(
          batch.map(async (file) => {
            try {
              const content = await userGithubService.getFileContent(
                owner,
                repo,
                file.path,
                defaultBranch
              );

              if (!content || content.length === 0) {
                logger.warn(`[RepoAnalyzer] Empty content for ${file.path}`);
                return { analyzed: false, embeddings: 0 };
              }

              // Skip very large files
              if (content.length > this.maxFileSize) {
                logger.warn(`[RepoAnalyzer] Skipping large file: ${file.path}`);
                return { analyzed: false, embeddings: 0 };
              }

              // Analyze file with Claude
              const analysis = await this.analyzeFile(file.path, content);

              // Collect technologies
              detectedTechnologies.add(analysis.language);
              analysis.dependencies.forEach((dep) => {
                // Extract technology from dependencies
                const tech = this.extractTechnologyFromDependency(dep);
                if (tech) detectedTechnologies.add(tech);
              });

              // Chunk and embed
              const chunks = this.chunkFile(content, file.path);
              const embeddings = await this.storeFileEmbeddings(
                projectId,
                repositoryUrl,
                file.path,
                chunks,
                analysis
              );

              logger.info(`[RepoAnalyzer] ✓ ${file.path}: ${embeddings} embeddings created`);
              return { analyzed: true, embeddings };
            } catch (error) {
              logger.error(`[RepoAnalyzer] Failed to analyze ${file.path}:`, error);
              return { analyzed: false, embeddings: 0 };
            }
          })
        );

        // Count successes
        results.forEach((result) => {
          if (result.status === 'fulfilled' && result.value.analyzed) {
            filesAnalyzed++;
            embeddingsCreated += result.value.embeddings;
          }
        });

        // Emit progress event via Kafka
        const progress = Math.round((filesAnalyzed / codeFiles.length) * 100);
        try {
          const { publishEvent, KAFKA_TOPICS } = await import('../lib/kafka');
          await publishEvent(KAFKA_TOPICS.REPO_ANALYSIS_PROGRESS, {
            projectId,
            filesAnalyzed,
            totalFiles: codeFiles.length,
            embeddingsCreated,
            progress,
            currentBatch: Math.floor(i / batchSize) + 1,
            totalBatches: Math.ceil(codeFiles.length / batchSize),
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          logger.error('[RepoAnalyzer] Failed to emit progress event:', error);
        }

        logger.info(
          `[RepoAnalyzer] Progress: ${filesAnalyzed}/${codeFiles.length} files analyzed (${progress}%)`
        );
      }

      // Calculate complexity based on files analyzed
      const avgComplexity = this.calculateOverallComplexity(filesAnalyzed, codeFiles.length);

      const result = {
        filesAnalyzed,
        embeddingsCreated,
        technologies: Array.from(detectedTechnologies),
        complexity: avgComplexity,
      };

      logger.info(`[RepoAnalyzer] ✓ Analysis complete:`, result);
      return result;
    } catch (error) {
      logger.error('[RepoAnalyzer] Repository analysis failed:', error);
      throw error;
    }
  }

  /**
   * Analyze a single file using Claude AI
   */
  private async analyzeFile(filePath: string, content: string): Promise<FileAnalysis> {
    try {
      const language = this.detectLanguage(filePath);

      const prompt = `Analyze this ${language} code file and provide a structured analysis.

File: ${filePath}

Code:
\`\`\`${language}
${content.substring(0, 4000)} ${content.length > 4000 ? '...(truncated)' : ''}
\`\`\`

Provide:
1. Purpose: What does this file do? (1-2 sentences)
2. Complexity: low, medium, or high
3. Dependencies: List of imported modules/packages
4. Exports: List of exported functions/classes/variables
5. Summary: Brief technical summary (2-3 sentences)

Format as JSON:
{
  "purpose": "...",
  "complexity": "low|medium|high",
  "dependencies": ["..."],
  "exports": ["..."],
  "summary": "..."
}`;

      const result = await generateText({
        model: this.claudeModel,
        prompt,
        temperature: 0.3,
      });

      // Parse JSON response
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Failed to parse Claude response');
      }

      const analysis = JSON.parse(jsonMatch[0]);

      return {
        filePath,
        language,
        purpose: analysis.purpose || 'Unknown',
        complexity: analysis.complexity || 'medium',
        dependencies: analysis.dependencies || [],
        exports: analysis.exports || [],
        summary: analysis.summary || '',
      };
    } catch (error) {
      logger.error(`[RepoAnalyzer] Failed to analyze file ${filePath}:`, error);
      // Return basic analysis on error
      return {
        filePath,
        language: this.detectLanguage(filePath),
        purpose: 'Analysis failed',
        complexity: 'medium',
        dependencies: [],
        exports: [],
        summary: '',
      };
    }
  }

  /**
   * Chunk file content intelligently
   */
  private chunkFile(content: string, filePath: string): CodeChunk[] {
    const chunks: CodeChunk[] = [];
    const lines = content.split('\n');

    let currentChunk = '';
    let startLine = 0;
    let currentLine = 0;

    for (const line of lines) {
      currentChunk += line + '\n';
      currentLine++;

      if (currentChunk.length >= this.chunkSize) {
        chunks.push({
          content: currentChunk,
          startLine,
          endLine: currentLine,
          context: this.extractContext(currentChunk, filePath),
        });

        // Overlap
        const overlapLines = Math.floor(this.chunkOverlap / 50); // ~50 chars per line
        startLine = currentLine - overlapLines;
        currentChunk = lines.slice(startLine, currentLine).join('\n') + '\n';
      }
    }

    // Add remaining content
    if (currentChunk.trim()) {
      chunks.push({
        content: currentChunk,
        startLine,
        endLine: currentLine,
        context: this.extractContext(currentChunk, filePath),
      });
    }

    return chunks;
  }

  /**
   * Extract context from chunk (function/class name)
   */
  private extractContext(chunk: string, filePath: string): string {
    // Try to find function or class declaration
    const functionMatch = chunk.match(/(?:function|const|let|var)\s+(\w+)/);
    const classMatch = chunk.match(/class\s+(\w+)/);

    if (classMatch) return `class ${classMatch[1]}`;
    if (functionMatch) return `function ${functionMatch[1]}`;

    return filePath.split('/').pop() || 'unknown';
  }

  /**
   * Store file embeddings in Qdrant
   */
  private async storeFileEmbeddings(
    projectId: string,
    repositoryUrl: string,
    filePath: string,
    chunks: CodeChunk[],
    analysis: FileAnalysis
  ): Promise<number> {
    try {
      const points = await Promise.all(
        chunks.map(async (chunk, index) => {
          // Generate embedding
          const embedding = await aiOrchestrator.generateEmbedding(chunk.content);

          // Create a safe ID by hashing the combination
          const crypto = await import('crypto');
          const idString = `${projectId}-${filePath}-${index}`;
          const pointId = crypto.createHash('md5').update(idString).digest('hex');

          return {
            id: pointId,
            vector: embedding,
            payload: {
              projectId,
              repositoryUrl,
              filePath,
              fileType: analysis.language,
              content: chunk.content,
              chunkIndex: index,
              totalChunks: chunks.length,
              startLine: chunk.startLine,
              endLine: chunk.endLine,
              context: chunk.context,
              // Analysis metadata
              purpose: analysis.purpose,
              complexity: analysis.complexity,
              dependencies: analysis.dependencies,
              exports: analysis.exports,
              summary: analysis.summary,
              lastUpdated: new Date().toISOString(),
            },
          };
        })
      );

      // Bulk upsert to Qdrant
      await qdrantClient.upsert(QDRANT_COLLECTIONS.REPO_EMBEDDINGS, {
        wait: true,
        points,
      });

      return points.length;
    } catch (error) {
      logger.error(`[RepoAnalyzer] Failed to store embeddings for ${filePath}:`, error);
      return 0;
    }
  }

  /**
   * Build file list recursively
   */
  private async buildFileList(
    owner: string,
    repo: string,
    structure: any,
    githubServiceInstance: any,
    basePath: string = '',
    branch?: string
  ): Promise<Array<{ path: string; type: string }>> {
    const files: Array<{ path: string; type: string }> = [];

    if (!Array.isArray(structure)) {
      structure = [structure];
    }

    for (const item of structure) {
      const fullPath = basePath ? `${basePath}/${item.name}` : item.name;

      if (item.type === 'file') {
        files.push({ path: fullPath, type: 'file' });
      } else if (item.type === 'dir') {
        try {
          const dirStructure = await githubServiceInstance.getRepoStructure(
            owner,
            repo,
            fullPath,
            branch
          );
          const subFiles = await this.buildFileList(
            owner,
            repo,
            dirStructure,
            githubServiceInstance,
            fullPath,
            branch
          );
          files.push(...subFiles);
        } catch (error) {
          logger.warn(`[RepoAnalyzer] Failed to read directory ${fullPath}:`, error);
        }
      }
    }

    return files;
  }

  /**
   * Check if file should be analyzed
   */
  private isCodeFile(filePath: string): boolean {
    const excludePatterns = [
      /node_modules/,
      /dist\//,
      /build\//,
      /\.git\//,
      /\.next\//,
      /coverage\//,
      /\.lock$/,
      /package-lock\.json$/,
      /yarn\.lock$/,
      /pnpm-lock\.yaml$/,
      /\.min\./,
      /\.map$/,
    ];

    if (excludePatterns.some((pattern) => pattern.test(filePath))) {
      return false;
    }

    const codeExtensions = [
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.py',
      '.go',
      '.rs',
      '.java',
      '.c',
      '.cpp',
      '.h',
      '.hpp',
      '.cs',
      '.rb',
      '.php',
      '.swift',
      '.kt',
    ];

    return codeExtensions.some((ext) => filePath.endsWith(ext));
  }

  /**
   * Detect programming language from file extension
   */
  private detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      go: 'go',
      rs: 'rust',
      java: 'java',
      rb: 'ruby',
      php: 'php',
      c: 'c',
      cpp: 'cpp',
      h: 'c',
      hpp: 'cpp',
      cs: 'csharp',
      swift: 'swift',
      kt: 'kotlin',
    };

    return languageMap[ext || ''] || ext || 'unknown';
  }

  /**
   * Extract technology name from dependency string
   */
  private extractTechnologyFromDependency(dep: string): string | null {
    // Remove common prefixes
    const clean = dep
      .replace(/^(@|\.|\/)/, '')
      .split('/')[0]
      .split('@')[0];

    // Filter out noise
    if (clean.length < 3 || clean.startsWith('.')) return null;

    return clean;
  }

  /**
   * Calculate overall complexity based on files analyzed
   */
  private calculateOverallComplexity(filesAnalyzed: number, totalFiles: number): string {
    const ratio = filesAnalyzed / totalFiles;

    if (ratio < 0.3) return 'low';
    if (ratio < 0.7) return 'medium';
    return 'high';
  }

  /**
   * Get comprehensive repository context from Qdrant
   * Returns detailed analysis including file purposes, architecture, and key patterns
   */
  async getRepositoryContext(
    projectId: string,
    query?: string,
    limit: number = 20
  ): Promise<{
    overview: string;
    files: Array<{
      path: string;
      purpose: string;
      complexity: string;
      language: string;
      summary: string;
      dependencies: string[];
      exports: string[];
    }>;
    architecture: string;
    technologies: string[];
    keyPatterns: string[];
  }> {
    try {
      logger.info(`[RepoAnalyzer] Getting repository context for project ${projectId}`);

      // Generate embedding for query if provided
      let queryEmbedding: number[] | undefined;
      if (query) {
        queryEmbedding = await aiOrchestrator.generateEmbedding(query);
      }

      // Search Qdrant for relevant code chunks
      const searchResults = await qdrantClient.search(QDRANT_COLLECTIONS.REPO_EMBEDDINGS, {
        vector:
          queryEmbedding ||
          (await aiOrchestrator.generateEmbedding('project overview architecture structure')),
        filter: {
          must: [{ key: 'projectId', match: { value: projectId } }],
        },
        limit,
        with_payload: true,
      });

      if (searchResults.length === 0) {
        logger.warn(`[RepoAnalyzer] No embeddings found for project ${projectId}`);
        return {
          overview: 'No repository analysis available yet.',
          files: [],
          architecture: 'Unknown',
          technologies: [],
          keyPatterns: [],
        };
      }

      // Group results by file path and collect code snippets
      const fileMap = new Map<string, any>();
      const allTechnologies = new Set<string>();
      const allDependencies = new Set<string>();
      const codeSnippets = new Map<string, string[]>();

      for (const result of searchResults) {
        const payload = result.payload as any;

        if (!fileMap.has(payload.filePath)) {
          fileMap.set(payload.filePath, {
            path: payload.filePath,
            purpose: payload.purpose || 'Unknown',
            complexity: payload.complexity || 'medium',
            language: payload.fileType || 'unknown',
            summary: payload.summary || '',
            dependencies: payload.dependencies || [],
            exports: payload.exports || [],
            relevanceScore: result.score,
            context: payload.context || '',
          });

          // Collect technologies
          if (payload.fileType) allTechnologies.add(payload.fileType);
          if (payload.dependencies) {
            payload.dependencies.forEach((dep: string) => {
              allDependencies.add(dep);
              const tech = this.extractTechnologyFromDependency(dep);
              if (tech) allTechnologies.add(tech);
            });
          }
        }

        // Collect code snippets (top 2 per file)
        if (payload.content && result.score > 0.7) {
          if (!codeSnippets.has(payload.filePath)) {
            codeSnippets.set(payload.filePath, []);
          }
          const snippets = codeSnippets.get(payload.filePath)!;
          if (snippets.length < 2) {
            // Store snippet with context
            const snippet = `// Context: ${payload.context}\n${payload.content.substring(0, 400)}${payload.content.length > 400 ? '...' : ''}`;
            snippets.push(snippet);
          }
        }
      }

      // Add code snippets to files
      fileMap.forEach((file, path) => {
        if (codeSnippets.has(path)) {
          file.codeSnippets = codeSnippets.get(path);
        }
      });

      const files = Array.from(fileMap.values()).sort(
        (a, b) => b.relevanceScore - a.relevanceScore
      );

      // Analyze architecture patterns
      const architecture = this.inferArchitecture(files);
      const keyPatterns = this.extractKeyPatterns(files);

      // Build comprehensive overview
      const overview = this.buildRepositoryOverview(
        files,
        Array.from(allTechnologies),
        architecture
      );

      logger.info(`[RepoAnalyzer] Retrieved context for ${files.length} files`);

      return {
        overview,
        files: files.slice(0, 15), // Return top 15 most relevant files
        architecture,
        technologies: Array.from(allTechnologies),
        keyPatterns,
      };
    } catch (error) {
      logger.error(`[RepoAnalyzer] Failed to get repository context:`, error);
      throw error;
    }
  }

  /**
   * Infer architecture from file structure
   */
  private inferArchitecture(files: any[]): string {
    const paths = files.map((f) => f.path.toLowerCase());

    const patterns = {
      'Next.js': paths.some(
        (p) => p.includes('app/') || p.includes('pages/') || p.includes('next.config')
      ),
      React: paths.some((p) => p.includes('component') || p.includes('.jsx') || p.includes('.tsx')),
      Microservices: paths.some((p) => p.includes('service') && !p.includes('services/')),
      Monorepo: paths.some((p) => p.includes('packages/') || p.includes('apps/')),
      MVC: paths.some(
        (p) => p.includes('models/') && p.includes('views/') && p.includes('controllers/')
      ),
      Layered: paths.some(
        (p) => (p.includes('controllers/') || p.includes('routes/')) && p.includes('services/')
      ),
      'API-first': paths.some((p) => p.includes('api/') || p.includes('routes/')),
    };

    const detected = Object.entries(patterns)
      .filter(([_, exists]) => exists)
      .map(([name, _]) => name);

    return detected.length > 0 ? detected.join(' + ') : 'Custom Architecture';
  }

  /**
   * Extract key programming patterns
   */
  private extractKeyPatterns(files: any[]): string[] {
    const patterns = new Set<string>();

    files.forEach((file) => {
      // Check for common patterns in file paths and purposes
      if (file.path.includes('middleware')) patterns.add('Middleware Pattern');
      if (file.path.includes('hook')) patterns.add('React Hooks');
      if (file.path.includes('context')) patterns.add('Context API');
      if (file.path.includes('store') || file.path.includes('redux'))
        patterns.add('State Management');
      if (file.path.includes('util') || file.path.includes('helper'))
        patterns.add('Utility Functions');
      if (file.path.includes('schema') || file.path.includes('model')) patterns.add('Data Models');
      if (file.path.includes('test.') || file.path.includes('.test.')) patterns.add('Testing');
      if (file.path.includes('inngest') || file.path.includes('worker'))
        patterns.add('Background Jobs');
      if (file.path.includes('webhook')) patterns.add('Webhooks');
      if (file.exports && file.exports.length > 5) patterns.add('Modular Exports');
      if (file.complexity === 'high') patterns.add('Complex Logic');
    });

    return Array.from(patterns).slice(0, 8); // Top 8 patterns
  }

  /**
   * Build comprehensive repository overview
   */
  private buildRepositoryOverview(
    files: any[],
    technologies: string[],
    architecture: string
  ): string {
    const filesByType = files.reduce(
      (acc, file) => {
        acc[file.language] = (acc[file.language] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const complexFiles = files.filter((f) => f.complexity === 'high').length;
    const mediumFiles = files.filter((f) => f.complexity === 'medium').length;

    // Extract common dependencies and patterns
    const allDeps = new Set<string>();
    const allExports = new Set<string>();
    files.forEach((f) => {
      f.dependencies?.forEach((dep: string) => allDeps.add(dep));
      f.exports?.forEach((exp: string) => allExports.add(exp));
    });

    // Categorize files by type
    const components = files.filter((f) => f.path.includes('component'));
    const apis = files.filter((f) => f.path.includes('api/') || f.path.includes('route'));
    const pages = files.filter((f) => f.path.includes('app/') || f.path.includes('pages/'));
    const libs = files.filter((f) => f.path.includes('lib/') || f.path.includes('utils/'));

    return `
# Repository Overview

## Architecture
${architecture}

## Technology Stack
${technologies.slice(0, 15).join(', ')}

## Project Structure
- **Components**: ${components.length} file(s) - UI building blocks
- **API/Routes**: ${apis.length} file(s) - Backend endpoints and API handlers
- **Pages**: ${pages.length} file(s) - Application pages and layouts
- **Libraries/Utils**: ${libs.length} file(s) - Shared utilities and helpers

## File Distribution by Language
${Object.entries(filesByType)
  .sort(([, a], [, b]) => (b as number) - (a as number))
  .map(([lang, count]) => `- ${lang}: ${count} file(s)`)
  .join('\n')}

## Complexity Analysis
- High complexity: ${complexFiles} file(s) - Complex business logic or large components
- Medium complexity: ${mediumFiles} file(s) - Standard features with moderate logic
- Low complexity: ${files.length - complexFiles - mediumFiles} file(s) - Simple utilities, configs, types

## Common Dependencies
${Array.from(allDeps)
  .slice(0, 15)
  .map((dep) => `- ${dep}`)
  .join('\n')}

## Key Exports (Functions/Components Available)
${Array.from(allExports)
  .slice(0, 15)
  .map((exp) => `- ${exp}`)
  .join('\n')}

## Detailed File Analysis

${files
  .slice(0, 10)
  .map(
    (f, i) => `### ${i + 1}. \`${f.path}\`
**Language**: ${f.language} | **Complexity**: ${f.complexity} | **Context**: ${f.context || 'General'}

**Purpose**: ${f.purpose}

**Summary**: ${f.summary || 'No detailed summary available'}

**Exports**: ${f.exports && f.exports.length > 0 ? f.exports.slice(0, 8).join(', ') + (f.exports.length > 8 ? `, and ${f.exports.length - 8} more` : '') : 'None'}

**Dependencies**: ${f.dependencies && f.dependencies.length > 0 ? f.dependencies.slice(0, 8).join(', ') + (f.dependencies.length > 8 ? `, and ${f.dependencies.length - 8} more` : '') : 'None'}
${
  f.codeSnippets && f.codeSnippets.length > 0
    ? `
**Code Sample**:
\`\`\`${f.language}
${f.codeSnippets[0]}
\`\`\`
`
    : ''
}`
  )
  .join('\n\n---\n\n')}
    `.trim();
  }
}

export const repositoryAnalyzerService = new RepositoryAnalyzerService();
