import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { logger } from '../utils/logger';
import { redis } from '../lib/redis';
import { verifyJWT } from '../middleware/auth';

export interface SocketUser {
  userId: string;
  githubUsername: string;
  role: string;
}

export interface NotificationPayload {
  id: string;
  type: string;
  message: string;
  data?: Record<string, unknown>;
  createdAt: Date;
}

export interface TaskUpdatePayload {
  taskId: string;
  status: string;
  claimedBy?: string;
  updatedAt: Date;
}

export interface PaymentNotification {
  contributionId: string;
  amount: number;
  token: string;
  txHash: string;
}

export interface PRStatusUpdate {
  contributionId: string;
  prUrl: string;
  status: string;
}

export class WebSocketServer {
  private io: Server;
  private connectedUsers: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds

  constructor(httpServer: HttpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        methods: ['GET', 'POST'],
        credentials: true,
      },
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    this.setupMiddleware();
    this.setupEventHandlers();
    this.subscribeToRedis();

    logger.info('WebSocket server initialized');
  }

  /**
   * Setup Socket.io middleware for authentication
   */
  private setupMiddleware() {
    this.io.use(async (socket: Socket, next: (err?: Error) => void) => {
      try {
        const token =
          socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

        if (!token) {
          return next(new Error('Authentication token missing'));
        }

        // Verify JWT token
        const decoded = verifyJWT(token);

        if (!decoded || !decoded.userId) {
          return next(new Error('Invalid authentication token'));
        }

        // Attach user data to socket
        (socket as Socket & { user: SocketUser }).user = {
          userId: decoded.userId,
          githubUsername: decoded.githubUsername,
          role: decoded.role,
        };

        next();
      } catch (error) {
        logger.error('WebSocket authentication error:', error);
        next(new Error('Authentication failed'));
      }
    });
  }

  /**
   * Setup Socket.io event handlers
   */
  private setupEventHandlers() {
    this.io.on('connection', (socket: Socket) => {
      const user = (socket as Socket & { user: SocketUser }).user;

      if (!user) {
        logger.warn('Socket connected without user data');
        socket.disconnect();
        return;
      }

      logger.info(`User ${user.githubUsername} connected via WebSocket (socket: ${socket.id})`);

      // Track connected user
      if (!this.connectedUsers.has(user.userId)) {
        this.connectedUsers.set(user.userId, new Set());
      }
      this.connectedUsers.get(user.userId)!.add(socket.id);

      // Join user-specific room
      socket.join(`user:${user.userId}`);

      // Handle room subscriptions
      socket.on('subscribe:project', (projectId: string) => {
        socket.join(`project:${projectId}`);
        logger.info(`User ${user.githubUsername} subscribed to project ${projectId}`);
      });

      socket.on('unsubscribe:project', (projectId: string) => {
        socket.leave(`project:${projectId}`);
        logger.info(`User ${user.githubUsername} unsubscribed from project ${projectId}`);
      });

      socket.on('subscribe:organization', (orgId: string) => {
        socket.join(`organization:${orgId}`);
        logger.info(`User ${user.githubUsername} subscribed to organization ${orgId}`);
      });

      socket.on('unsubscribe:organization', (orgId: string) => {
        socket.leave(`organization:${orgId}`);
        logger.info(`User ${user.githubUsername} unsubscribed from organization ${orgId}`);
      });

      // Handle typing indicators
      socket.on('typing:start', (data: { projectId: string }) => {
        socket.to(`project:${data.projectId}`).emit('user:typing', {
          userId: user.userId,
          username: user.githubUsername,
          projectId: data.projectId,
        });
      });

      socket.on('typing:stop', (data: { projectId: string }) => {
        socket.to(`project:${data.projectId}`).emit('user:stopped:typing', {
          userId: user.userId,
          username: user.githubUsername,
          projectId: data.projectId,
        });
      });

      // Handle disconnection
      socket.on('disconnect', (reason: string) => {
        logger.info(`User ${user.githubUsername} disconnected: ${reason}`);

        // Remove socket from tracked connections
        const userSockets = this.connectedUsers.get(user.userId);
        if (userSockets) {
          userSockets.delete(socket.id);
          if (userSockets.size === 0) {
            this.connectedUsers.delete(user.userId);
          }
        }
      });

      // Handle errors
      socket.on('error', (error: Error) => {
        logger.error(`Socket error for user ${user.githubUsername}:`, error);
      });
    });
  }

  /**
   * Subscribe to Redis pub/sub for cross-server events
   */
  private async subscribeToRedis() {
    try {
      const subscriber = redis.duplicate();

      // Check if already connected to avoid duplicate connection errors
      if (subscriber.status !== 'ready' && subscriber.status !== 'connecting') {
        await subscriber.connect();
      }

      // Subscribe to channels
      await subscriber.subscribe('notifications');
      await subscriber.subscribe('task-updates');
      await subscriber.subscribe('payments');
      await subscriber.subscribe('pr-status');
      await subscriber.subscribe('repo-analysis');
      await subscriber.subscribe('milestone-generation');

      // Handle incoming messages
      subscriber.on('message', (channel: string, message: string) => {
        try {
          const data = JSON.parse(message);

          switch (channel) {
            case 'notifications':
              this.sendNotificationToUser(data.userId, data.notification);
              break;
            case 'task-updates':
              this.broadcastTaskUpdate(data.projectId, data.update);
              break;
            case 'payments':
              this.sendPaymentNotification(data.userId, data.payment);
              break;
            case 'pr-status':
              this.sendPRStatusUpdate(data.userId, data.projectId, data.update);
              break;
            case 'repo-analysis':
              this.sendRepoAnalysisUpdate(data.projectId, data.update);
              break;
            case 'milestone-generation':
              this.sendMilestoneGenerationProgress(data.projectId, data.update);
              break;
            default:
              logger.warn(`Unknown Redis channel: ${channel}`);
          }
        } catch (error) {
          logger.error(`Error processing message from Redis channel ${channel}:`, error);
        }
      });

      logger.info('WebSocket server subscribed to Redis channels');
    } catch (error) {
      logger.error('Error subscribing to Redis:', error);
    }
  }

  /**
   * Send notification to a specific user
   */
  public sendNotificationToUser(userId: string, notification: NotificationPayload) {
    this.io.to(`user:${userId}`).emit('notification', notification);
    logger.info(`Notification sent to user ${userId}: ${notification.type}`);
  }

  /**
   * Broadcast task update to project room
   */
  public broadcastTaskUpdate(projectId: string, update: TaskUpdatePayload) {
    this.io.to(`project:${projectId}`).emit('task:update', update);
    logger.info(`Task update broadcast to project ${projectId}`);
  }

  /**
   * Send payment notification to user
   */
  public sendPaymentNotification(userId: string, payment: PaymentNotification) {
    this.io.to(`user:${userId}`).emit('payment:received', payment);
    logger.info(`Payment notification sent to user ${userId}: ${payment.amount} ${payment.token}`);
  }

  /**
   * Send PR status update
   */
  public sendPRStatusUpdate(userId: string, projectId: string, update: PRStatusUpdate) {
    // Send to user
    this.io.to(`user:${userId}`).emit('pr:status', update);

    // Also broadcast to project room
    this.io.to(`project:${projectId}`).emit('pr:status', update);

    logger.info(`PR status update sent for contribution ${update.contributionId}`);
  }

  /**
   * Broadcast milestone completion
   */
  public broadcastMilestoneCompletion(
    projectId: string,
    milestoneId: string,
    data: Record<string, unknown>
  ) {
    this.io.to(`project:${projectId}`).emit('milestone:completed', {
      milestoneId,
      ...data,
    });
    logger.info(`Milestone completion broadcast for ${milestoneId}`);
  }

  /**
   * Send project funding notification
   */
  public sendProjectFunding(projectId: string, data: Record<string, unknown>) {
    this.io.to(`project:${projectId}`).emit('project:funded', data);
    logger.info(`Project funding notification sent for ${projectId}`);
  }

  /**
   * Send repository analysis progress update
   */
  public sendRepoAnalysisUpdate(projectId: string, update: Record<string, unknown>) {
    this.io.to(`project:${projectId}`).emit('repo-analysis:progress', update);
    logger.info(`Repo analysis update sent for project ${projectId}: ${update.status}`);
  }

  /**
   * Send milestone generation progress update
   */
  public sendMilestoneGenerationProgress(
    projectId: string,
    update: {
      stage:
        | 'started'
        | 'analyzing-documents'
        | 'fetching-github'
        | 'generating-claude'
        | 'generating-gpt'
        | 'saving'
        | 'completed'
        | 'error';
      message: string;
      progress?: number;
      data?: Record<string, unknown>;
    }
  ) {
    this.io.to(`project:${projectId}`).emit('milestone:generation:progress', update);
    logger.info(
      `Milestone generation progress for ${projectId}: ${update.stage} - ${update.message}`
    );
  }

  /**
   * Stream milestone as it's being generated
   */
  public streamMilestone(
    projectId: string,
    milestone: {
      title: string;
      description: string;
      reward?: number;
      estimatedDays?: number;
      subMilestones?: Array<{ title: string; description: string }>;
    }
  ) {
    this.io.to(`project:${projectId}`).emit('milestone:stream', milestone);
    logger.info(`Streaming milestone for ${projectId}: ${milestone.title}`);
  }

  /**
   * Check if user is connected
   */
  public isUserConnected(userId: string): boolean {
    return this.connectedUsers.has(userId);
  }

  /**
   * Get connected user count
   */
  public getConnectedUserCount(): number {
    return this.connectedUsers.size;
  }

  /**
   * Get all rooms a user has joined
   */
  public getUserRooms(userId: string): string[] {
    const socketIds = this.connectedUsers.get(userId);
    if (!socketIds || socketIds.size === 0) return [];

    const rooms = new Set<string>();
    for (const socketId of socketIds) {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.rooms.forEach((room: string) => {
          if (room !== socketId) {
            rooms.add(room);
          }
        });
      }
    }

    return Array.from(rooms);
  }

  /**
   * Shutdown WebSocket server
   */
  public async shutdown() {
    logger.info('Shutting down WebSocket server...');

    // Disconnect all clients
    this.io.disconnectSockets();

    // Close server
    await new Promise<void>((resolve) => {
      this.io.close(() => {
        logger.info('WebSocket server shut down');
        resolve();
      });
    });
  }
}

export let websocketServer: WebSocketServer | null = null;

export function initializeWebSocket(httpServer: HttpServer): WebSocketServer {
  if (websocketServer) {
    logger.warn('WebSocket server already initialized');
    return websocketServer;
  }

  websocketServer = new WebSocketServer(httpServer);
  return websocketServer;
}

export function getWebSocketServer(): WebSocketServer {
  if (!websocketServer) {
    throw new Error('WebSocket server not initialized');
  }
  return websocketServer;
}
