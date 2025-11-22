/**
 * Test script for AI Chat Intent Classification
 *
 * Run with: npx tsx scripts/test-intent-classification-fixed.ts
 */

import { AIChatOrchestrationService } from '../src/services/ai-chat-orchestration.service';

const orchestrationService = new AIChatOrchestrationService();

interface TestCase {
  name: string;
  message: string;
  expectedIntent: string;
  shouldGenerateMilestones: boolean;
}

const testCases: TestCase[] = [
  {
    name: 'Simple repository question',
    message: "What's in my repository?",
    expectedIntent: 'information_query',
    shouldGenerateMilestones: false,
  },
  {
    name: 'Progress check',
    message: "Show me what we've built so far",
    expectedIntent: 'information_query',
    shouldGenerateMilestones: false,
  },
  {
    name: 'Asking about milestones',
    message: 'What are my current milestones?',
    expectedIntent: 'information_query',
    shouldGenerateMilestones: false,
  },
  {
    name: 'Short milestone request without PRD',
    message: 'Create milestones for a new authentication feature',
    expectedIntent: 'general_chat',
    shouldGenerateMilestones: false,
  },
  {
    name: 'Code analysis request',
    message:
      'Can you analyze the authentication system and tell me if there are any security issues?',
    expectedIntent: 'code_analysis',
    shouldGenerateMilestones: false,
  },
  {
    name: 'Full PRD with milestone request',
    message: `Here's my complete PRD for a task management system:

I want to build a comprehensive task management platform with the following features:

1. User Authentication & Authorization
   - Email/password registration and login
   - OAuth integration with Google and GitHub
   - JWT-based session management with refresh tokens
   - Role-based access control (Admin, Manager, Member)
   - Password reset via email

2. Task Management
   - Create, edit, and delete tasks
   - Assign tasks to team members
   - Set priorities (Low, Medium, High, Critical)
   - Due dates with calendar integration
   - Task dependencies and subtasks
   - Add tags and categories for organization
   - Rich text descriptions with markdown support
   - File attachments up to 10MB

3. Team Collaboration
   - Real-time updates using WebSocket
   - Comment threads on each task
   - @mentions to notify team members
   - Activity feed showing all team actions
   - Team chat for quick communication

4. Project Management
   - Create multiple projects/workspaces
   - Kanban board view
   - List view with filters and sorting
   - Calendar view for due dates
   - Gantt chart for timeline visualization

5. Notifications
   - Email notifications for task assignments and updates
   - In-app notification center
   - Browser push notifications
   - Customizable notification preferences per user
   - Daily digest emails

6. Dashboard & Analytics
   - Overview dashboard with key metrics
   - Task completion statistics
   - Team productivity charts
   - Sprint burndown charts
   - Time tracking and reporting
   - Export reports to PDF/CSV

7. Mobile Support
   - Responsive web design
   - Progressive Web App (PWA) capabilities
   - Native mobile apps (iOS and Android) in future phase

Technical Requirements:
- Backend: Node.js with Express/NestJS
- Frontend: React with TypeScript
- Database: PostgreSQL for relational data, Redis for caching
- Real-time: Socket.io for WebSocket connections
- File Storage: AWS S3 or similar
- Deployment: Docker containers on AWS/GCP

Please generate milestones from this PRD to help structure the development roadmap.`,
    expectedIntent: 'milestone_generation',
    shouldGenerateMilestones: true,
  },
];

async function runTests() {
  console.log('🧪 Testing AI Chat Intent Classification\n');
  console.log('='.repeat(80));

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    console.log(`\n📝 Test: ${testCase.name}`);
    console.log(`📄 Message length: ${testCase.message.length} characters`);
    console.log(
      `💬 Message: "${testCase.message.substring(0, 100)}${testCase.message.length > 100 ? '...' : ''}"`
    );

    try {
      const result = await orchestrationService.classifyIntent(
        testCase.message,
        [], // Empty conversation history
        {
          hasRepository: true,
          hasMilestones: false,
          description: 'A project using Node.js, React, and PostgreSQL',
        }
      );

      const intentMatches = result.intent === testCase.expectedIntent;
      const milestoneGenMatches =
        result.requiresMilestoneGeneration === testCase.shouldGenerateMilestones;

      if (intentMatches && milestoneGenMatches) {
        console.log(`✅ PASS`);
        console.log(`   Intent: ${result.intent} (confidence: ${result.confidence})`);
        console.log(`   Generate Milestones: ${result.requiresMilestoneGeneration}`);
        console.log(`   Reasoning: ${result.reasoning}`);
        passed++;
      } else {
        console.log(`❌ FAIL`);
        console.log(`   Expected Intent: ${testCase.expectedIntent}`);
        console.log(`   Actual Intent: ${result.intent} (confidence: ${result.confidence})`);
        console.log(`   Expected Milestone Gen: ${testCase.shouldGenerateMilestones}`);
        console.log(`   Actual Milestone Gen: ${result.requiresMilestoneGeneration}`);
        console.log(`   Reasoning: ${result.reasoning}`);
        failed++;
      }
    } catch (error) {
      console.log(`💥 ERROR: ${error}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${testCases.length} tests`);

  if (failed === 0) {
    console.log('\n🎉 All tests passed! Intent classification is working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Review the classification logic.');
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(console.error);
