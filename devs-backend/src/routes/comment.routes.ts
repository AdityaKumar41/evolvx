import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { CommentController } from '../controllers/comment.controller';

const router: Router = Router();

// Get comments for a submilestone
router.get(
  '/submilestone/:submilestoneId',
  authenticate as any,
  asyncHandler(CommentController.getComments)
);

// Create a comment on a submilestone
router.post(
  '/submilestone/:submilestoneId',
  authenticate as any,
  asyncHandler(CommentController.createComment)
);

// Update a comment
router.put('/:commentId', authenticate as any, asyncHandler(CommentController.updateComment));

// Delete a comment
router.delete('/:commentId', authenticate as any, asyncHandler(CommentController.deleteComment));

export default router;
