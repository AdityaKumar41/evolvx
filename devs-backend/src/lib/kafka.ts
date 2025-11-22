import { Kafka, Producer, Consumer, EachMessagePayload } from 'kafkajs';
import { config } from '../config';
import { logger } from '../utils/logger';

export const kafka = new Kafka({
  clientId: config.kafka.clientId,
  brokers: config.kafka.brokers,
  retry: {
    initialRetryTime: 100,
    retries: 8,
  },
});

export type { EachMessagePayload };

// Kafka Topics (Based on PRD Section 6.2)
export const KAFKA_TOPICS = {
  GITHUB_COMMIT: 'github.commit',
  PROOF_GENERATED: 'proof.generated',
  PROOF_SUBMITTED: 'proof.submitted',
  PROOF_VERIFIED: 'proof.verified',
  PAYOUT_SUCCESS: 'payout.success',
  PAYOUT_FAILED: 'payout.failed',
  PROJECT_FUNDED: 'project.funded',
  PROJECT_UPDATED: 'project.updated',
  AI_MILESTONES_GENERATED: 'ai.milestones.generated',
  MILESTONE_STRUCTURE_GENERATED: 'milestone.structure.generated',
  MILESTONE_RESCOPED: 'milestone.rescoped',
  TASK_CLAIMED: 'task.claimed',
  PR_LINKED: 'pr.linked',
  PR_SUBMITTED: 'pr.submitted',
  VERIFICATION_JOB_CREATED: 'verification.job.created',
  VERIFICATION_JOB_COMPLETED: 'verification.job.completed',
  ZK_PROOF_CREATED: 'zk.proof.created',
  PAYMENT_COMPLETED: 'payment.completed',
  YIELD_HARVESTED: 'yield.harvested',
  REPO_PRIVATE_INVITE_REQUIRED: 'repo.private.invite.required',
  NOTIFICATION_TRIGGERED: 'notification.triggered',
  AUDIT_LOG: 'audit.log',
  EMAIL_SEND: 'email.send',
  // Repository Analysis Events
  REPO_ANALYSIS_REQUESTED: 'repo.analysis.requested',
  REPO_ANALYSIS_STARTED: 'repo.analysis.started',
  REPO_ANALYSIS_PROGRESS: 'repo.analysis.progress',
  REPO_ANALYSIS_COMPLETED: 'repo.analysis.completed',
  REPO_ANALYSIS_FAILED: 'repo.analysis.failed',
} as const;

let producer: Producer | null = null;
let consumer: Consumer | null = null;
const consumers: Map<string, Consumer> = new Map();

export const getProducer = async (): Promise<Producer> => {
  if (!producer) {
    producer = kafka.producer();
    await producer.connect();
    logger.info('✅ Kafka producer connected');
  }
  return producer;
};

export const getConsumer = async (groupId?: string): Promise<Consumer> => {
  const consumerGroupId = groupId || config.kafka.groupId;

  // Check if consumer for this group already exists
  if (consumers.has(consumerGroupId)) {
    return consumers.get(consumerGroupId)!;
  }

  // Create new consumer for this group
  const newConsumer = kafka.consumer({ groupId: consumerGroupId });
  await newConsumer.connect();
  consumers.set(consumerGroupId, newConsumer);
  logger.info(`✅ Kafka consumer connected for group: ${consumerGroupId}`);

  return newConsumer;
};

export const publishEvent = async (topic: string, message: Record<string, unknown>) => {
  try {
    const producer = await getProducer();
    await producer.send({
      topic,
      messages: [
        {
          key: (message.id as string) || Date.now().toString(),
          value: JSON.stringify(message),
          timestamp: Date.now().toString(),
        },
      ],
    });
    logger.debug(`📤 Published event to ${topic}:`, message);
  } catch (error) {
    logger.error(`❌ Failed to publish event to ${topic}:`, error);
    // Don't throw - let the caller handle gracefully
    return false;
  }
  return true;
};

export const subscribeToTopic = async (
  topic: string,
  handler: (payload: EachMessagePayload) => Promise<void>
) => {
  try {
    consumer = await getConsumer();
    await consumer.subscribe({ topic, fromBeginning: false });

    await consumer.run({
      eachMessage: async (payload) => {
        try {
          logger.debug(`📥 Received event from ${topic}`);
          await handler(payload);
        } catch (error) {
          logger.error(`❌ Error processing message from ${topic}:`, error);
        }
      },
    });

    logger.info(`✅ Subscribed to Kafka topic: ${topic}`);
  } catch (error) {
    logger.error(`❌ Failed to subscribe to ${topic}:`, error);
    throw error;
  }
};

export const disconnectKafka = async () => {
  if (producer) {
    await producer.disconnect();
    logger.info('Kafka producer disconnected');
  }

  // Disconnect all consumers
  for (const [groupId, consumerInstance] of consumers.entries()) {
    await consumerInstance.disconnect();
    logger.info(`Kafka consumer disconnected for group: ${groupId}`);
  }
  consumers.clear();

  // Disconnect legacy consumer if exists
  if (consumer) {
    await consumer.disconnect();
    logger.info('Kafka consumer disconnected');
  }
};
