import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { DocumentService } from '../services/document.service';
import { logger } from '../utils/logger';
import { prisma } from '../lib/prisma';

const documentService = new DocumentService();

/**
 * Upload a document for a project or milestone
 */
export const uploadDocument = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    const { projectId, milestoneId } = req.body;
    const userId = req.user?.id;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required' });
    }

    // Verify user has access to the project
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Verify milestone belongs to project if provided
    if (milestoneId) {
      const milestone = await prisma.milestone.findFirst({
        where: {
          id: milestoneId,
          projectId: projectId,
        },
      });

      if (!milestone) {
        return res.status(404).json({ error: 'Milestone not found or does not belong to project' });
      }
    }

    // Upload document
    const document = await documentService.uploadDocument({
      projectId,
      milestoneId,
      uploadedBy: userId,
      file: req.file.buffer,
      fileName: req.file.originalname,
      fileType: req.file.mimetype,
      fileSizeBytes: req.file.size,
    });

    logger.info(`✅ Document uploaded: ${document.id} by user ${userId}`);

    return res.status(201).json(document);
  } catch (error) {
    logger.error('❌ Error uploading document:', error);
    return res.status(500).json({ error: 'Failed to upload document' });
  }
};

/**
 * Get documents for a project
 */
export const getProjectDocuments = async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const { milestoneId } = req.query;

    const where: any = { projectId };
    if (milestoneId) {
      where.milestoneId = milestoneId as string;
    }

    const documents = await prisma.document.findMany({
      where,
      include: {
        milestone: {
          select: {
            id: true,
            title: true,
          },
        },
        uploader: {
          select: {
            id: true,
            githubUsername: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(documents);
  } catch (error) {
    logger.error('❌ Error fetching documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
};

/**
 * Get a single document by ID
 */
export const getDocument = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;

    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        project: {
          select: {
            id: true,
            title: true,
          },
        },
        milestone: {
          select: {
            id: true,
            title: true,
          },
        },
        uploader: {
          select: {
            id: true,
            githubUsername: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    return res.json(document);
  } catch (error) {
    logger.error('❌ Error fetching document:', error);
    return res.status(500).json({ error: 'Failed to fetch document' });
  }
};

/**
 * Delete a document
 */
export const deleteDocument = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        project: {
          select: {
            sponsorId: true,
          },
        },
      },
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Only sponsor or uploader can delete
    if (document.uploadedBy !== userId && document.project.sponsorId !== userId) {
      return res.status(403).json({ error: 'Unauthorized to delete this document' });
    }

    await prisma.document.delete({
      where: { id },
    });

    logger.info(`✅ Document deleted: ${id} by user ${userId}`);

    return res.json({ success: true });
  } catch (error) {
    logger.error('❌ Error deleting document:', error);
    return res.status(500).json({ error: 'Failed to delete document' });
  }
};
