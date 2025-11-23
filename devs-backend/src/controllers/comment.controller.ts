import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

export class CommentController {
  /**
   * Get comments for a submilestone
   */
  static async getComments(req: AuthRequest, res: Response) {
    const { submilestoneId } = req.params;

    const comments = await prisma.comment.findMany({
      where: {
        subMilestoneId: submilestoneId,
      },
      include: {
        user: {
          select: {
            id: true,
            githubUsername: true,
            avatarUrl: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json({ comments });
  }

  /**
   * Create a comment on a submilestone
   */
  static async createComment(req: AuthRequest, res: Response) {
    const { submilestoneId } = req.params;
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      throw new AppError('Comment content is required', 400);
    }

    // Verify submilestone exists
    const submilestone = await prisma.subMilestone.findUnique({
      where: { id: submilestoneId },
    });

    if (!submilestone) {
      throw new AppError('Submilestone not found', 404);
    }

    const comment = await prisma.comment.create({
      data: {
        subMilestoneId: submilestoneId,
        userId: req.user!.id,
        content: content.trim(),
      },
      include: {
        user: {
          select: {
            id: true,
            githubUsername: true,
            avatarUrl: true,
            name: true,
          },
        },
      },
    });

    res.status(201).json({ comment });
  }

  /**
   * Update a comment
   */
  static async updateComment(req: AuthRequest, res: Response) {
    const { commentId } = req.params;
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      throw new AppError('Comment content is required', 400);
    }

    // Verify comment exists and user is the owner
    const existingComment = await prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!existingComment) {
      throw new AppError('Comment not found', 404);
    }

    if (existingComment.userId !== req.user!.id && req.user!.role !== 'ADMIN') {
      throw new AppError('You can only edit your own comments', 403);
    }

    const comment = await prisma.comment.update({
      where: { id: commentId },
      data: {
        content: content.trim(),
      },
      include: {
        user: {
          select: {
            id: true,
            githubUsername: true,
            avatarUrl: true,
            name: true,
          },
        },
      },
    });

    res.json({ comment });
  }

  /**
   * Delete a comment
   */
  static async deleteComment(req: AuthRequest, res: Response) {
    const { commentId } = req.params;

    // Verify comment exists and user is the owner
    const existingComment = await prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!existingComment) {
      throw new AppError('Comment not found', 404);
    }

    if (existingComment.userId !== req.user!.id && req.user!.role !== 'ADMIN') {
      throw new AppError('You can only delete your own comments', 403);
    }

    await prisma.comment.delete({
      where: { id: commentId },
    });

    res.json({ message: 'Comment deleted successfully' });
  }
}
