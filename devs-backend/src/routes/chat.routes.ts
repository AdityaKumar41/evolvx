import { Router, RequestHandler } from 'express';
import multer from 'multer';
import { chatController } from '../controllers/chat.controller';
import { authenticate } from '../middleware/auth';

// Configure multer for document uploads in chat
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    // Allow PDF, DOCX, MD, TXT files
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/markdown',
      'text/plain',
    ];
    if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(md|txt)$/)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOCX, MD, and TXT files are allowed.'));
    }
  },
});

const router: Router = Router();

// All chat routes require authentication
router.use(authenticate as unknown as RequestHandler);

// Streaming chat endpoint
router.post('/stream', chatController.streamChat.bind(chatController) as unknown as RequestHandler);

// Non-streaming chat endpoint
router.post('/', chatController.sendMessage.bind(chatController) as unknown as RequestHandler);

// Conversation management
router.get(
  '/conversations',
  chatController.listConversations.bind(chatController) as unknown as RequestHandler
);
router.get(
  '/conversations/:id',
  chatController.getConversation.bind(chatController) as unknown as RequestHandler
);
router.delete(
  '/conversations/:id',
  chatController.deleteConversation.bind(chatController) as unknown as RequestHandler
);

// AI assistance features
router.post(
  '/suggestions',
  chatController.getTaskSuggestions.bind(chatController) as unknown as RequestHandler
);
router.post(
  '/rescoping',
  chatController.getRescopingRecommendation.bind(chatController) as unknown as RequestHandler
);
router.get(
  '/progress/:projectId',
  chatController.getProgressExplanation.bind(chatController) as unknown as RequestHandler
);

// AI Orchestration - Intelligent chat routing (Lovable-style)
router.get(
  '/projects/:projectId/conversation',
  chatController.getProjectConversation.bind(chatController) as unknown as RequestHandler
);
router.post(
  '/projects/:projectId/orchestrate',
  upload.array('documents', 5), // Allow up to 5 document uploads
  chatController.orchestrateProjectChat.bind(chatController) as unknown as RequestHandler
);
router.post(
  '/projects/:projectId/orchestrate/stream',
  upload.array('documents', 5), // Allow up to 5 document uploads
  chatController.streamOrchestrationChat.bind(chatController) as unknown as RequestHandler
);

export default router;
