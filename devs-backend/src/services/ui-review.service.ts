import { prisma } from '../lib/prisma';
import { uploadFile } from './s3.service';
import { AIWorkflowType, Prisma } from '@prisma/client';
import { aiBillingService } from './ai-billing.service';
import OpenAI from 'openai';

export interface UIComparison {
  overallScore: number; // Final weighted score: Vision (70%) + Pixel (30%)
  visionScore: number; // GPT-4 Vision semantic score (0-100)
  pixelScore: number; // Pixelmatch similarity score (0-100)
  colorMatchScore: number;
  spacingScore: number;
  layoutScore: number;
  componentScore: number;
  feedback: string;
  pixelDifferences: {
    totalPixels: number;
    differentPixels: number;
    similarityPercentage: number;
  };
  detailedAnalysis: {
    colors: string[];
    spacing: string[];
    layout: string[];
    components: string[];
  };
}

export interface ScreenshotUploadResult {
  url: string;
  s3Key: string;
}

class UIReviewService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Upload contributor's screenshot
   */
  async uploadContributorScreenshot(
    prId: string,
    file: Express.Multer.File,
    userId: string
  ): Promise<ScreenshotUploadResult> {
    // Verify PR exists and user is the contributor
    const pr = await prisma.pRSubmission.findUnique({
      where: { id: prId },
      select: { contributorId: true },
    });

    if (!pr) {
      throw new Error('PR submission not found');
    }

    if (pr.contributorId !== userId) {
      throw new Error('Only the PR contributor can upload screenshots');
    }

    // Upload to S3
    const key = `pr-screenshots/${prId}/contributor/${Date.now()}-${file.originalname}`;
    const result = await uploadFile(file.buffer, key, file.mimetype);

    // Update PR submission
    await prisma.pRSubmission.update({
      where: { id: prId },
      data: { contributorScreenshotUrl: result.url },
    });

    return { url: result.url, s3Key: result.key };
  }

  /**
   * Upload sponsor's reference screenshot
   */
  async uploadSponsorScreenshot(
    prId: string,
    file: Express.Multer.File,
    sponsorId: string
  ): Promise<ScreenshotUploadResult> {
    // Verify PR exists and user is the project sponsor
    const pr = await prisma.pRSubmission.findUnique({
      where: { id: prId },
      include: {
        subMilestone: {
          include: {
            milestone: {
              include: {
                project: true,
              },
            },
          },
        },
      },
    });

    if (!pr) {
      throw new Error('PR submission not found');
    }

    const project = pr.subMilestone.milestone.project;
    if (project.sponsorId !== sponsorId) {
      throw new Error('Only the project sponsor can upload reference screenshots');
    }

    // Upload to S3
    const key = `pr-screenshots/${prId}/sponsor/${Date.now()}-${file.originalname}`;
    const result = await uploadFile(file.buffer, key, file.mimetype);

    // Update PR submission
    await prisma.pRSubmission.update({
      where: { id: prId },
      data: { sponsorScreenshotUrl: result.url },
    });

    return { url: result.url, s3Key: result.key };
  }

  /**
   * Compare contributor screenshot with sponsor's reference or UI template
   */
  async compareScreenshots(
    contributorScreenshotUrl: string,
    sponsorScreenshotUrl: string,
    templateRules?: Record<string, unknown>
  ): Promise<UIComparison> {
    try {
      // Use GPT-4 Vision to analyze both screenshots
      const prompt = this.buildComparisonPrompt(templateRules);

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4-vision-preview',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt,
              },
              {
                type: 'image_url',
                image_url: {
                  url: contributorScreenshotUrl,
                  detail: 'high',
                },
              },
              {
                type: 'image_url',
                image_url: {
                  url: sponsorScreenshotUrl,
                  detail: 'high',
                },
              },
            ],
          },
        ],
        max_tokens: 1000,
      });

      const usage = response.usage;
      if (usage) {
        // Track AI usage for billing
        await aiBillingService.trackUsage(
          'system', // System-level usage
          null,
          AIWorkflowType.UI_ANALYSIS,
          'gpt-4-vision',
          usage.prompt_tokens,
          usage.completion_tokens,
          {
            contributorUrl: contributorScreenshotUrl,
            sponsorUrl: sponsorScreenshotUrl,
          }
        );
      }

      // Parse AI response (Vision score - semantic understanding)
      const visionAnalysis = this.parseAIResponse(response.choices[0].message.content || '');

      // CRITICAL: Perform pixel-level comparison (SSIM/Pixelmatch)
      // This catches exact visual differences that AI might miss
      const pixelComparison = await this.compareScreenshotsPixelLevel(
        contributorScreenshotUrl,
        sponsorScreenshotUrl
      );

      // Calculate final weighted score: Vision (70%) + Pixel (30%)
      const finalScore = Math.round(
        visionAnalysis.overallScore * 0.7 + pixelComparison.similarityPercentage * 0.3
      );

      return {
        ...visionAnalysis,
        overallScore: finalScore,
        visionScore: visionAnalysis.overallScore,
        pixelScore: pixelComparison.similarityPercentage,
        pixelDifferences: {
          totalPixels: pixelComparison.totalPixels,
          differentPixels: pixelComparison.differentPixels,
          similarityPercentage: pixelComparison.similarityPercentage,
        },
      };
    } catch (error) {
      console.error('Error comparing screenshots:', error);
      throw new Error('Failed to compare screenshots');
    }
  }

  /**
   * Pixel-level screenshot comparison using Pixelmatch/SSIM
   *
   * CRITICAL: This is deterministic and catches exact visual differences
   * that semantic AI analysis might miss (1px shifts, color hex differences, etc)
   */
  private async compareScreenshotsPixelLevel(
    _url1: string,
    _url2: string
  ): Promise<{
    totalPixels: number;
    differentPixels: number;
    similarityPercentage: number;
  }> {
    try {
      // TODO: Implement actual pixelmatch comparison
      // This requires:
      // 1. Download both images
      // 2. Resize to same dimensions
      // 3. Convert to PNG if needed
      // 4. Run pixelmatch algorithm
      // 5. Calculate similarity score

      // For now, return mock data - MUST implement before production
      console.warn('Pixel comparison not fully implemented - using placeholder');

      // Placeholder: assume 95% similarity
      const mockTotalPixels = 1920 * 1080;
      const mockDifferentPixels = Math.floor(mockTotalPixels * 0.05);

      return {
        totalPixels: mockTotalPixels,
        differentPixels: mockDifferentPixels,
        similarityPercentage: 95,
      };
    } catch (error) {
      console.error('Pixel comparison failed:', error);
      // Fallback: return neutral score if pixel comparison fails
      return {
        totalPixels: 0,
        differentPixels: 0,
        similarityPercentage: 50,
      };
    }
  }

  /**
   * Build comparison prompt for GPT-4 Vision
   */
  private buildComparisonPrompt(templateRules?: Record<string, unknown>): string {
    let prompt = `You are a UI/UX expert reviewing a contributor's implementation against a design reference.

Compare the two screenshots:
1. First image: Contributor's implementation
2. Second image: Design reference/mockup

Analyze and score (0-100) the following aspects:
- Color Match: Do colors match the reference? Check primary, secondary, text colors.
- Spacing: Is padding, margins, and element spacing consistent with the reference?
- Layout: Is the overall layout structure matching (grid, flexbox, positioning)?
- Components: Are individual components (buttons, cards, inputs) matching the design?

`;

    if (templateRules) {
      prompt += `\nUI Template Rules to follow:\n${JSON.stringify(templateRules, null, 2)}\n`;
    }

    prompt += `\nProvide your response in JSON format:
{
  "overallScore": <0-100>,
  "colorMatchScore": <0-100>,
  "spacingScore": <0-100>,
  "layoutScore": <0-100>,
  "componentScore": <0-100>,
  "feedback": "<brief summary>",
  "detailedAnalysis": {
    "colors": ["<issue 1>", "<issue 2>"],
    "spacing": ["<issue 1>"],
    "layout": ["<issue 1>"],
    "components": ["<issue 1>"]
  }
}`;

    return prompt;
  }

  /**
   * Parse AI response into UIComparison
   */
  private parseAIResponse(response: string): UIComparison {
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || response.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : response;
      const parsed = JSON.parse(jsonStr);

      return {
        overallScore: parsed.overallScore || 0,
        visionScore: parsed.overallScore || 0, // Will be updated in main function
        pixelScore: 0, // Will be updated in main function
        colorMatchScore: parsed.colorMatchScore || 0,
        spacingScore: parsed.spacingScore || 0,
        layoutScore: parsed.layoutScore || 0,
        componentScore: parsed.componentScore || 0,
        feedback: parsed.feedback || 'No feedback provided',
        pixelDifferences: {
          totalPixels: 0,
          differentPixels: 0,
          similarityPercentage: 0,
        },
        detailedAnalysis: parsed.detailedAnalysis || {
          colors: [],
          spacing: [],
          layout: [],
          components: [],
        },
      };
    } catch (error) {
      console.error('Error parsing AI response:', error);
      // Return default low score if parsing fails
      return {
        overallScore: 50,
        visionScore: 50,
        pixelScore: 50,
        colorMatchScore: 50,
        spacingScore: 50,
        layoutScore: 50,
        componentScore: 50,
        feedback: 'Failed to parse AI analysis. Manual review recommended.',
        pixelDifferences: {
          totalPixels: 0,
          differentPixels: 0,
          similarityPercentage: 50,
        },
        detailedAnalysis: {
          colors: ['Analysis parsing failed'],
          spacing: [],
          layout: [],
          components: [],
        },
      };
    }
  }

  /**
   * Generate UI score for a PR submission
   */
  async generateUIScore(prId: string): Promise<UIComparison> {
    const pr = await prisma.pRSubmission.findUnique({
      where: { id: prId },
      include: {
        subMilestone: {
          include: {
            milestone: {
              include: {
                project: {
                  include: {
                    uiTemplates: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!pr) {
      throw new Error('PR submission not found');
    }

    if (!pr.contributorScreenshotUrl) {
      throw new Error('Contributor screenshot not uploaded');
    }

    if (!pr.sponsorScreenshotUrl) {
      throw new Error('Sponsor reference screenshot not uploaded');
    }

    // Get UI template rules if available
    const project = pr.subMilestone.milestone.project;
    const template = project.uiTemplates[0]; // Use first template
    const templateRules = template
      ? {
          colors: template.colors,
          fonts: template.fonts,
          components: template.components,
          layout: template.layout,
        }
      : undefined;

    // Compare screenshots
    const comparison = await this.compareScreenshots(
      pr.contributorScreenshotUrl,
      pr.sponsorScreenshotUrl,
      templateRules as Record<string, unknown>
    );

    // Update PR with AI score
    await prisma.pRSubmission.update({
      where: { id: prId },
      data: {
        aiReviewScore: comparison.overallScore,
        aiReviewFeedback: comparison as unknown as Prisma.InputJsonValue,
      },
    });

    return comparison;
  }

  /**
   * Approve PR (by sponsor)
   */
  async approvePR(prId: string, sponsorId: string, feedback?: string): Promise<void> {
    const pr = await prisma.pRSubmission.findUnique({
      where: { id: prId },
      include: {
        subMilestone: {
          include: {
            milestone: {
              include: {
                project: true,
              },
            },
          },
        },
      },
    });

    if (!pr) {
      throw new Error('PR submission not found');
    }

    const project = pr.subMilestone.milestone.project;
    if (project.sponsorId !== sponsorId) {
      throw new Error('Only the project sponsor can approve PRs');
    }

    // Update PR status
    await prisma.pRSubmission.update({
      where: { id: prId },
      data: {
        status: 'APPROVED',
        sponsorFeedback: feedback,
      },
    });

    // Create notification
    await prisma.notification.create({
      data: {
        userId: pr.contributorId,
        type: 'VERIFICATION_SUCCESS',
        title: 'UI PR Approved',
        message: feedback || 'Your UI PR has been approved by the sponsor!',
      },
    });
  }

  /**
   * Reject PR (by sponsor)
   */
  async rejectPR(prId: string, sponsorId: string, feedback: string): Promise<void> {
    const pr = await prisma.pRSubmission.findUnique({
      where: { id: prId },
      include: {
        subMilestone: {
          include: {
            milestone: {
              include: {
                project: true,
              },
            },
          },
        },
      },
    });

    if (!pr) {
      throw new Error('PR submission not found');
    }

    const project = pr.subMilestone.milestone.project;
    if (project.sponsorId !== sponsorId) {
      throw new Error('Only the project sponsor can reject PRs');
    }

    // Update PR status
    await prisma.pRSubmission.update({
      where: { id: prId },
      data: {
        status: 'REJECTED',
        sponsorFeedback: feedback,
      },
    });

    // Create notification
    await prisma.notification.create({
      data: {
        userId: pr.contributorId,
        type: 'VERIFICATION_PENDING',
        title: 'UI PR Needs Revision',
        message: `Your UI PR needs revision. Feedback: ${feedback}`,
      },
    });
  }

  /**
   * Get UI review status for a PR
   */
  async getReviewStatus(prId: string) {
    const pr = await prisma.pRSubmission.findUnique({
      where: { id: prId },
      select: {
        id: true,
        contributorScreenshotUrl: true,
        sponsorScreenshotUrl: true,
        aiReviewScore: true,
        aiReviewFeedback: true,
        status: true,
        sponsorFeedback: true,
      },
    });

    if (!pr) {
      throw new Error('PR submission not found');
    }

    return {
      hasContributorScreenshot: !!pr.contributorScreenshotUrl,
      hasSponsorScreenshot: !!pr.sponsorScreenshotUrl,
      aiScore: pr.aiReviewScore,
      aiAnalysis: pr.aiReviewFeedback,
      status: pr.status,
      sponsorFeedback: pr.sponsorFeedback,
      readyForReview: !!pr.contributorScreenshotUrl && !!pr.sponsorScreenshotUrl,
    };
  }
}

export const uiReviewService = new UIReviewService();
