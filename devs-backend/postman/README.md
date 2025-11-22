# DevSponsor API - Postman Collection

Complete Postman collection for testing and integrating with the DevSponsor API.

## 📦 What's Included

- **DevSponsor_API.postman_collection.json** - Complete API collection with 50+ endpoints
- **DevSponsor_Local.postman_environment.json** - Local development environment
- **DevSponsor_Production.postman_environment.json** - Production environment

## 🚀 Quick Start

### 1. Import Collection & Environment

1. Open Postman
2. Click **Import** button
3. Drag and drop all three JSON files:
   - `DevSponsor_API.postman_collection.json`
   - `DevSponsor_Local.postman_environment.json`
   - `DevSponsor_Production.postman_environment.json`

### 2. Select Environment

- Click the environment dropdown (top right)
- Select **DevSponsor - Local** for development
- Select **DevSponsor - Production** for production testing

### 3. Authenticate

#### Option A: GitHub OAuth (Recommended)

1. Go to **Authentication** folder
2. Run **GitHub OAuth Login** request
3. Copy the URL from the response
4. Open it in your browser
5. Complete GitHub authentication
6. Copy the JWT token from the redirect URL
7. Paste it into the `jwt_token` environment variable

#### Option B: Use Existing Token

If you already have a JWT token:

1. Click the eye icon (top right) to view environment variables
2. Set the `jwt_token` variable to your token value

### 4. Test the API

Run the **Get Current User** request to verify authentication is working.

## 📚 Collection Structure

### 🏥 Health Check

- Basic health check
- Detailed service status (database, redis, qdrant)

### 🔐 Authentication

- GitHub OAuth login flow
- Get current user info
- Link wallet address
- Logout

### 📋 Projects

- Create project (requires SPONSOR role)
- List all projects (with filters)
- Get project details
- Fund project (ESCROW or YIELD mode)
- Generate AI milestones

### 🎯 Milestones

- Get project milestones
- Claim sub-milestone (requires DEVELOPER role)

### 💼 Contributions

- Get project contributions
- Get contribution details

### 🏢 Organizations

- Create organization
- List user organizations
- Get organization details
- Update/delete organization
- Invite/remove members
- Accept invitations

### 💰 Funding

- Get funding quote
- Confirm funding
- Add additional funds
- Check remaining funds
- View funding history

### 💸 Payments

- Process payment
- Retry failed payment
- Get contributor earnings
- Payment history (contributor & project)
- Project spending breakdown

### 🤖 AI Chat Assistant

- Send chat messages (streaming & non-streaming)
- Manage conversations
- Get task suggestions
- Rescoping recommendations
- Progress explanations

### 🪝 Webhooks

- GitHub webhook endpoint (for push, PR, check run events)

## 🔑 Environment Variables

The collection uses these variables (automatically managed):

| Variable          | Description              | Auto-Set |
| ----------------- | ------------------------ | -------- |
| `base_url`        | API base URL             | ✅       |
| `jwt_token`       | JWT authentication token | Manual   |
| `user_id`         | Current user ID          | ✅       |
| `project_id`      | Last created project ID  | ✅       |
| `milestone_id`    | Last milestone ID        | ✅       |
| `submilestone_id` | Last sub-milestone ID    | ✅       |
| `contribution_id` | Last contribution ID     | ✅       |
| `organization_id` | Last created org ID      | ✅       |
| `conversation_id` | Last conversation ID     | ✅       |

Variables marked with ✅ are automatically set by test scripts when you create resources.

## 🧪 Testing Workflow

### For Sponsors

1. **Authenticate** → Get Current User
2. **Create Organization** (optional)
3. **Create Project**
4. **Get Funding Quote**
5. **Fund Project** (after on-chain deposit)
6. **Generate AI Milestones**
7. **Monitor Progress** via Chat Assistant

### For Developers

1. **Authenticate** → Get Current User
2. **Get All Projects** (find available work)
3. **Get Project Milestones**
4. **Claim Sub-Milestone**
5. Submit PR (triggers webhook)
6. Get paid after verification

### For Frontend Integration

1. Start with **Health Check** endpoints
2. Implement **GitHub OAuth** flow
3. Test **Project** CRUD operations
4. Integrate **Chat Assistant** for AI features
5. Handle **Webhooks** for real-time updates

## 🎨 Request Examples

### Create a Project

```json
POST /api/projects
{
  "title": "Web3 Dashboard Development",
  "description": "Build a comprehensive Web3 dashboard",
  "repositoryUrl": "https://github.com/username/web3-dashboard",
  "tokenAddress": "0xUSDC_CONTRACT_ADDRESS"
}
```

### Fund a Project

```json
POST /api/projects/{projectId}/fund
{
  "amount": "10000",
  "token": "USDC",
  "mode": "ESCROW",
  "onchainTxHash": "0xtransaction_hash"
}
```

### Chat with AI Assistant

```json
POST /api/chat
{
  "message": "What's the status of my project?",
  "context": {
    "projectId": "project-uuid-here"
  }
}
```

## 🔒 Authorization

Most endpoints require authentication. The collection is configured to automatically include the JWT token in the `Authorization` header:

```
Authorization: Bearer {{jwt_token}}
```

### Role-Based Access

- **SPONSOR**: Can create/fund projects, generate milestones
- **DEVELOPER**: Can claim tasks, submit contributions
- **ADMIN**: Full access to all endpoints
- **MEMBER**: Organization member access

## 🐛 Troubleshooting

### "Unauthorized" Error

- Ensure you've set the `jwt_token` environment variable
- Check if token has expired (24 hour validity)
- Re-authenticate via GitHub OAuth

### "Project not found" Error

- Verify the `project_id` variable is set
- Run "Create Project" first to set the variable

### Variables Not Auto-Setting

- Check the **Tests** tab in requests
- Ensure you're using the correct environment
- Variables only set on successful responses (200/201)

### Webhook Signature Validation Failed

- Ensure `X-Hub-Signature-256` header is correct
- Match the webhook secret in your GitHub settings
- Signature format: `sha256=<hmac_hex>`

## 📖 API Documentation

### Base URLs

- **Local**: `http://localhost:3000`
- **Production**: `https://api.devsponsor.com`

### Response Formats

**Success Response:**

```json
{
  "project": { ... },
  "message": "Operation successful"
}
```

**Error Response:**

```json
{
  "error": "Error message",
  "statusCode": 400
}
```

### HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error

## 🔗 Related Links

- [Project README](../README.md)
- [API Documentation](../docs/API.md)
- [Architecture Overview](../docs/ARCHITECTURE.md)

## 💡 Tips

1. **Use Test Scripts**: Many requests automatically save IDs to environment variables
2. **Monitor Console**: Check Postman console for detailed request/response logs
3. **Save Responses**: Use Examples feature to save common responses
4. **Organize Folders**: Create sub-folders for different user flows
5. **Share Collections**: Export and share with your team

## 🤝 Contributing

Found an issue or want to add endpoints?

1. Fork the repository
2. Update the collection
3. Submit a pull request

## 📝 Notes

- All timestamps are in ISO 8601 format
- Amounts are in smallest token units (e.g., USDC has 6 decimals)
- Wallet addresses should be checksummed Ethereum addresses
- GitHub OAuth requires proper redirect URI configuration

## 🆘 Support

For issues or questions:

- Open an issue on GitHub
- Check existing documentation
- Review test scripts in collection

---

**Last Updated**: November 2025
**API Version**: 1.0.0
**Collection Version**: 1.0.0
