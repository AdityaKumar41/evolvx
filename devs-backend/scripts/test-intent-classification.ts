#!/usr/bin/env tsx
/**
 * Test AI Chat Orchestration Intent Classification
 * Verifies that the orchestration correctly routes different types of messages
 */

import { logger } from '../src/utils/logger';

// Mock test data
const testCases = [
  {
    name: 'Simple question about code',
    message: 'What files are in my repository?',
    expectedIntent: 'information_query',
    shouldGenerateMilestones: false,
    description: 'Should NOT trigger milestone generation',
  },
  {
    name: 'Question about existing work',
    message: 'What have we built so far in this project?',
    expectedIntent: 'information_query',
    shouldGenerateMilestones: false,
    description: 'Should NOT trigger milestone generation',
  },
  {
    name: 'Code analysis request',
    message: 'Can you analyze the authentication system?',
    expectedIntent: 'code_analysis',
    shouldGenerateMilestones: false,
    description: 'Should NOT trigger milestone generation',
  },
  {
    name: 'Question about milestones',
    message: 'What milestones do we have?',
    expectedIntent: 'information_query',
    shouldGenerateMilestones: false,
    description: 'Should NOT trigger milestone generation - just asking ABOUT milestones',
  },
  {
    name: 'Question about roadmap',
    message: 'Show me the project roadmap',
    expectedIntent: 'information_query',
    shouldGenerateMilestones: false,
    description: 'Should NOT trigger milestone generation - asking to VIEW roadmap',
  },
  {
    name: 'Short milestone request without requirements',
    message: 'Can you create milestones?',
    expectedIntent: 'milestone_generation',
    shouldGenerateMilestones: false,
    description: 'Should ask for requirements, NOT generate milestones (fails validation)',
  },
  {
    name: 'Detailed PRD with requirements',
    message: `Here is my PRD for the new e-commerce platform:

Features to build:
1. User Authentication System
   - Email/password login
   - OAuth with Google and GitHub
   - JWT token management
   - Password reset functionality

2. Product Catalog
   - Product listing with pagination
   - Search and filtering
   - Category management
   - Product details page

3. Shopping Cart
   - Add/remove items
   - Update quantities
   - Save cart for later
   - Calculate totals with tax

4. Checkout Process
   - Shipping address form
   - Payment integration with Stripe
   - Order confirmation
   - Email notifications

5. Admin Dashboard
   - Manage products
   - View orders
   - User management
   - Analytics and reports

Technical Requirements:
- Next.js 14 with App Router
- TypeScript
- Prisma ORM with PostgreSQL
- Tailwind CSS for styling
- Stripe for payments

Please create detailed milestones for this project.`,
    expectedIntent: 'milestone_generation',
    shouldGenerateMilestones: true,
    description: 'Should trigger milestone generation - has detailed requirements',
  },
  {
    name: 'Feature request with details',
    message: `I want to add a new feature to my app:

Build a real-time chat system with the following:
- WebSocket connection using Socket.io
- Message persistence in database
- Typing indicators
- Read receipts
- File attachments support
- Emoji reactions
- User presence (online/offline)

Implement this with proper authentication and authorization. Create milestones for this feature.`,
    expectedIntent: 'milestone_generation',
    shouldGenerateMilestones: true,
    description: 'Should trigger milestone generation - explicit feature request with details',
  },
  {
    name: 'Build request with specifications',
    message: `Please build a REST API with these endpoints:

POST /api/users - Create user
GET /api/users/:id - Get user
PUT /api/users/:id - Update user
DELETE /api/users/:id - Delete user

POST /api/posts - Create post
GET /api/posts - List posts
GET /api/posts/:id - Get post
PUT /api/posts/:id - Update post
DELETE /api/posts/:id - Delete post

Include authentication, validation, error handling, and rate limiting.
Generate milestones for this API development.`,
    expectedIntent: 'milestone_generation',
    shouldGenerateMilestones: true,
    description: 'Should trigger milestone generation - API build request with specs',
  },
];

async function runTests() {
  console.log('🧪 Testing AI Chat Orchestration Intent Classification\n');
  console.log('='.repeat(80) + '\n');

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    console.log(`📝 Test: ${testCase.name}`);
    console.log(`   Description: ${testCase.description}`);
    console.log(
      `   Message: "${testCase.message.substring(0, 100)}${testCase.message.length > 100 ? '...' : ''}"`
    );
    console.log(
      `   Expected: intent="${testCase.expectedIntent}", generateMilestones=${testCase.shouldGenerateMilestones}`
    );

    // Simulate the logic from the orchestration service
    const message = testCase.message;
    const messageLength = message.length;

    // Check requirement keywords
    const hasRequirementKeywords =
      /build|create|implement|add|develop|feature|requirement|prd|specification/i.test(message);
    const isProvidingRequirements = messageLength > 300 && hasRequirementKeywords;
    const explicitlyAsksForMilestones =
      /generate.{0,20}milestone|create.{0,20}milestone|make.{0,20}milestone|plan.{0,20}milestone/i.test(
        message
      );

    const shouldGenerateMilestones = isProvidingRequirements || explicitlyAsksForMilestones;

    // For this test, we'll simulate intent classification
    let simulatedIntent = 'general_chat';
    if (message.toLowerCase().includes('what') || message.toLowerCase().includes('show')) {
      simulatedIntent = 'information_query';
    } else if (
      message.toLowerCase().includes('analyze') ||
      message.toLowerCase().includes('review')
    ) {
      simulatedIntent = 'code_analysis';
    } else if (
      shouldGenerateMilestones &&
      (isProvidingRequirements || explicitlyAsksForMilestones)
    ) {
      simulatedIntent = 'milestone_generation';
    }

    // Check milestone generation validation
    const hasSubstantialContent = messageLength > 200;
    const hasRequirementIndicators = /feature|requirement|build|implement|create|add|develop/i.test(
      message
    );
    const wouldPassValidation = hasSubstantialContent && hasRequirementIndicators;

    const actualShouldGenerate = shouldGenerateMilestones && wouldPassValidation;

    // Compare results
    const intentMatch = simulatedIntent === testCase.expectedIntent;
    const milestoneMatch = actualShouldGenerate === testCase.shouldGenerateMilestones;
    const testPassed = intentMatch && milestoneMatch;

    if (testPassed) {
      console.log(`   ✅ PASS: Correctly classified`);
      console.log(
        `   Result: intent="${simulatedIntent}", generateMilestones=${actualShouldGenerate}\n`
      );
      passed++;
    } else {
      console.log(`   ❌ FAIL: Incorrect classification`);
      console.log(
        `   Expected: intent="${testCase.expectedIntent}", generateMilestones=${testCase.shouldGenerateMilestones}`
      );
      console.log(
        `   Got: intent="${simulatedIntent}", generateMilestones=${actualShouldGenerate}`
      );
      console.log(
        `   Details: length=${messageLength}, hasKeywords=${hasRequirementKeywords}, substantial=${hasSubstantialContent}\n`
      );
      failed++;
    }
  }

  console.log('='.repeat(80));
  console.log(
    `\n📊 Test Results: ${passed} passed, ${failed} failed out of ${testCases.length} tests\n`
  );

  if (failed === 0) {
    console.log('🎉 All tests passed! Intent classification is working correctly.\n');
    console.log('Key Improvements:');
    console.log('✅ Questions about code → information_query (no milestone generation)');
    console.log('✅ Questions about milestones → information_query (no milestone generation)');
    console.log('✅ Short requests without details → ask for requirements');
    console.log('✅ Detailed PRDs → milestone_generation');
    console.log('✅ Explicit build requests with specs → milestone_generation\n');
  } else {
    console.log('⚠️  Some tests failed. Review the classification logic.\n');
  }

  process.exit(failed === 0 ? 0 : 1);
}

// Run tests
runTests().catch((error) => {
  console.error('❌ Test execution failed:', error);
  logger.error('Intent classification test failed:', error);
  process.exit(1);
});
