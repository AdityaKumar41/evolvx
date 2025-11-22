# DevSponsor Postman - Testing Workflow Examples

## 🎯 Complete Testing Workflows

### Workflow 1: Sponsor Creates and Funds a Project

```
1. Health Check > Basic Health Check
   ✅ Verify API is running

2. Authentication > GitHub OAuth Login
   ✅ Get authentication URL
   📝 Open in browser and authenticate
   📝 Copy JWT token from redirect

3. Set Environment Variable
   📝 Set 'jwt_token' in environment

4. Authentication > Get Current User
   ✅ Verify authentication works
   📝 Save user_id (auto-saved)

5. Organizations > Create Organization (Optional)
   Body: {
     "name": "My Dev Team",
     "description": "Building awesome products"
   }
   ✅ Creates organization
   📝 organization_id auto-saved

6. Projects > Create Project
   Body: {
     "title": "Web3 Dashboard",
     "description": "DeFi analytics dashboard",
     "repositoryUrl": "https://github.com/username/web3-dashboard",
     "tokenAddress": "0xUSDC_ADDRESS",
     "orgId": "{{organization_id}}"  // optional
   }
   ✅ Creates project
   📝 project_id auto-saved

7. Funding > Get Funding Quote
   Body: {
     "amount": "10000",
     "token": "USDC",
     "mode": "ESCROW"
   }
   ✅ Returns quote with fees

8. Projects > Fund Project
   Body: {
     "amount": "10000",
     "token": "USDC",
     "mode": "ESCROW",
     "onchainTxHash": "0xYOUR_TX_HASH"
   }
   ✅ Activates project

9. Projects > Generate AI Milestones
   Body: {
     "prompt": "Break down dashboard into milestones with wallet integration, DeFi protocols, and charts",
     "documentUrl": "https://docs.example.com/requirements.pdf"
   }
   ✅ Starts AI generation (async)

10. Milestones > Get Project Milestones
    ✅ View generated milestones
    📝 Save milestone_id and submilestone_id

11. AI Chat Assistant > Send Chat Message
    Body: {
      "message": "What's the status of my project?",
      "context": { "projectId": "{{project_id}}" }
    }
    ✅ Get AI-powered project insights
```

### Workflow 2: Developer Claims and Completes Task

```
1. Authentication > GitHub OAuth Login
   ✅ Authenticate as developer

2. Authentication > Get Current User
   ✅ Verify auth
   📝 Ensure role is DEVELOPER

3. Projects > Get All Projects
   Query Params: status=ACTIVE
   ✅ Browse available projects

4. Milestones > Get Project Milestones
   Use project_id from above
   ✅ See available tasks
   📝 Find OPEN sub-milestones

5. Milestones > Claim Sub-Milestone
   Body: {
     "branchUrl": "https://github.com/username/repo/tree/feature-branch"
   }
   ✅ Claim task (status → CLAIMED)
   📝 submilestone_id auto-saved

6. [Developer works on the task]
   - Clone repository
   - Create feature branch
   - Implement changes
   - Write tests
   - Commit code

7. [Create Pull Request on GitHub]
   - PR triggers webhook automatically
   - Webhook creates contribution record

8. Contributions > Get Project Contributions
   ✅ View your contribution

9. [GitHub Actions run tests]
   - Tests complete
   - Webhook updates contribution

10. Payments > Get Contributor Earnings
    ✅ View pending/completed payments

11. Contributions > Get Contribution by ID
    ✅ Check verification status

12. [After verification & payment]
    Payments > Get Contributor Payment History
    ✅ View payment details
```

### Workflow 3: Monitor Project Progress (Sponsor)

```
1. Authentication > Get Current User
   ✅ Authenticate as sponsor

2. Projects > Get Project by ID
   ✅ Detailed project view with milestones

3. Contributions > Get Project Contributions
   ✅ All contributions and their status

4. Payments > Get Project Payments
   ✅ All processed payments

5. Payments > Get Project Spending
   ✅ Spending breakdown

6. Funding > Get Remaining Funds
   ✅ Available balance

7. AI Chat Assistant > Get Progress Explanation
   ✅ AI-generated progress report

8. AI Chat Assistant > Send Chat Message
   Body: {
     "message": "Which milestones are at risk?",
     "context": { "projectId": "{{project_id}}" }
   }
   ✅ AI insights on blockers
```

### Workflow 4: Add Funds to Running Project

```
1. Funding > Get Remaining Funds
   ✅ Check current balance

2. [Transfer funds on-chain]
   Execute blockchain transaction

3. Funding > Add Additional Funds
   Body: {
     "amount": "5000",
     "txHash": "0xADDITIONAL_TX_HASH"
   }
   ✅ Adds funds to project

4. Funding > Get Funding History
   ✅ View complete funding history
```

### Workflow 5: Organization Management

```
1. Organizations > Create Organization
   Body: {
     "name": "Acme Dev Team",
     "description": "Building the future",
     "githubOrg": "acme-dev",
     "website": "https://acme.dev"
   }
   ✅ Creates org

2. Organizations > Invite Member
   Body: {
     "email": "developer@example.com",
     "role": "MEMBER"
   }
   ✅ Sends invitation

3. [Member receives email]
   - Opens invite link
   - Clicks accept

4. Organizations > Get Organization Members
   ✅ View all members

5. Projects > Create Project
   Body: {
     "title": "Team Project",
     "orgId": "{{organization_id}}"
   }
   ✅ Project under organization

6. Organizations > Remove Member
   URL: /api/organizations/{{organization_id}}/members/{memberId}
   ✅ Removes member access
```

### Workflow 6: AI Chat Features

```
1. AI Chat Assistant > Send Chat Message
   Body: {
     "message": "Hello, help me with my project",
     "context": { "projectId": "{{project_id}}" }
   }
   ✅ Starts conversation
   📝 conversation_id auto-saved

2. AI Chat Assistant > Get Conversations
   ✅ List all conversations

3. AI Chat Assistant > Stream Chat Message
   Body: {
     "message": "Generate a detailed progress report",
     "conversationId": "{{conversation_id}}",
     "context": { "projectId": "{{project_id}}" }
   }
   ✅ Streams response in real-time

4. AI Chat Assistant > Get Task Suggestions
   Body: {
     "projectId": "{{project_id}}",
     "milestoneId": "{{milestone_id}}"
   }
   ✅ AI-powered task breakdown

5. AI Chat Assistant > Get Rescoping Recommendation
   Body: {
     "projectId": "{{project_id}}",
     "reason": "Scope expanded significantly"
   }
   ✅ AI rescoping analysis

6. AI Chat Assistant > Delete Conversation
   ✅ Clears conversation history
```

## 🔄 Continuous Testing Loop

### Daily Smoke Test (5 minutes)

```
1. Health Check
2. Get Current User
3. Get All Projects
4. Get Project by ID
5. Get Project Milestones
```

### Integration Test (15 minutes)

```
1. Create Project
2. Fund Project
3. Generate Milestones
4. Claim Task
5. Check Contributions
6. View Payments
```

### Full E2E Test (30 minutes)

Run all workflows above in sequence

## 📊 Monitoring Endpoints

### Check System Health

```
1. Health > Basic Health Check
   Response: { status: "healthy" }

2. Health > Detailed Health Check
   Response includes:
   - database: up/down
   - redis: up/down
   - qdrant: up/down
```

### Monitor Specific Project

```
1. Get Project Details
2. Get Project Milestones
3. Get Project Contributions
4. Get Project Payments
5. Get Remaining Funds

Set up Postman Monitor to run every hour
```

## 🐛 Debugging Workflows

### Payment Failed - Debug Flow

```
1. Payments > Get Contributor Payment History
   - Check payment status

2. Contributions > Get Contribution by ID
   - Verify contribution is VERIFIED

3. Funding > Get Remaining Funds
   - Ensure sufficient balance

4. Payments > Retry Failed Payment
   - Attempt retry

5. View Postman Console
   - Check detailed error logs
```

### Milestone Not Generating - Debug Flow

```
1. Projects > Get Project by ID
   - Verify status is ACTIVE

2. Check Postman Console
   - Review request/response

3. AI Chat Assistant > Send Chat Message
   Body: { "message": "Why aren't my milestones generating?" }
   - Get AI insights

4. Wait 1-2 minutes (async processing)

5. Milestones > Get Project Milestones
   - Check if generated
```

## 💡 Pro Tips

1. **Use Collection Variables**: IDs are auto-saved, reuse across requests
2. **Enable Postman Console**: View detailed request/response logs
3. **Save Examples**: Save successful responses as examples
4. **Create Test Scripts**: Add assertions to validate responses
5. **Setup Monitors**: Run critical workflows automatically
6. **Use Pre-request Scripts**: Generate dynamic data
7. **Export Environment**: Share with team members
8. **Use Folders**: Organize by user roles (Sponsor/Developer)

## 🔐 Security Testing

### Test Authentication

```
1. Run request WITHOUT jwt_token
   Expected: 401 Unauthorized

2. Run with INVALID token
   Expected: 401 Unauthorized

3. Run with EXPIRED token
   Expected: 401 Unauthorized

4. Try SPONSOR endpoint as DEVELOPER
   Expected: 403 Forbidden
```

### Test Authorization

```
1. Developer tries to fund project
   Expected: 403 Forbidden

2. User tries to delete others' project
   Expected: 403 Forbidden

3. Access organization without membership
   Expected: 403 Forbidden
```

## 📈 Performance Testing

### Load Test Setup (using Newman)

```bash
# Install Newman
npm install -g newman

# Run collection 10 times
newman run DevSponsor_API.postman_collection.json \
  -e DevSponsor_Local.postman_environment.json \
  -n 10 \
  --reporters cli,json

# With delay between requests
newman run DevSponsor_API.postman_collection.json \
  -e DevSponsor_Local.postman_environment.json \
  -n 100 \
  --delay-request 1000
```

## 🎯 Testing Checklist

- [ ] All health checks pass
- [ ] Authentication flow works
- [ ] Projects can be created and funded
- [ ] AI milestone generation completes
- [ ] Tasks can be claimed
- [ ] Contributions tracked correctly
- [ ] Payments process successfully
- [ ] Chat assistant responds
- [ ] Webhooks trigger correctly
- [ ] Error handling works
- [ ] Authorization enforced
- [ ] Rate limiting respected

---

**Happy Testing! 🚀**
