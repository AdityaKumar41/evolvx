import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import {
  uploadDocument,
  getProjectDocuments,
  getDocument,
  deleteDocument,
} from '../controllers/document.controller';

const router: Router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    // Allow PDF and common image formats
    const allowedMimeTypes = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/gif',
      'text/markdown',
      'text/plain',
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          'Invalid file type. Only PDF, PNG, JPG, GIF, Markdown, and text files are allowed.'
        )
      );
    }
  },
});

// Upload document for a project/milestone
router.post(
  '/upload',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  upload.single('file'),
  asyncHandler(uploadDocument) as any // eslint-disable-line @typescript-eslint/no-explicit-any
);

// Get documents for a project (optionally filtered by milestone)
router.get(
  '/project/:projectId',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(getProjectDocuments) as any // eslint-disable-line @typescript-eslint/no-explicit-any
);

// Get a single document by ID
router.get(
  '/:id',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(getDocument) as any // eslint-disable-line @typescript-eslint/no-explicit-any
);

// Delete a document
router.delete(
  '/:id',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(deleteDocument) as any // eslint-disable-line @typescript-eslint/no-explicit-any
);

export default router;
