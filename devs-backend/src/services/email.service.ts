import { logger } from '../utils/logger';
import { config } from '../config';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { publishEvent, KAFKA_TOPICS } from '../lib/kafka';

export interface EmailData {
  to: string;
  subject: string;
  html: string;
  text: string;
  from?: string;
}

export interface InviteEmailData {
  toEmail: string;
  toGithubUsername?: string;
  fromUserName: string;
  fromUserEmail: string;
  organizationName: string;
  inviterName: string;
  inviteLink: string;
  isPrivateRepo?: boolean;
}

export interface NotificationEmailData {
  toEmail: string;
  userName: string;
  title: string;
  message: string;
  actionUrl?: string;
  notificationType: string;
}

export interface PRNotificationEmailData {
  toEmail: string;
  contributorName: string;
  projectName: string;
  subMilestoneTitle: string;
  prUrl: string;
  status: 'linked' | 'verification_pending' | 'verification_success' | 'verification_failed';
}

export interface PaymentEmailData {
  toEmail: string;
  contributorName: string;
  amount: string;
  token: string;
  projectName: string;
  subMilestoneTitle: string;
  txHash: string;
}

export class EmailService {
  private enabled: boolean;
  private transporter: Transporter | null = null;
  private from: string;

  constructor() {
    this.enabled = config.email.enabled;
    this.from = `${config.email.fromName} <${config.email.from}>`;

    if (this.enabled) {
      // Initialize SMTP transporter
      this.transporter = nodemailer.createTransport(config.email.smtp);
      logger.info(
        `Email service initialized: SMTP enabled (${config.email.smtp.host}:${config.email.smtp.port})`
      );
    } else {
      logger.info('Email service disabled');
    }
  }

  /**
   * Send email using SMTP via Kafka (async)
   * Publishes email event to Kafka queue for async processing
   */
  private async sendEmail(to: string, subject: string, html: string, text: string) {
    if (!this.enabled) {
      logger.info('Email service disabled, skipping email send');
      return;
    }

    try {
      // Publish email event to Kafka for async processing
      await publishEvent(KAFKA_TOPICS.EMAIL_SEND, {
        id: `email-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        to,
        from: this.from,
        subject,
        html,
        text,
        timestamp: new Date().toISOString(),
      });

      logger.info(`[EMAIL] Queued email to: ${to} | Subject: ${subject}`);
    } catch (error) {
      logger.error('❌ Failed to queue email:', error);
      throw error;
    }
  }

  /**
   * Send email directly via SMTP (used by Kafka consumer)
   * This method is called by the email consumer worker
   */
  async sendEmailDirect(data: EmailData): Promise<void> {
    if (!this.enabled || !this.transporter) {
      logger.warn('Email service disabled or transporter not initialized');
      return;
    }

    try {
      const info = await this.transporter.sendMail({
        from: data.from || this.from,
        to: data.to,
        subject: data.subject,
        html: data.html,
        text: data.text,
      });

      logger.info(`✅ Email sent: ${info.messageId} | To: ${data.to} | Subject: ${data.subject}`);
    } catch (error) {
      logger.error('❌ Failed to send email via SMTP:', error);
      throw error;
    }
  } /**
   * Send organization invite email
   */
  async sendOrganizationInvite(data: InviteEmailData): Promise<void> {
    const html = this.generateOrgInviteHTML(data);
    const text = this.generateOrgInviteText(data);

    await this.sendEmail(
      data.toEmail,
      `${data.inviterName} invited you to join ${data.organizationName} on DevSponsor`,
      html,
      text
    );
  }

  /**
   * Send project invite email (for private repos)
   */
  async sendProjectInvite(data: InviteEmailData): Promise<void> {
    const html = this.generateProjectInviteHTML(data);
    const text = this.generateProjectInviteText(data);

    await this.sendEmail(
      data.toEmail,
      `${data.inviterName} invited you to contribute to a private project on DevSponsor`,
      html,
      text
    );
  }

  /**
   * Send GitHub repo collaborator invite notification
   */
  async sendRepoAccessGranted(data: {
    toEmail: string;
    userName: string;
    repoName: string;
    projectName: string;
  }): Promise<void> {
    const html = `
      <h2>🎉 Repository Access Granted</h2>
      <p>Hi ${data.userName},</p>
      <p>You've been granted access to the private repository:</p>
      <p><strong>${data.repoName}</strong></p>
      <p>For project: <strong>${data.projectName}</strong></p>
      <p>You should receive a GitHub collaborator invitation shortly. Please accept it to start working on tasks.</p>
      <p>Visit DevSponsor to claim tasks and start contributing!</p>
    `;

    const text = `Repository Access Granted\n\nHi ${data.userName},\n\nYou've been granted access to ${data.repoName} for project ${data.projectName}.\n\nAccept the GitHub invitation to start contributing.`;

    await this.sendEmail(
      data.toEmail,
      `Repository Access Granted - ${data.projectName}`,
      html,
      text
    );
  }

  /**
   * Send PR linked notification
   */
  async sendPRNotification(data: PRNotificationEmailData): Promise<void> {
    const statusMessages = {
      linked: 'Your PR has been linked successfully!',
      verification_pending: 'Your PR is being verified...',
      verification_success: '✅ Verification passed!',
      verification_failed: '❌ Verification failed',
    };

    const html = `
      <h2>${statusMessages[data.status]}</h2>
      <p>Hi ${data.contributorName},</p>
      <p>Project: <strong>${data.projectName}</strong></p>
      <p>Task: <strong>${data.subMilestoneTitle}</strong></p>
      <p>PR: <a href="${data.prUrl}">${data.prUrl}</a></p>
      ${data.status === 'verification_success' ? '<p>Your payment will be processed shortly.</p>' : ''}
      ${data.status === 'verification_failed' ? '<p>Please check the verification logs and fix the issues.</p>' : ''}
    `;

    const text = `${statusMessages[data.status]}\n\nProject: ${data.projectName}\nTask: ${data.subMilestoneTitle}\nPR: ${data.prUrl}`;

    await this.sendEmail(
      data.toEmail,
      `[DevSponsor] ${statusMessages[data.status]} - ${data.projectName}`,
      html,
      text
    );
  }

  /**
   * Send payment notification
   */
  async sendPaymentNotification(data: PaymentEmailData): Promise<void> {
    const html = `
      <h2>💰 Payment Sent!</h2>
      <p>Hi ${data.contributorName},</p>
      <p>Congratulations! Your payment has been processed:</p>
      <ul>
        <li>Amount: <strong>${data.amount} ${data.token}</strong></li>
        <li>Project: <strong>${data.projectName}</strong></li>
        <li>Task: <strong>${data.subMilestoneTitle}</strong></li>
        <li>Transaction: <a href="https://etherscan.io/tx/${data.txHash}">${data.txHash.substring(0, 10)}...</a></li>
      </ul>
      <p>Keep up the great work!</p>
    `;

    const text = `Payment Sent!\n\nAmount: ${data.amount} ${data.token}\nProject: ${data.projectName}\nTask: ${data.subMilestoneTitle}\nTx: ${data.txHash}`;

    await this.sendEmail(
      data.toEmail,
      `[DevSponsor] Payment Received - ${data.amount} ${data.token}`,
      html,
      text
    );
  }

  /**
   * Send AI milestone generation complete notification
   */
  async sendAIMilestoneReady(data: {
    toEmail: string;
    sponsorName: string;
    projectName: string;
    milestoneCount: number;
    dashboardUrl: string;
  }): Promise<void> {
    const html = `
      <h2>🤖 AI Milestones Generated</h2>
      <p>Hi ${data.sponsorName},</p>
      <p>Your AI-generated milestones are ready for project:</p>
      <p><strong>${data.projectName}</strong></p>
      <p>Generated ${data.milestoneCount} milestones with sub-tasks.</p>
      <p><a href="${data.dashboardUrl}">Review and Edit Milestones →</a></p>
    `;

    const text = `AI Milestones Generated\n\nProject: ${data.projectName}\nMilestones: ${data.milestoneCount}\n\nReview at: ${data.dashboardUrl}`;

    await this.sendEmail(
      data.toEmail,
      `[DevSponsor] AI Milestones Ready - ${data.projectName}`,
      html,
      text
    );
  }

  /**
   * Send task claimed notification to sponsor
   */
  async sendTaskClaimedNotification(data: {
    toEmail: string;
    sponsorName: string;
    contributorName: string;
    projectName: string;
    taskTitle: string;
  }): Promise<void> {
    const html = `
      <h2>👤 Task Claimed</h2>
      <p>Hi ${data.sponsorName},</p>
      <p><strong>${data.contributorName}</strong> has claimed a task in your project:</p>
      <p>Project: <strong>${data.projectName}</strong></p>
      <p>Task: <strong>${data.taskTitle}</strong></p>
    `;

    const text = `Task Claimed\n\n${data.contributorName} claimed a task in ${data.projectName}\nTask: ${data.taskTitle}`;

    await this.sendEmail(
      data.toEmail,
      `[DevSponsor] Task Claimed - ${data.projectName}`,
      html,
      text
    );
  }

  // Helper methods for HTML generation
  private generateOrgInviteHTML(data: InviteEmailData): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .button { background: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; }
          .footer { margin-top: 40px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>You're Invited to Join ${data.organizationName}!</h2>
          <p>Hi${data.toGithubUsername ? ` @${data.toGithubUsername}` : ''},</p>
          <p><strong>${data.inviterName}</strong> (${data.fromUserEmail}) has invited you to join the <strong>${data.organizationName}</strong> organization on DevSponsor.</p>
          ${data.isPrivateRepo ? "<p><em>This organization has private repositories. You'll receive GitHub collaborator invitations after accepting.</em></p>" : ''}
          <p><a href="${data.inviteLink}" class="button">Accept Invitation</a></p>
          <div class="footer">
            <p>If you didn't expect this invitation, you can safely ignore this email.</p>
            <p>DevSponsor - Developer Funding Platform</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private generateOrgInviteText(data: InviteEmailData): string {
    return `
You're Invited to Join ${data.organizationName}!

Hi${data.toGithubUsername ? ` @${data.toGithubUsername}` : ''},

${data.inviterName} (${data.fromUserEmail}) has invited you to join the ${data.organizationName} organization on DevSponsor.

${data.isPrivateRepo ? "This organization has private repositories. You'll receive GitHub collaborator invitations after accepting." : ''}

Accept invitation: ${data.inviteLink}

---
DevSponsor - Developer Funding Platform
    `.trim();
  }

  private generateProjectInviteHTML(data: InviteEmailData): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .button { background: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; }
          .highlight { background: #fffbcc; padding: 10px; border-left: 4px solid #ffcc00; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>🔒 Private Project Invitation</h2>
          <p>Hi${data.toGithubUsername ? ` @${data.toGithubUsername}` : ''},</p>
          <p><strong>${data.inviterName}</strong> from <strong>${data.organizationName}</strong> has invited you to contribute to a private project on DevSponsor.</p>
          <div class="highlight">
            <p><strong>Important:</strong> After accepting, you'll receive a GitHub collaborator invitation for the private repository. Make sure to accept both to start contributing.</p>
          </div>
          <p><a href="${data.inviteLink}" class="button">Accept Invitation</a></p>
        </div>
      </body>
      </html>
    `;
  }

  private generateProjectInviteText(data: InviteEmailData): string {
    return `
Private Project Invitation

Hi${data.toGithubUsername ? ` @${data.toGithubUsername}` : ''},

${data.inviterName} from ${data.organizationName} has invited you to contribute to a private project on DevSponsor.

IMPORTANT: After accepting, you'll receive a GitHub collaborator invitation. Accept both to start contributing.

Accept invitation: ${data.inviteLink}

---
DevSponsor - Developer Funding Platform
    `.trim();
  }

  /**
   * Send welcome email to new users after onboarding
   */
  async sendWelcomeEmail(data: {
    toEmail: string;
    userName: string;
    role: string;
    githubUsername: string;
  }): Promise<void> {
    const roleMessages: Record<string, string> = {
      SPONSOR: 'Create projects, fund development, and grow your open-source ecosystem.',
      DEVELOPER: 'Browse projects, claim tasks, and earn rewards for your contributions.',
      CONTRIBUTOR: 'Browse projects, claim tasks, and earn rewards for your contributions.',
    };

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #2563eb;">🎉 Welcome to DevSponsor!</h1>
        <p>Hi <strong>${data.userName}</strong>,</p>
        <p>Thank you for joining DevSponsor as a <strong>${data.role}</strong>!</p>
        <p>${roleMessages[data.role] || 'Start exploring projects and collaborating with the community.'}</p>
        
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h2 style="margin-top: 0;">🚀 Quick Start Guide</h2>
          ${
            data.role === 'SPONSOR'
              ? `
            <ul>
              <li><strong>Create an Organization:</strong> Group your projects under a single entity</li>
              <li><strong>Launch Your First Project:</strong> Share your vision and funding</li>
              <li><strong>AI-Powered Milestones:</strong> Let AI help break down your project</li>
              <li><strong>Fund Development:</strong> Choose between escrow or yield-based funding</li>
            </ul>
          `
              : `
            <ul>
              <li><strong>Browse Projects:</strong> Find projects that match your skills</li>
              <li><strong>Claim Tasks:</strong> Pick sub-milestones and start contributing</li>
              <li><strong>Link Pull Requests:</strong> Connect your work for automatic verification</li>
              <li><strong>Earn Rewards:</strong> Get paid for merged contributions</li>
            </ul>
          `
          }
        </div>

        <p>Your GitHub account <strong>@${data.githubUsername}</strong> is connected and ready to go!</p>
        
        <div style="margin: 30px 0;">
          <a href="${config.server.frontendUrl}/dashboard" 
             style="background-color: #2563eb; color: white; padding: 12px 24px; 
                    text-decoration: none; border-radius: 6px; display: inline-block;">
            Go to Dashboard
          </a>
        </div>

        <p>If you have any questions, feel free to reach out to our support team.</p>
        
        <p style="margin-top: 30px; color: #6b7280; font-size: 14px;">
          Happy coding,<br/>
          The DevSponsor Team
        </p>
        
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;"/>
        <p style="color: #9ca3af; font-size: 12px; text-align: center;">
          DevSponsor - Empowering Open Source Development
        </p>
      </div>
    `;

    const text = `
Welcome to DevSponsor!

Hi ${data.userName},

Thank you for joining DevSponsor as a ${data.role}!

${roleMessages[data.role] || 'Start exploring projects and collaborating with the community.'}

Your GitHub account @${data.githubUsername} is connected and ready to go!

Visit your dashboard: ${config.server.frontendUrl}/dashboard

Happy coding,
The DevSponsor Team
    `.trim();

    await this.sendEmail(data.toEmail, '🎉 Welcome to DevSponsor!', html, text);
  }
}

export const emailService = new EmailService();
