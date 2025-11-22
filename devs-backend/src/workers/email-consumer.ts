/**
 * Email Consumer Worker
 * Consumes email events from Kafka queue and sends emails via SMTP
 */
import { subscribeToTopic, KAFKA_TOPICS } from '../lib/kafka';
import { emailService } from '../services/email.service';
import type { EmailData } from '../services/email.service';
import { logger } from '../utils/logger';

export async function startEmailConsumer() {
  try {
    logger.info('🚀 Starting Email Consumer...');

    await subscribeToTopic(KAFKA_TOPICS.EMAIL_SEND, async ({ message }) => {
      try {
        const emailData = JSON.parse(message.value?.toString() || '{}') as EmailData & {
          id: string;
          timestamp: string;
        };

        logger.info(`📧 Processing email: ${emailData.id} | To: ${emailData.to}`);

        // Send email via SMTP
        await emailService.sendEmailDirect({
          to: emailData.to,
          from: emailData.from,
          subject: emailData.subject,
          html: emailData.html,
          text: emailData.text,
        });

        logger.info(`✅ Email sent successfully: ${emailData.id}`);
      } catch (error) {
        logger.error('❌ Error processing email from Kafka:', error);
        // In production, you might want to implement retry logic or dead letter queue
      }
    });

    logger.info('✅ Email Consumer started successfully');
  } catch (error) {
    logger.error('❌ Failed to start Email Consumer:', error);
    throw error;
  }
}

// Start consumer if this file is run directly
if (require.main === module) {
  startEmailConsumer().catch((error) => {
    logger.error('❌ Email Consumer crashed:', error);
    process.exit(1);
  });
}
