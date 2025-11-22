import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { OrganizationController } from '../controllers/organization.controller';

const router: Router = Router();

// Validation schemas
// Validation schemas can be added later if needed

// Create organization
router.post('/', authenticate as any, asyncHandler(OrganizationController.createOrganization)); // eslint-disable-line @typescript-eslint/no-explicit-any

// Get user's organizations
router.get('/', authenticate as any, asyncHandler(OrganizationController.getUserOrganizations)); // eslint-disable-line @typescript-eslint/no-explicit-any

// Get organization by ID
router.get('/:id', authenticate as any, asyncHandler(OrganizationController.getOrganizationById)); // eslint-disable-line @typescript-eslint/no-explicit-any

// Update organization
router.patch('/:id', authenticate as any, asyncHandler(OrganizationController.updateOrganization)); // eslint-disable-line @typescript-eslint/no-explicit-any

// Delete organization
router.delete('/:id', authenticate as any, asyncHandler(OrganizationController.deleteOrganization)); // eslint-disable-line @typescript-eslint/no-explicit-any

// Validate invite token (public - no auth) - MUST come before /:id routes
router.get('/invites/validate/:token', asyncHandler(OrganizationController.validateInviteToken));

// Accept organization invite by ID - MUST come before /:id routes
router.post(
  '/invites/:inviteId/accept',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(OrganizationController.acceptInvite)
);

// Accept organization invite by token (for new users)
router.post(
  '/invites/token/:token/accept',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(OrganizationController.acceptInviteByToken)
);

// Decline organization invite by ID
router.post(
  '/invites/:inviteId/decline',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(OrganizationController.declineInvite)
);

// Decline organization invite by token
router.post(
  '/invites/token/:token/decline',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(OrganizationController.declineInviteByToken)
);

// Invite member to organization
router.post('/:id/invite', authenticate as any, asyncHandler(OrganizationController.inviteMember)); // eslint-disable-line @typescript-eslint/no-explicit-any

// Get pending invites for organization
router.get(
  '/:id/invites',
  authenticate as any,
  asyncHandler(OrganizationController.getPendingInvites)
); // eslint-disable-line @typescript-eslint/no-explicit-any

// Get organization members
router.get('/:id/members', authenticate as any, asyncHandler(OrganizationController.getMembers)); // eslint-disable-line @typescript-eslint/no-explicit-any

// Remove member from organization
router.delete(
  '/:id/members/:memberId',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(OrganizationController.removeMember)
);

export default router;
