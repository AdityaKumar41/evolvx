#!/bin/bash

# Milestone Generation Fix - Verification Script
# This script helps verify that the milestone generation fix is working correctly

echo "🔍 Milestone Generation Fix - Verification Checklist"
echo "=================================================="
echo ""

# Check 1: Schema includes new fields
echo "✅ Check 1: Verify workflow schema includes new fields"
echo "Looking for: projectTitle, projectDescription, inlineDocument"
grep -n "projectTitle\|projectDescription\|inlineDocument" src/inngest/ai-milestone-workflow.ts
echo ""

# Check 2: Context building uses inlineDocument
echo "✅ Check 2: Verify context building uses inlineDocument"
echo "Looking for: input.inlineDocument usage"
grep -n "input.inlineDocument" src/inngest/ai-milestone-workflow.ts
echo ""

# Check 3: System prompt has critical instructions
echo "✅ Check 3: Verify system prompt emphasizes using context"
echo "Looking for: CRITICAL: USE THE PROVIDED CONTEXT"
grep -n "CRITICAL.*USE.*CONTEXT" src/services/ai-orchestration.service.ts
echo ""

# Check 4: User prompt has instructions
echo "✅ Check 4: Verify user prompt has critical instructions"
echo "Looking for: CRITICAL INSTRUCTIONS"
grep -n "CRITICAL INSTRUCTIONS" src/services/ai-orchestration.service.ts
echo ""

echo "=================================================="
echo "📋 Manual Testing Checklist:"
echo ""
echo "1. Test with detailed PRD in chat (500+ chars)"
echo "   - Paste a detailed requirements document"
echo "   - Request milestone generation"
echo "   - Verify milestones match your specific requirements"
echo ""
echo "2. Test with uploaded document"
echo "   - Upload a PDF or MD file with requirements"
echo "   - Request milestone generation"
echo "   - Check logs for 'Including inline document'"
echo ""
echo "3. Test with repository"
echo "   - Connect a GitHub repository"
echo "   - Request milestone generation"
echo "   - Verify milestones reference actual files/patterns"
echo ""
echo "4. Test combined context"
echo "   - Provide PRD + Upload document + Connect repo"
echo "   - Verify milestones are highly specific"
echo ""
echo "📊 Log Messages to Watch For:"
echo "   - '[Milestone Gen] Including inline document'"
echo "   - '[Milestone Gen] Full context prepared'"
echo "   - 'inlineDocument' length and preview in logs"
echo ""
echo "=================================================="
echo "✨ If all checks pass, the fix is properly deployed!"
