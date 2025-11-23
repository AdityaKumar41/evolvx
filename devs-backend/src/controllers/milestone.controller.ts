import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { s3Client, uploadToS3 } from '../lib/s3';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { logger } from '../utils/logger';
import { config } from '../config';

export class MilestoneController {
  /**
   * Get milestones for a project
   */
  static async getProjectMilestones(req: AuthRequest, res: Response) {
    const { projectId } = req.params;

    const milestones = await prisma.milestone.findMany({
      where: { projectId },
      include: {
        subMilestones: {
          include: {
            assignedUser: {
              select: {
                id: true,
                githubUsername: true,
                avatarUrl: true,
              },
            },
            contributions: {
              select: {
                id: true,
                status: true,
                amountPaid: true,
              },
            },
          },
        },
      },
      orderBy: { order: 'asc' },
    });

    res.json({ milestones });
  }

  /**
   * Claim a sub-milestone (contributor)
   */
  static async claimSubMilestone(req: AuthRequest, res: Response) {
    const { subMilestoneId } = req.params;
    const { repositoryUrl, branchName } = req.body;

    const subMilestone = await prisma.subMilestone.findUnique({
      where: { id: subMilestoneId },
      include: {
        milestone: {
          include: {
            project: true,
          },
        },
      },
    });

    if (!subMilestone) {
      throw new AppError('Sub-milestone not found', 404);
    }

    if (subMilestone.status !== 'OPEN') {
      throw new AppError('Sub-milestone is not available for claiming', 400);
    }

    // Check if project is active
    if (subMilestone.milestone.project.status !== 'ACTIVE') {
      throw new AppError('Project is not active', 400);
    }

    const updated = await prisma.subMilestone.update({
      where: { id: subMilestoneId },
      data: {
        assignedTo: req.user!.id,
        status: 'CLAIMED',
        metadata: {
          repositoryUrl,
          branchName,
          claimedAt: new Date().toISOString(),
        },
      },
      include: {
        assignedUser: {
          select: {
            id: true,
            githubUsername: true,
            avatarUrl: true,
          },
        },
      },
    });

    res.json({
      message: 'Sub-milestone claimed successfully',
      subMilestone: updated,
    });
  }

  /**
   * Link PR to sub-milestone
   */
  static async linkPR(req: AuthRequest, res: Response) {
    const { subMilestoneId } = req.params;
    const { prUrl, prNumber, repositoryUrl } = req.body;

    const subMilestone = await prisma.subMilestone.findUnique({
      where: { id: subMilestoneId },
    });

    if (!subMilestone) {
      throw new AppError('Sub-milestone not found', 404);
    }

    if (subMilestone.assignedTo !== req.user!.id) {
      throw new AppError('You can only link PRs to your claimed tasks', 403);
    }

    // Create or update PR link
    const prLink = await prisma.prLink.upsert({
      where: { subMilestoneId },
      create: {
        subMilestoneId,
        prUrl,
        prNumber,
        repositoryUrl,
        userId: req.user!.id,
      },
      update: {
        prUrl,
        prNumber,
        repositoryUrl,
      },
    });

    // Update sub-milestone status
    await prisma.subMilestone.update({
      where: { id: subMilestoneId },
      data: {
        status: 'IN_PROGRESS',
      },
    });

    res.json({
      message: 'PR linked successfully',
      prLink,
    });
  }

  /**
   * Get sub-milestone details with progress
   */
  static async getSubMilestoneDetails(req: AuthRequest, res: Response) {
    const { subMilestoneId } = req.params;

    const subMilestone = await prisma.subMilestone.findUnique({
      where: { id: subMilestoneId },
      include: {
        milestone: {
          include: {
            project: {
              include: {
                sponsor: {
                  select: {
                    id: true,
                    githubUsername: true,
                    avatarUrl: true,
                  },
                },
              },
            },
          },
        },
        assignedUser: {
          select: {
            id: true,
            githubUsername: true,
            avatarUrl: true,
            walletAddress: true,
          },
        },
        contributions: {
          include: {
            proof: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!subMilestone) {
      throw new AppError('Sub-milestone not found', 404);
    }

    // Get PR link if exists
    const prLink = await prisma.prLink.findUnique({
      where: { subMilestoneId },
    });

    // Calculate progress
    const totalCheckpoints = subMilestone.checkpointsCount;
    const completedCheckpoints = subMilestone.contributions.filter(
      (c) => c.status === 'PAID'
    ).length;
    const progress = (completedCheckpoints / totalCheckpoints) * 100;

    res.json({
      subMilestone,
      prLink,
      progress: {
        total: totalCheckpoints,
        completed: completedCheckpoints,
        percentage: progress,
      },
    });
  }

  /**
   * Update sub-milestone (sponsor only - for re-scoping)
   */
  static async updateSubMilestone(req: AuthRequest, res: Response) {
    const { subMilestoneId } = req.params;
    const {
      title,
      description,
      detailedDescription,
      acceptanceCriteria,
      technicalRequirements,
      suggestedFiles,
      referenceLinks,
      taskType,
      checkpointAmount,
      checkpointsCount,
      points,
      estimateHours,
    } = req.body;

    const subMilestone = await prisma.subMilestone.findUnique({
      where: { id: subMilestoneId },
      include: {
        milestone: {
          include: {
            project: true,
          },
        },
      },
    });

    if (!subMilestone) {
      throw new AppError('Sub-milestone not found', 404);
    }

    // Check if user is sponsor
    if (subMilestone.milestone.project.sponsorId !== req.user!.id) {
      throw new AppError('Only the project sponsor can update sub-milestones', 403);
    }

    const updated = await prisma.subMilestone.update({
      where: { id: subMilestoneId },
      data: {
        ...(title && { title }),
        ...(description && { description }),
        ...(detailedDescription && { detailedDescription }),
        ...(acceptanceCriteria && { acceptanceCriteria }),
        ...(technicalRequirements && { technicalRequirements }),
        ...(suggestedFiles && { suggestedFiles }),
        ...(referenceLinks && { referenceLinks }),
        ...(taskType && { taskType }),
        ...(checkpointAmount && { checkpointAmount }),
        ...(checkpointsCount && { checkpointsCount }),
        ...(points !== undefined && { points }),
        ...(estimateHours !== undefined && { estimateHours }),
        status: 'RESCOPED',
      },
    });

    res.json({
      message: 'Sub-milestone updated successfully',
      subMilestone: updated,
    });
  }

  /**
   * Upload reference images for submilestone (UI mockups, designs, etc.)
   */
  static async uploadReferenceImages(req: AuthRequest, res: Response) {
    const { subMilestoneId } = req.params;

    logger.info('[uploadReferenceImages] Starting upload', {
      subMilestoneId,
      filesCount: req.files ? (Array.isArray(req.files) ? req.files.length : 1) : 0,
    });

    const subMilestone = await prisma.subMilestone.findUnique({
      where: { id: subMilestoneId },
      include: {
        milestone: {
          include: {
            project: true,
          },
        },
      },
    });

    if (!subMilestone) {
      throw new AppError('Sub-milestone not found', 404);
    }

    // Check if user is sponsor
    if (subMilestone.milestone.project.sponsorId !== req.user!.id) {
      throw new AppError('Only the project sponsor can upload reference images', 403);
    }

    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      logger.error('[uploadReferenceImages] No files received', { files: req.files });
      throw new AppError('No files uploaded', 400);
    }

    const uploadedImages: Array<{ url: string; key: string; filename: string }> = [];

    try {
      // Upload each file to S3
      for (const file of req.files as Express.Multer.File[]) {
        const timestamp = Date.now();
        const key = `submilestones/${subMilestoneId}/references/${timestamp}-${file.originalname}`;

        logger.info('[uploadReferenceImages] Uploading file to S3', {
          filename: file.originalname,
          size: file.size,
          mimetype: file.mimetype,
          key,
        });

        const url = await uploadToS3(key, file.buffer, file.mimetype);

        uploadedImages.push({
          url,
          key,
          filename: file.originalname,
        });
      }

      // Update submilestone with new images
      const currentImages = (subMilestone.referenceImages as any[]) || [];
      const updatedImages = [...currentImages, ...uploadedImages];

      logger.info('[uploadReferenceImages] Updating database', {
        currentImagesCount: currentImages.length,
        newImagesCount: uploadedImages.length,
      });

      const updated = await prisma.subMilestone.update({
        where: { id: subMilestoneId },
        data: {
          referenceImages: updatedImages,
        },
      });

      logger.info('[uploadReferenceImages] Upload successful');

      res.json({
        message: 'Reference images uploaded successfully',
        images: uploadedImages,
        subMilestone: updated,
      });
    } catch (error) {
      logger.error('[uploadReferenceImages] Error uploading reference images', {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new AppError(
        `Failed to upload reference images: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      );
    }
  }

  /**
   * Delete a reference image
   */
  static async deleteReferenceImage(req: AuthRequest, res: Response) {
    const { subMilestoneId } = req.params;
    const { imageKey } = req.body;

    const subMilestone = await prisma.subMilestone.findUnique({
      where: { id: subMilestoneId },
      include: {
        milestone: {
          include: {
            project: true,
          },
        },
      },
    });

    if (!subMilestone) {
      throw new AppError('Sub-milestone not found', 404);
    }

    // Check if user is sponsor
    if (subMilestone.milestone.project.sponsorId !== req.user!.id) {
      throw new AppError('Only the project sponsor can delete reference images', 403);
    }

    try {
      // Delete from S3
      const deleteCommand = new DeleteObjectCommand({
        Bucket: config.s3.bucketName,
        Key: imageKey,
      });
      await s3Client.send(deleteCommand);

      // Update submilestone - remove the image from the array
      const currentImages = (subMilestone.referenceImages as any[]) || [];
      const updatedImages = currentImages.filter((img: any) => img.key !== imageKey);

      const updated = await prisma.subMilestone.update({
        where: { id: subMilestoneId },
        data: {
          referenceImages: updatedImages,
        },
      });

      res.json({
        message: 'Reference image deleted successfully',
        subMilestone: updated,
      });
    } catch (error) {
      logger.error('[MilestoneController] Error deleting reference image', { error });
      throw new AppError('Failed to delete reference image', 500);
    }
  }
}
