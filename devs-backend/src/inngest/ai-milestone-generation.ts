import { inngest } from '../lib/inngest';
import { anthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { githubService } from '../services/github.service';
import { documentService } from '../services/document.service';
import { qdrantClient, QDRANT_COLLECTIONS } from '../lib/qdrant';
import { publishEvent, KAFKA_TOPICS } from '../lib/kafka';

// Claude 3.5 Sonnet model
const model = anthropic('claude-3-5-sonnet-20241022');

// Schema for milestone structure
const SubMilestoneSchema = z.object({
  title: z.string().describe('Clear, actionable sub-milestone title'),
  description: z.string().describe('Detailed description of the task'),
  checkpointAmount: z.number().min(1).describe('Point value for this task (1-100)'),
  estimatedDays: z.number().min(1).describe('Estimated days to complete'),
  technicalRequirements: z.array(z.string()).describe('Technical requirements and dependencies'),
  acceptanceCriteria: z.array(z.string()).describe('Specific criteria for task completion'),
  suggestedFiles: z.array(z.string()).optional().describe('Files that may need modification'),
});

const MilestoneSchema = z.object({
  title: z.string().describe('Milestone title'),
  description: z.string().describe('Milestone description'),
  subMilestones: z.array(SubMilestoneSchema).min(1).max(10).describe('Array of sub-milestones'),
});

const MilestoneStructureSchema = z.object({
  milestones: z
    .array(MilestoneSchema)
    .min(1)
    .max(20)
    .describe('Array of milestones for the project'),
  totalEstimatedDays: z.number().describe('Total estimated days for all milestones'),
  recommendedBudget: z.number().describe('Recommended total points budget'),
});

/**
 * AI Milestone Generation Workflow
 * Uses Inngest for orchestration and Vercel AI SDK for LLM calls
 */
export const aiMilestoneGeneration = inngest.createFunction(
  {
    id: 'ai-milestone-generation',
    name: 'AI Milestone Generation',
    retries: 2,
  },
  { event: 'ai/milestone.generate' },
  async ({ event, step }) => {
    const { projectId, userId } = event.data;

    // Step 1: Fetch project data
    const project = await step.run('fetch-project-data', async () => {
      const projectData = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          organization: true,
          sponsor: true,
        },
      });

      if (!projectData) {
        throw new Error(`Project ${projectId} not found`);
      }

      return projectData;
    });

    // Step 2: Fetch repository structure and code
    const repoContext = await step.run('fetch-repo-context', async () => {
      try {
        if (!project.repositoryUrl) {
          throw new Error('Project GitHub repo URL is missing');
        }
        const { owner, repo } = githubService.parseRepoUrl(project.repositoryUrl);

        // Get repository structure
        const repoStructure = await githubService.getRepoStructure(owner, repo);

        // Get README if exists
        let readme = '';
        try {
          readme = await githubService.getFileContent(owner, repo, 'README.md');
        } catch {
          logger.warn(`No README found for ${owner}/${repo}`);
        }

        // Get package.json if exists
        let packageJson = '';
        try {
          packageJson = await githubService.getFileContent(owner, repo, 'package.json');
        } catch {
          logger.warn(`No package.json found for ${owner}/${repo}`);
        }

        return {
          owner,
          repo,
          structure: repoStructure,
          readme,
          packageJson,
        };
      } catch (error) {
        logger.error('Error fetching repo context:', error);
        return null;
      }
    });

    // Step 3: Search for relevant project documents
    const projectDocs = await step.run('fetch-project-documents', async () => {
      try {
        // Search project documents in Qdrant
        const searchResults = await documentService.getProjectContext(
          projectId,
          'project context query',
          5
        );
        return searchResults;
      } catch (error) {
        logger.error('Error fetching project documents:', error);
        return [];
      }
    });

    // Step 4: Search for similar projects (for context)
    const similarProjects = await step.run('fetch-similar-projects', async () => {
      try {
        // Create search query from project description
        const query = `${project.title} ${project.description}`;

        // Search in Qdrant MILESTONES collection
        const searchResult = await qdrantClient.search(QDRANT_COLLECTIONS.MILESTONES, {
          vector: await generateEmbedding(query),
          limit: 3,
          filter: {
            must: [
              {
                key: 'projectId',
                match: {
                  except: [projectId], // Exclude current project
                },
              },
            ],
          },
        });

        return searchResult.map((hit) => hit.payload);
      } catch (error) {
        logger.error('Error fetching similar projects:', error);
        return [];
      }
    });

    // Step 5: Generate milestone structure using AI
    const generatedStructure = await step.run('generate-milestone-structure', async () => {
      const systemPrompt = `You are an expert software project manager and technical architect. 
Your task is to analyze a GitHub repository and generate a detailed milestone structure for contributors to work on.

Key requirements:
1. Break down the project into logical milestones (3-20 milestones)
2. Each milestone should have 1-10 sub-milestones (tasks)
3. Assign point values (1-100) based on task complexity and estimated effort
4. Provide clear acceptance criteria for each task
5. Consider the existing codebase structure and dependencies
6. Make tasks granular enough for individual contributors to claim
7. Ensure tasks are independent when possible to allow parallel work

Point allocation guidelines:
- Simple bug fix or documentation: 5-10 points
- Small feature or component: 10-25 points
- Medium feature requiring multiple files: 25-50 points
- Large feature or refactoring: 50-100 points

Focus on:
- Clear, actionable task descriptions
- Realistic time estimates
- Technical feasibility
- Dependencies between tasks`;

      const userPrompt = `Generate a milestone structure for the following project:

**Project Description:** ${project.description || 'Not provided'}
**Tech Stack:** Not specified
**Repository:** ${project.repositoryUrl}

${
  repoContext
    ? `
**Repository Structure:**
${JSON.stringify(repoContext.structure, null, 2).slice(0, 2000)}

**README:**
${typeof repoContext.readme === 'string' ? repoContext.readme.slice(0, 1500) : 'No README found'}

**Package.json:**
${typeof repoContext.packageJson === 'string' ? repoContext.packageJson.slice(0, 1000) : 'No package.json found'}
`
    : ''
}

${
  Array.isArray(projectDocs) && projectDocs.length > 0
    ? `
**Project Documents:**
${projectDocs
  .filter((doc) => doc != null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .map((doc: any) => `- ${doc.fileName}: ${doc.chunkText?.slice(0, 200) || 'No content'}`)
  .join('\n')}
`
    : ''
}

${
  similarProjects.length > 0
    ? `
**Similar Projects for Reference:**
${similarProjects
  .filter((p) => p != null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .map((p: any) => `- ${p.title}: ${p.description}`)
  .join('\n')}
`
    : ''
}

Generate a comprehensive milestone structure that breaks down this project into achievable tasks for contributors.`;

      const result = await generateObject({
        model,
        schema: MilestoneStructureSchema,
        system: systemPrompt,
        prompt: userPrompt,
        temperature: 0.7,
      });

      return result.object;
    });

    // Step 6: Validate and adjust milestone structure
    const validatedStructure = await step.run('validate-structure', async () => {
      // Ensure total points don't exceed reasonable limits
      let totalPoints = 0;
      for (const milestone of generatedStructure.milestones) {
        for (const subMilestone of milestone.subMilestones) {
          totalPoints += subMilestone.checkpointAmount;
        }
      }

      // If total points exceed 10,000, scale down
      if (totalPoints > 10000) {
        const scaleFactor = 10000 / totalPoints;
        for (const milestone of generatedStructure.milestones) {
          for (const subMilestone of milestone.subMilestones) {
            subMilestone.checkpointAmount = Math.max(
              1,
              Math.round(subMilestone.checkpointAmount * scaleFactor)
            );
          }
        }
      }

      return generatedStructure;
    });

    // Step 7: Save milestones to database
    const savedMilestones = await step.run('save-milestones', async () => {
      const milestones = [];

      for (let i = 0; i < validatedStructure.milestones.length; i++) {
        const milestoneData = validatedStructure.milestones[i];

        const milestone = await prisma.milestone.create({
          data: {
            projectId,
            title: milestoneData.title,
            description: milestoneData.description,
            status: 'OPEN',
            order: i + 1,
            subMilestones: {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              create: milestoneData.subMilestones.map((sub: any, idx: number) => ({
                title: sub.title,
                description: sub.description,
                checkpointAmount: sub.checkpointAmount,
                estimatedDays: sub.estimatedDays,
                technicalRequirements: sub.technicalRequirements,
                acceptanceCriteria: sub.acceptanceCriteria,
                suggestedFiles: sub.suggestedFiles || [],
                status: 'OPEN' as const,
                order: idx + 1,
              })),
            },
          },
          include: {
            subMilestones: true,
          },
        });

        milestones.push(milestone);
      }

      return milestones;
    });

    // Step 8: Store milestone embeddings in Qdrant for future similarity search
    await step.run('store-milestone-embeddings', async () => {
      for (const milestone of savedMilestones) {
        const embeddingText = `${project.title} - ${milestone.title}: ${milestone.description}`;
        const embedding = await generateEmbedding(embeddingText);

        await qdrantClient.upsert(QDRANT_COLLECTIONS.MILESTONES, {
          points: [
            {
              id: milestone.id,
              vector: embedding,
              payload: {
                projectId,
                milestoneId: milestone.id,
                title: milestone.title,
                description: milestone.description,
                subMilestoneCount: milestone.subMilestones.length,
              },
            },
          ],
        });
      }
    });

    // Step 9: Update project status
    await step.run('update-project-status', async () => {
      await prisma.project.update({
        where: { id: projectId },
        data: {
          status: 'ACTIVE',
        },
      });
    });

    // Step 10: Emit event and send notification
    await step.run('notify-completion', async () => {
      await publishEvent(KAFKA_TOPICS.MILESTONE_STRUCTURE_GENERATED, {
        projectId,
        userId,
        milestoneCount: savedMilestones.length,
        totalTasks: savedMilestones.reduce((sum, m) => sum + m.subMilestones.length, 0),
        totalPoints: validatedStructure.recommendedBudget,
      });

      logger.info(
        `AI milestone generation completed for project ${projectId}: ${savedMilestones.length} milestones`
      );
    });

    return {
      success: true,
      projectId,
      milestonesGenerated: savedMilestones.length,
      totalTasks: savedMilestones.reduce((sum, m) => sum + m.subMilestones.length, 0),
      totalPoints: validatedStructure.recommendedBudget,
      estimatedDays: validatedStructure.totalEstimatedDays,
    };
  }
);

/**
 * Generate text embedding using Anthropic-compatible embedding
 * Note: Using a mock embedding for now, should integrate with actual embedding service
 */
async function generateEmbedding(text: string): Promise<number[]> {
  // For production, integrate with OpenAI embeddings or other embedding service
  // Anthropic doesn't provide embeddings directly
  // Using a simple hash-based mock for now
  const hash = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const mockEmbedding = Array.from({ length: 1536 }, (_, i) => {
    return Math.sin((hash * (i + 1)) / 1536) * 0.1;
  });

  return mockEmbedding;
}
