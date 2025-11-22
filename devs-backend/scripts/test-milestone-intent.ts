import { AIChatOrchestrationService } from '../src/services/ai-chat-orchestration.service';

const service = new AIChatOrchestrationService();

// Test cases that SHOULD trigger milestone generation
const shouldTrigger = [
  'Generate milestones for an e-commerce platform',
  'Create milestones for: user authentication, posts, comments, real-time notifications',
  'Build a social media app with profiles, posts, likes. Generate milestones',
  'I want to add payment integration and email notifications. Create milestones',
  'Generate milestones for building a task management system',
  'Create a roadmap for: API development, frontend, testing, deployment',
];

// Test cases that should NOT trigger milestone generation
const shouldNotTrigger = [
  'What are milestones?',
  'Show me my current milestones',
  "What's the progress on milestones?",
  "What's in the repository?",
  'Show me the code',
  'Tell me about the project',
];

async function testIntentClassification() {
  console.log('🧪 Testing Milestone Intent Classification\n');
  console.log('='.repeat(80));

  console.log('\n✅ SHOULD TRIGGER milestone_generation:\n');
  for (const message of shouldTrigger) {
    const intent = await service.classifyIntent(message, [], {
      hasRepository: true,
      hasMilestones: false,
    });
    const emoji = intent.requiresMilestoneGeneration ? '✅' : '❌';
    console.log(`${emoji} "${message}"`);
    console.log(
      `   → Intent: ${intent.intent}, Milestone Gen: ${intent.requiresMilestoneGeneration}`
    );
    console.log(`   → Reasoning: ${intent.reasoning}`);
    console.log();
  }

  console.log('\n❌ should NOT trigger milestone_generation:\n');
  for (const message of shouldNotTrigger) {
    const intent = await service.classifyIntent(message, [], {
      hasRepository: true,
      hasMilestones: true,
    });
    const emoji = intent.requiresMilestoneGeneration ? '❌ WRONG!' : '✅';
    console.log(`${emoji} "${message}"`);
    console.log(
      `   → Intent: ${intent.intent}, Milestone Gen: ${intent.requiresMilestoneGeneration}`
    );
    console.log(`   → Reasoning: ${intent.reasoning}`);
    console.log();
  }

  console.log('='.repeat(80));
  console.log('\n✨ Test completed!\n');
}

testIntentClassification().catch(console.error);
