import { prisma } from '../lib/prisma';
import { qdrantClient } from '../lib/qdrant';
import { githubService } from './github.service';

export interface AIContext {
  submilestone: {
    id: string;
    description: string;
    acceptanceCriteria: unknown;
    points: number;
    status: string;
  } | null;
  milestone: {
    id: string;
    title: string;
    description: string | null;
  } | null;
  project: {
    id: string;
    title: string;
    description: string | null;
    repositoryUrl: string | null;
  };
  documents: Array<{
    id: string;
    title: string;
    type: string;
    relevantChunks: string[];
  }>;
  uiTemplates: Array<{
    id: string;
    name: string;
    colors: Record<string, unknown>;
    fonts: Record<string, unknown>;
    components: Record<string, unknown>;
    layout: Record<string, unknown>;
  }>;
  repoStructure: {
    files: string[];
    directories: string[];
    mainFiles: string[];
  } | null;
  relatedSubmilestones: Array<{
    id: string;
    description: string;
    status: string;
  }>;
}

class AIContextService {
  private readonly QDRANT_COLLECTION = 'dev-sponsor';
  private readonly MAX_CHUNKS = 5;
  private readonly SIMILARITY_THRESHOLD = 0.7;

  /**
   * Build complete context for AI sidebar
   */
  async buildContext(
    _userId: string,
    projectId: string,
    submilestoneId?: string
  ): Promise<AIContext> {
    // Fetch project details
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        documents: true,
        uiTemplates: true,
      },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    // Fetch milestone and submilestone if provided
    let submilestone = null;
    let milestone = null;
    let relatedSubmilestones: Array<{ id: string; description: string; status: string }> = [];

    if (submilestoneId) {
      const subMilestoneData = await prisma.subMilestone.findUnique({
        where: { id: submilestoneId },
        include: {
          milestone: {
            include: {
              subMilestones: {
                where: {
                  id: { not: submilestoneId },
                },
                select: {
                  id: true,
                  description: true,
                  status: true,
                },
              },
            },
          },
        },
      });

      if (subMilestoneData) {
        submilestone = {
          id: subMilestoneData.id,
          description: subMilestoneData.description,
          points: subMilestoneData.points,
          status: subMilestoneData.status,
          acceptanceCriteria: subMilestoneData.acceptanceCriteria,
        };

        milestone = {
          id: subMilestoneData.milestone.id,
          title: subMilestoneData.milestone.title,
          description: subMilestoneData.milestone.description,
        };

        relatedSubmilestones = subMilestoneData.milestone.subMilestones;
      }
    }

    // Search for relevant documents using query
    const query = submilestone ? submilestone.description : project.title;

    const relevantDocuments = await this.searchDocuments(query, projectId);

    // Get UI templates
    const uiTemplates = project.uiTemplates.map((template) => ({
      id: template.id,
      name: template.name,
      colors: template.colors as Record<string, unknown>,
      fonts: template.fonts as Record<string, unknown>,
      components: template.components as Record<string, unknown>,
      layout: template.layout as Record<string, unknown>,
    }));

    // Get repo structure if repository URL exists
    let repoStructure = null;
    if (project.repositoryUrl) {
      try {
        repoStructure = await this.getRepoStructure(project.repositoryUrl);
      } catch (error) {
        console.error('Error fetching repo structure:', error);
      }
    }

    return {
      submilestone,
      milestone,
      project: {
        id: project.id,
        title: project.title,
        description: project.description,
        repositoryUrl: project.repositoryUrl,
      },
      documents: relevantDocuments,
      uiTemplates,
      repoStructure,
      relatedSubmilestones,
    };
  }

  /**
   * Search for relevant documents using Qdrant RAG
   */
  async searchDocuments(
    query: string,
    projectId: string
  ): Promise<
    Array<{
      id: string;
      title: string;
      type: string;
      relevantChunks: string[];
    }>
  > {
    try {
      // First, get embedding for the query
      const embedding = await this.generateEmbedding(query);

      // Search in Qdrant
      const searchResults = await qdrantClient.search(this.QDRANT_COLLECTION, {
        vector: embedding,
        limit: this.MAX_CHUNKS,
        score_threshold: this.SIMILARITY_THRESHOLD,
        filter: {
          must: [
            {
              key: 'projectId',
              match: { value: projectId },
            },
          ],
        },
      });

      // Group results by document
      const docMap = new Map<
        string,
        {
          id: string;
          title: string;
          type: string;
          chunks: string[];
        }
      >();

      for (const result of searchResults) {
        // Extract text from payload with type safety
        const payload = result.payload as {
          documentId?: string;
          documentTitle?: string;
          documentType?: string;
          text?: string;
          [key: string]: unknown;
        };
        const docId = payload.documentId as string;
        const text = payload.text as string;

        if (!docMap.has(docId)) {
          docMap.set(docId, {
            id: docId,
            title: (payload.documentTitle as string) || 'Untitled',
            type: (payload.documentType as string) || 'document',
            chunks: [],
          });
        }

        docMap.get(docId)!.chunks.push(text);
      }

      return Array.from(docMap.values()).map((doc) => ({
        id: doc.id,
        title: doc.title,
        type: doc.type,
        relevantChunks: doc.chunks,
      }));
    } catch (error) {
      console.error('Error searching documents:', error);
      return [];
    }
  }

  /**
   * Generate embedding for text using OpenAI
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: text,
        }),
      });

      const data = await response.json();
      return data.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw new Error('Failed to generate embedding');
    }
  }

  /**
   * Get repository file structure
   */
  async getRepoStructure(repositoryUrl: string): Promise<{
    files: string[];
    directories: string[];
    mainFiles: string[];
  }> {
    try {
      const urlParts = repositoryUrl.replace('https://github.com/', '').split('/');
      const owner = urlParts[0];
      const repo = urlParts[1];

      // Get repo tree
      const tree = await githubService.getRepoStructure(owner, repo, '');

      const files: string[] = [];
      const directories: string[] = [];
      const mainFiles: string[] = [];

      const importantFiles = [
        'README.md',
        'package.json',
        'tsconfig.json',
        'Dockerfile',
        '.env.example',
        'docker-compose.yml',
      ];

      const processTree = (
        items: Array<{ path?: string; name?: string; type?: string; sha?: string }>,
        path = ''
      ) => {
        for (const item of items) {
          if (!item.name) continue;
          const fullPath = path ? `${path}/${item.name}` : item.name;

          if (item.type === 'dir') {
            directories.push(fullPath);
          } else if (item.type === 'file') {
            files.push(fullPath);
            if (importantFiles.includes(item.name)) {
              mainFiles.push(fullPath);
            }
          }
        }
      };

      processTree(tree);

      return {
        files,
        directories,
        mainFiles,
      };
    } catch (error) {
      console.error('Error getting repo structure:', error);
      throw new Error('Failed to get repository structure');
    }
  }

  /**
   * Get UI templates for a project
   */
  async getUITemplates(projectId: string) {
    const templates = await prisma.uITemplate.findMany({
      where: { projectId },
      select: {
        id: true,
        name: true,
        description: true,
        colors: true,
        fonts: true,
        components: true,
        layout: true,
        styleTokens: true,
      },
    });

    return templates;
  }

  /**
   * Get milestone context
   */
  async getMilestoneContext(milestoneId: string) {
    const milestone = await prisma.milestone.findUnique({
      where: { id: milestoneId },
      include: {
        subMilestones: {
          select: {
            id: true,
            description: true,
            status: true,
            points: true,
            acceptanceCriteria: true,
          },
        },
        project: {
          select: {
            id: true,
            title: true,
            description: true,
            repositoryUrl: true,
          },
        },
      },
    });

    if (!milestone) {
      throw new Error('Milestone not found');
    }

    const submilestones = milestone.subMilestones || [];
    const totalPoints = submilestones.reduce(
      (sum: number, sm: { points: number }) => sum + sm.points,
      0
    );

    return {
      id: milestone.id,
      title: milestone.title,
      description: milestone.description,
      status: milestone.status,
      totalPoints,
      project: milestone.project,
      submilestones,
    };
  }

  /**
   * Get submilestone details
   */
  async getSubmilestoneDetails(submilestoneId: string) {
    const submilestone = await prisma.subMilestone.findUnique({
      where: { id: submilestoneId },
      include: {
        milestone: {
          include: {
            project: {
              select: {
                id: true,
                title: true,
                repositoryUrl: true,
              },
            },
          },
        },
        assignedUser: {
          select: {
            id: true,
            name: true,
            githubUsername: true,
          },
        },
        prSubmissions: {
          select: {
            id: true,
            prUrl: true,
            prNumber: true,
            status: true,
            aiReviewScore: true,
          },
        },
      },
    });

    if (!submilestone) {
      throw new Error('Submilestone not found');
    }

    return submilestone;
  }

  /**
   * Search code in repository
   */
  async searchCode(projectId: string, _query: string): Promise<string[]> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { repositoryUrl: true },
    });

    if (!project?.repositoryUrl) {
      throw new Error('Project repository URL not found');
    }

    // This is a simplified version - in production, you'd want to use GitHub's code search API
    // or index the repository contents in Qdrant for better semantic search
    return [];
  }

  /**
   * Get acceptance criteria for a submilestone
   */
  async getAcceptanceCriteria(submilestoneId: string): Promise<string[]> {
    const submilestone = await prisma.subMilestone.findUnique({
      where: { id: submilestoneId },
      select: { acceptanceCriteria: true },
    });

    if (!submilestone) {
      throw new Error('Submilestone not found');
    }

    return (submilestone.acceptanceCriteria as string[]) || [];
  }

  /**
   * Get verification rules for a submilestone
   */
  async getVerificationRules(submilestoneId: string): Promise<string[]> {
    const submilestone = await prisma.subMilestone.findUnique({
      where: { id: submilestoneId },
      select: { verificationRules: true },
    });

    if (!submilestone) {
      throw new Error('Submilestone not found');
    }

    return (submilestone.verificationRules as string[]) || [];
  }
}

export const aiContextService = new AIContextService();
