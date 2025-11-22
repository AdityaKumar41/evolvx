# DevSponsor API - Quick Reference

## 🚀 Base URLs

- **Local**: `http://localhost:3000`
- **Production**: `https://api.devsponsor.com`

## 🔐 Authentication

### Get JWT Token

```bash
# 1. Visit in browser
http://localhost:3000/auth/github

# 2. After auth, extract token from redirect URL
http://frontend.com/auth/callback?token=YOUR_JWT_TOKEN

# 3. Use in requests
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3000/auth/me
```

### Headers

```
Authorization: Bearer {jwt_token}
Content-Type: application/json
```

## 📋 Essential Endpoints

### Health & Status

```bash
# Basic health
GET /health

# Detailed status
GET /health/detail
```

### Projects

```bash
# List projects
GET /api/projects?status=ACTIVE

# Create project (SPONSOR only)
POST /api/projects
{
  "title": "Project Name",
  "description": "Description",
  "repositoryUrl": "https://github.com/user/repo"
}

# Get project
GET /api/projects/{id}

# Fund project (SPONSOR only)
POST /api/projects/{id}/fund
{
  "amount": "10000",
  "token": "USDC",
  "mode": "ESCROW",
  "onchainTxHash": "0x..."
}

# Generate AI milestones (SPONSOR only)
POST /api/projects/{id}/ai/generate
{
  "prompt": "Break down into development milestones"
}
```

### Milestones & Tasks

```bash
# Get project milestones
GET /api/milestones/project/{projectId}

# Claim task (DEVELOPER only)
POST /api/milestones/{subMilestoneId}/claim
{
  "branchUrl": "https://github.com/user/repo/tree/branch"
}
```

### Contributions

```bash
# List project contributions
GET /api/contributions/project/{projectId}

# Get contribution details
GET /api/contributions/{id}
```

### Funding

```bash
# Get funding quote
POST /api/funding/{projectId}/quote
{
  "amount": "10000",
  "token": "USDC",
  "mode": "ESCROW"
}

# Confirm funding
POST /api/funding/{projectId}/confirm
{
  "amount": "10000",
  "token": "USDC",
  "mode": "ESCROW",
  "txHash": "0x..."
}

# Get remaining funds
GET /api/funding/{projectId}/remaining

# Get funding history
GET /api/funding/{projectId}/history
```

### Payments

```bash
# Process payment
POST /api/payments/process
{
  "contributionId": "contribution-uuid",
  "contributorAddress": "0x..."
}

# Get contributor earnings
GET /api/payments/contributor/{contributorId}/earnings

# Get payment history
GET /api/payments/contributor/{contributorId}/history

# Get project payments
GET /api/payments/project/{projectId}/payments

# Get project spending
GET /api/payments/project/{projectId}/spending
```

### AI Chat Assistant

```bash
# Send message
POST /api/chat
{
  "message": "What's my project status?",
  "context": { "projectId": "uuid" }
}

# Stream response
POST /api/chat/stream
{
  "message": "Generate progress report",
  "conversationId": "uuid",
  "context": { "projectId": "uuid" }
}

# Get conversations
GET /api/chat/conversations

# Get conversation
GET /api/chat/conversations/{id}

# Delete conversation
DELETE /api/chat/conversations/{id}

# Get task suggestions
POST /api/chat/suggestions
{
  "projectId": "uuid",
  "milestoneId": "uuid"
}

# Get rescoping recommendation
POST /api/chat/rescoping
{
  "projectId": "uuid",
  "reason": "Scope changed"
}

# Get progress explanation
GET /api/chat/progress/{projectId}
```

### Organizations

```bash
# Create organization
POST /api/organizations
{
  "name": "Team Name",
  "description": "Description"
}

# Get user organizations
GET /api/organizations

# Get organization
GET /api/organizations/{id}

# Update organization
PATCH /api/organizations/{id}
{
  "name": "New Name"
}

# Invite member
POST /api/organizations/{id}/invite
{
  "email": "user@example.com",
  "role": "MEMBER"
}

# Get members
GET /api/organizations/{id}/members
```

## 🎭 User Roles

| Role      | Can Create Projects | Can Fund | Can Claim Tasks | Can AI Generate |
| --------- | ------------------- | -------- | --------------- | --------------- |
| SPONSOR   | ✅                  | ✅       | ❌              | ✅              |
| DEVELOPER | ❌                  | ❌       | ✅              | ❌              |
| ADMIN     | ✅                  | ✅       | ✅              | ✅              |

## 📊 Payment Modes

### ESCROW

- Funds held in escrow contract
- Released upon milestone completion
- Immediate availability
- Fixed amounts

### YIELD

- Funds deposited in DeFi protocol
- Earns yield while locked
- Harvested periodically
- Variable amounts based on yield

## 🔄 Contribution Status Flow

```
OPEN → CLAIMED → SUBMITTED → VERIFIED → PAID
```

1. **OPEN**: Available for claiming
2. **CLAIMED**: Developer assigned
3. **SUBMITTED**: PR submitted
4. **VERIFIED**: Tests passed + reviewed
5. **PAID**: Payment processed

## 🎯 Common Workflows

### Sponsor Flow

```
1. Authenticate
2. Create Project
3. Fund Project
4. Generate Milestones
5. Monitor Progress (Chat)
6. Review Contributions
7. Check Payments
```

### Developer Flow

```
1. Authenticate
2. Browse Projects
3. View Milestones
4. Claim Task
5. Submit PR (triggers webhook)
6. Get Paid
7. Check Earnings
```

## 📝 Request Examples

### cURL Examples

```bash
# Get all active projects (no auth)
curl http://localhost:3000/api/projects?status=ACTIVE

# Get current user (with auth)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/auth/me

# Create project
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"My Project","description":"Description"}' \
  http://localhost:3000/api/projects

# Chat with AI
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"Project status?","context":{"projectId":"uuid"}}' \
  http://localhost:3000/api/chat
```

### JavaScript/TypeScript Example

```typescript
const API_URL = 'http://localhost:3000';
const token = localStorage.getItem('jwt_token');

// Fetch projects
const projects = await fetch(`${API_URL}/api/projects?status=ACTIVE`).then((r) => r.json());

// Create project (with auth)
const newProject = await fetch(`${API_URL}/api/projects`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    title: 'My Project',
    description: 'Project description',
  }),
}).then((r) => r.json());

// Chat streaming
const response = await fetch(`${API_URL}/api/chat/stream`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    message: 'What is the status?',
    context: { projectId: 'uuid' },
  }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value);
  console.log(chunk); // Handle streamed response
}
```

## 🐛 Error Responses

```json
{
  "error": "Error message",
  "statusCode": 400
}
```

### Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error

## 💡 Tips & Tricks

1. **Auto-save IDs**: Use Postman collection variables
2. **Test scripts**: Validate responses automatically
3. **Environment switching**: Toggle Local/Production easily
4. **Parallel testing**: Use Newman for load tests
5. **Mock server**: Test frontend without backend
6. **Documentation**: Generate from collection
7. **Team collaboration**: Share collections via workspace

## 🔗 Resources

- [Full Postman Collection](./DevSponsor_API.postman_collection.json)
- [Testing Workflows](./TESTING_WORKFLOWS.md)
- [Frontend Integration Guide](./FRONTEND_INTEGRATION.md)
- [Main Documentation](./README.md)

## 📞 Support

- GitHub Issues: [Report bugs](https://github.com/yourusername/devsponsor/issues)
- Documentation: [View docs](./README.md)
- API Status: [Check health endpoint](http://localhost:3000/health)

---

**Version**: 1.0.0 | **Last Updated**: November 2025
