import { inngest } from '../lib/inngest';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { config } from '../config';
import { aiOrchestrationService, SubMilestoneSchema } from '../services/ai-orchestration.service';
import { githubService } from '../services/github.service';
import { documentService } from '../services/document.service';
import { codeRabbitService } from '../services/coderabbit.service';
import { getWebSocketServer } from '../lib/websocket';

type SubMilestoneType = z.infer<typeof SubMilestoneSchema>;

/**
 * Multi-Model AI Milestone Generation Workflow
 *
 * Orchestrates:
 * 1. Document/file processing
 * 2. GitHub repository analysis
 * 3. Context gathering with Claude
 * 4. Milestone generation with GPT-4o and Claude in parallel
 * 5. Result validation and database persistence
 */

// Input schema
const GenerateMilestonesInput = z.object({
  projectId: z.string(),
  prompt: z.string(),
  projectTitle: z.string().optional(),
  projectDescription: z.string().optional(),
  documentUrls: z.array(z.string()).optional(),
  inlineDocument: z.string().optional(), // User's detailed PRD/requirements pasted in chat
  repositoryUrl: z.string().optional(),
  userId: z.string(),
  existingMilestonesCount: z.number().optional(),
});

/**
 * Main workflow
 */
export const aiMilestoneGenerationWorkflow = inngest.createFunction(
  {
    id: 'ai-milestone-generation-multi-model',
    name: 'AI Milestone Generation (Multi-Model)',
    retries: 2,
    concurrency: [
      {
        limit: 5,
        key: 'event.data.userId',
      },
    ],
    onFailure: async ({ event, error }) => {
      logger.error('[Milestone Gen] Workflow failed', {
        projectId: event.data.event.data.projectId,
        error,
      });

      // Send error event via WebSocket
      try {
        const ws = getWebSocketServer();
        ws.sendMilestoneGenerationProgress(event.data.event.data.projectId, {
          stage: 'error',
          message: 'Failed to generate milestones. Please try again.',
          progress: 0,
          data: {
            error: error.message,
          },
        });
      } catch (wsError) {
        logger.warn('[Milestone Gen] Failed to send error WebSocket update:', wsError);
      }
    },
  },
  { event: 'milestone/generate.requested' },
  async ({ event, step }) => {
    const input = GenerateMilestonesInput.parse(event.data);

    logger.info('[Milestone Gen] Starting workflow', {
      projectId: input.projectId,
      userId: input.userId,
    });

    // Emit started event
    try {
      const ws = getWebSocketServer();
      ws.sendMilestoneGenerationProgress(input.projectId, {
        stage: 'started',
        message: 'Starting milestone generation...',
        progress: 0,
      });
    } catch (error) {
      logger.warn(
        '[Milestone Gen] Failed to send WebSocket update (server may not be initialized):',
        error
      );
    }

    // Step 1: Validate project and permissions
    const project = await step.run('validate-project', async () => {
      const proj = await prisma.project.findUnique({
        where: { id: input.projectId },
        include: { sponsor: true, organization: true },
      });

      if (!proj) {
        throw new Error('Project not found');
      }

      if (proj.sponsorId !== input.userId) {
        throw new Error('Only project sponsor can generate milestones');
      }

      return proj;
    });

    // Step 2: Process uploaded documents (PDF, MD, TXT)
    const documentContents = await step.run('process-documents', async () => {
      if (!input.documentUrls || input.documentUrls.length === 0) {
        logger.info('[Milestone Gen] No documents to process');
        return [];
      }

      logger.info('[Milestone Gen] Processing documents', {
        count: input.documentUrls.length,
      });

      try {
        const ws = getWebSocketServer();
        ws.sendMilestoneGenerationProgress(input.projectId, {
          stage: 'analyzing-documents',
          message: `Analyzing ${input.documentUrls.length} document(s)...`,
          progress: 10,
        });
      } catch (error) {
        logger.warn('[Milestone Gen] WebSocket update failed:', error);
      }

      try {
        const contents = await Promise.all(
          input.documentUrls.map(async (url) => {
            try {
              // Extract text from S3 URLs
              const text = await documentService.getDocumentContent(url);
              return text;
            } catch (error) {
              logger.error('[Milestone Gen] Failed to process document', {
                url,
                error,
              });
              return '';
            }
          })
        );

        return contents.filter((c) => c.length > 0);
      } catch (error) {
        logger.error('[Milestone Gen] Document processing failed', { error });
        return [];
      }
    });

    // Step 3: Analyze GitHub repository using CodeRabbit (if provided)
    const githubContext = await step.run('analyze-repository', async () => {
      if (!input.repositoryUrl) {
        logger.info('[Milestone Gen] No repository to analyze');
        return undefined;
      }

      try {
        const ws = getWebSocketServer();
        ws.sendMilestoneGenerationProgress(input.projectId, {
          stage: 'fetching-github',
          message: 'Analyzing GitHub repository...',
          progress: 30,
        });
      } catch (error) {
        logger.warn('[Milestone Gen] WebSocket update failed:', error);
      }

      try {
        logger.info('[Milestone Gen] Analyzing repository with CodeRabbit', {
          url: input.repositoryUrl,
        });

        // Use CodeRabbit for comprehensive analysis
        const analysis = await codeRabbitService.analyzeRepository(input.repositoryUrl);

        // Also get README for additional context
        const readme = await githubService.getReadme(input.repositoryUrl);

        return {
          readme,
          structure: analysis.architecture,
          technologies: analysis.technologies,
          summary: analysis.summary,
          complexity: analysis.complexity,
          recommendations: analysis.recommendations,
        };
      } catch (error) {
        logger.error('[Milestone Gen] Repository analysis failed', {
          error,
          repositoryUrl: input.repositoryUrl,
        });
        return undefined;
      }
    });

    // Step 4: Analyze documents using GPT-4o (superior document understanding)
    const documentAnalysis = await step.run('analyze-documents-gpt4', async () => {
      if (documentContents.length === 0) {
        return undefined;
      }

      try {
        logger.info('[Milestone Gen] Analyzing documents with GPT-4o');

        const analysis = await aiOrchestrationService.analyzeDocuments(documentContents);
        return analysis;
      } catch (error) {
        logger.error('[Milestone Gen] Document analysis failed', { error });
        return undefined;
      }
    });

    // Step 5: Generate milestones with both models in parallel
    const { claudeMilestones, gptMilestones } = await step.run(
      'generate-milestones-parallel',
      async () => {
        logger.info('[Milestone Gen] Generating milestones with both models');

        try {
          const ws = getWebSocketServer();
          ws.sendMilestoneGenerationProgress(input.projectId, {
            stage: 'generating-claude',
            message: 'AI is generating milestones with Claude...',
            progress: 50,
          });
        } catch (error) {
          logger.warn('[Milestone Gen] WebSocket update failed:', error);
        }

        // Prepare context - IMPORTANT: Include ALL user-provided requirements
        const projectDescriptionParts: string[] = [
          input.projectTitle || project.title,
          '',
          input.projectDescription || project.description || '',
          '',
          '## User Requirements (FROM CHAT)',
          input.prompt,
        ];

        // Add inline document (user's detailed PRD) if provided
        if (input.inlineDocument && input.inlineDocument.trim().length > 0) {
          projectDescriptionParts.push(
            '',
            '## Detailed Requirements Document',
            input.inlineDocument
          );
          logger.info('[Milestone Gen] Including inline document', {
            length: input.inlineDocument.length,
            preview: input.inlineDocument.substring(0, 200),
          });
        }

        const projectDescription = projectDescriptionParts
          .filter((p) => p !== undefined)
          .join('\n');

        // Combine all document sources: analyzed docs + uploaded docs + inline PRD
        const allDocumentContents: string[] = [];
        if (documentAnalysis) allDocumentContents.push(documentAnalysis);
        if (documentContents.length > 0) allDocumentContents.push(...documentContents);
        // Note: inlineDocument is already in projectDescription, don't duplicate

        logger.info('[Milestone Gen] Full context prepared', {
          projectDescriptionLength: projectDescription.length,
          documentContentsCount: allDocumentContents.length,
          hasInlineDocument: !!input.inlineDocument,
          hasGithubContext: !!githubContext,
        });

        const fullContext = {
          projectDescription,
          repositoryUrl: input.repositoryUrl,
          githubContext: githubContext || undefined, // Convert null to undefined
          documentContents: allDocumentContents.length > 0 ? allDocumentContents : undefined,
        };

        // Generate with both models in parallel
        const [claudeResult, gptResult] = await Promise.allSettled([
          aiOrchestrationService.generateMilestones(fullContext, {
            model: 'claude-3-5-sonnet-20241022',
            temperature: 0.7,
          }),
          aiOrchestrationService.generateMilestones(fullContext, {
            model: 'gpt-4o',
            temperature: 0.7,
          }),
        ]);

        return {
          claudeMilestones: claudeResult.status === 'fulfilled' ? claudeResult.value : null,
          gptMilestones: gptResult.status === 'fulfilled' ? gptResult.value : null,
        };
      }
    );

    // Step 6: Select best result or merge insights
    const finalMilestones = await step.run('select-best-result', async () => {
      logger.info('[Milestone Gen] Selecting best milestone structure', {
        hasClaude: !!claudeMilestones,
        hasGPT: !!gptMilestones,
      });

      // Prefer Claude (better at planning) but fall back to GPT-4o
      if (claudeMilestones) {
        logger.info('[Milestone Gen] Using Claude-generated milestones');
        return claudeMilestones;
      }

      if (gptMilestones) {
        logger.info('[Milestone Gen] Using GPT-4o-generated milestones');
        return gptMilestones;
      }

      throw new Error('Both models failed to generate milestones');
    });

    // Step 7: Save to database
    const savedMilestones = await step.run('save-to-database', async () => {
      logger.info('[Milestone Gen] Saving milestones', {
        count: finalMilestones.milestones.length,
        totalPoints: finalMilestones.totalPoints,
      });

      try {
        const ws = getWebSocketServer();
        ws.sendMilestoneGenerationProgress(input.projectId, {
          stage: 'saving',
          message: `Saving ${finalMilestones.milestones.length} milestones to database...`,
          progress: 90,
        });

        // Stream each milestone as we prepare to save it
        for (const milestone of finalMilestones.milestones) {
          ws.streamMilestone(input.projectId, {
            title: milestone.title,
            description: milestone.description,
            reward: milestone.points,
            estimatedDays: Math.ceil(
              (milestone.subMilestones?.reduce(
                (sum: number, sm: any) => sum + (sm.estimatedHours || 0),
                0
              ) || 0) / 8
            ),
            subMilestones: milestone.subMilestones?.map((sm: any) => ({
              title: sm.title,
              description: sm.description,
            })),
          });
        }
      } catch (error) {
        logger.warn('[Milestone Gen] WebSocket update failed:', error);
      }

      // Delete existing AI-generated milestones
      await prisma.milestone.deleteMany({
        where: {
          projectId: input.projectId,
          createdByAI: true,
        },
      });

      // Create new milestones with sub-milestones
      const created = await Promise.all(
        finalMilestones.milestones.map(async (m, index) => {
          const milestone = await prisma.milestone.create({
            data: {
              projectId: input.projectId,
              title: m.title,
              description: m.description,
              points: m.points,
              order: index,
              status: 'OPEN',
              createdByAI: true,
              subMilestones: {
                create: (m.subMilestones as unknown as SubMilestoneType[]).map((sm) => ({
                  description: `${sm.title}\n\n${sm.description}`,
                  acceptanceCriteria: JSON.stringify({
                    criteria: sm.acceptanceCriteria,
                    technicalRequirements: sm.technicalRequirements,
                    suggestedFiles: sm.suggestedFiles || [],
                    taskType: sm.taskType, // Store in metadata instead
                  }),
                  checkpointAmount: String(sm.points),
                  checkpointsCount: 1,
                  estimateHours: sm.estimatedHours,
                  points: sm.points,
                  status: 'OPEN',
                  createdByAI: true,
                })),
              },
            },
            include: {
              subMilestones: true,
            },
          });

          return milestone;
        })
      );

      logger.info('[Milestone Gen] Milestones saved successfully', {
        count: created.length,
      });

      return created;
    });

    // Step 8: Send notification
    await step.run('send-notification', async () => {
      logger.info('[Milestone Gen] Sending email notification');

      try {
        await inngest.send({
          name: 'email/send',
          data: {
            to: project.sponsor.email,
            subject: `✨ Milestones Generated for ${project.title}`,
            template: 'milestone-generated',
            data: {
              projectName: project.title,
              milestoneCount: finalMilestones.milestones.length,
              totalPoints: finalMilestones.totalPoints,
              estimatedHours: finalMilestones.totalEstimatedHours,
              projectUrl: `${config.server.frontendUrl}/projects/${project.id}`,
            },
          },
        });
      } catch (error) {
        logger.error('[Milestone Gen] Failed to send notification', { error });
        // Don't fail the workflow if notification fails
      }
    });

    logger.info('[Milestone Gen] Workflow completed successfully', {
      projectId: input.projectId,
      milestonesCreated: savedMilestones.length,
    });

    // Send completion event via WebSocket
    try {
      const ws = getWebSocketServer();
      ws.sendMilestoneGenerationProgress(input.projectId, {
        stage: 'completed',
        message: `Successfully generated ${savedMilestones.length} milestones!`,
        progress: 100,
        data: {
          milestonesCount: savedMilestones.length,
          totalPoints: finalMilestones.totalPoints,
          totalEstimatedHours: finalMilestones.totalEstimatedHours,
        },
      });
    } catch (error) {
      logger.warn('[Milestone Gen] Failed to send completion WebSocket update:', error);
    }

    return {
      success: true,
      projectId: input.projectId,
      milestones: savedMilestones,
      metadata: {
        totalPoints: finalMilestones.totalPoints,
        totalEstimatedHours: finalMilestones.totalEstimatedHours,
        projectComplexity: finalMilestones.projectComplexity,
        recommendedTeamSize: finalMilestones.recommendedTeamSize,
        usedModel: claudeMilestones ? 'claude-3-5-sonnet-20241022' : 'gpt-4o',
      },
    };
  }
);
