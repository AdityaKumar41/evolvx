# DevSponsor Backend

A production-ready ZK-powered developer funding platform backend built with Node.js, TypeScript, Prisma, Kafka, and blockchain integration.

## 🏗️ Architecture

- **API Gateway**: Express.js with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Message Queue**: Apache Kafka for event streaming
- **Cache**: Redis for session management and job queues
- **Vector DB**: Qdrant for AI embeddings
- **Storage**: S3-compatible (MinIO for local dev)
- **AI**: Claude via OpenRouter for milestone generation
- **Blockchain**: Ethers.js for smart contract interaction
- **Orchestration**: Inngest for long-running workflows
- **Workers**: Verifier and Prover workers for ZK proof generation

## 📋 Prerequisites

- Node.js >= 18
- Docker and Docker Compose
- pnpm/npm/yarn

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Infrastructure Services

Start all required services (Postgres, Redis, Kafka, Qdrant, MinIO):

```bash
docker-compose up -d
```

### 3. Configure Environment

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

### 4. Test the API

Import the Postman collection from the `postman/` directory:

- **DevSponsor_API.postman_collection.json** - Complete API with 50+ endpoints
- **DevSponsor_Local.postman_environment.json** - Local development environment

See [Postman Documentation](./postman/README.md) for detailed testing guide.

**Required configurations:**

- Database connection string
- GitHub OAuth credentials
- OpenRouter API key
- Blockchain RPC URL and contract addresses
- JWT secrets

### 4. Setup Database

Generate Prisma client and run migrations:

```bash
npm run db:generate
npm run db:push
```

### 5. Start Development Server

```bash
npm run dev
```

The API will be available at `http://localhost:3000`

### 6. Start Workers (in separate terminals)

```bash
# Terminal 2: Verifier Worker
npm run worker:verifier

# Terminal 3: Prover Worker
npm run worker:prover
```

## 📁 Project Structure

```
devs-hack/
├── prisma/
│   └── schema.prisma          # Database schema
├── src/
│   ├── config/
│   │   └── index.ts           # Configuration management
│   ├── lib/
│   │   ├── prisma.ts          # Prisma client
│   │   ├── redis.ts           # Redis client
│   │   ├── kafka.ts           # Kafka producer/consumer
│   │   ├── qdrant.ts          # Qdrant vector DB
│   │   ├── s3.ts              # S3 storage client
│   │   └── inngest.ts         # Inngest client
│   ├── middleware/
│   │   ├── auth.ts            # Authentication middleware
│   │   ├── errorHandler.ts   # Error handling
│   │   └── requestLogger.ts  # Request logging
│   ├── routes/
│   │   ├── auth.routes.ts     # Auth endpoints
│   │   ├── project.routes.ts  # Project CRUD
│   │   ├── milestone.routes.ts # Milestone endpoints
│   │   ├── contribution.routes.ts # Contribution tracking
│   │   ├── webhook.routes.ts  # GitHub webhooks
│   │   └── health.routes.ts   # Health checks
│   ├── services/
│   │   ├── ai.service.ts      # AI orchestration
│   │   ├── blockchain.service.ts # Blockchain interactions
│   │   └── github.service.ts  # GitHub API
│   ├── workers/
│   │   ├── verifier.ts        # Test verification worker
│   │   └── prover.ts          # ZK proof generation worker
│   ├── inngest/
│   │   └── functions.ts       # Inngest orchestrations
│   ├── utils/
│   │   └── logger.ts          # Winston logger
│   └── index.ts               # Main application entry
├── docker-compose.yml         # Local development services
├── package.json
├── tsconfig.json
└── README.md
```

## 🔑 Key Features

### 1. **Project & Milestone Management**

- Create projects with AI-generated milestones
- Sub-milestones with acceptance criteria
- Automated checkpoint-based payments

### 2. **GitHub Integration**

- OAuth authentication
- Webhook handling for commits and PRs
- Automated test verification

### 3. **AI-Powered Milestone Generation**

- Claude integration via OpenRouter
- Automatic breakdown of project requirements
- Smart acceptance criteria generation
- Document embedding in Qdrant

### 4. **ZK Proof System**

- Verifier worker for test execution
- Prover worker for ZK proof generation
- Blockchain submission of proofs
- Nullifier tracking for double-spend prevention

### 5. **Event-Driven Architecture**

- Kafka topics for all major events
- Inngest orchestrations for complex workflows
- Redis for job queuing and caching

### 6. **Payment System**

- ESCROW and YIELD payment modes
- Per-checkpoint micro-payments
- Blockchain verification

## 🔧 Available Scripts

```bash
# Development
npm run dev              # Start dev server with hot reload
npm run build            # Build for production
npm run start            # Start production server

# Database
npm run db:generate      # Generate Prisma client
npm run db:push          # Push schema to database
npm run db:migrate       # Run migrations
npm run db:studio        # Open Prisma Studio

# Workers
npm run worker:verifier  # Start verifier worker
npm run worker:prover    # Start prover worker

# Code Quality
npm run lint             # Run ESLint
npm run format           # Format code with Prettier
npm test                 # Run tests
```

## 🌐 API Endpoints

> **Complete API Documentation**: See [Postman Collection](./postman/README.md) with 50+ endpoints
>
> **Frontend Integration**: Check [Frontend Integration Guide](./postman/FRONTEND_INTEGRATION.md) for code examples

### Authentication

- `GET /auth/github` - Initiate GitHub OAuth
- `GET /auth/github/callback` - OAuth callback
- `POST /auth/link-wallet` - Link wallet address
- `GET /auth/me` - Get current user
- `POST /auth/logout` - Logout

### Projects

- `POST /api/projects` - Create project
- `GET /api/projects` - List projects
- `GET /api/projects/:id` - Get project details
- `POST /api/projects/:id/fund` - Fund project
- `POST /api/projects/:id/ai/generate` - Generate AI milestones

### Milestones

- `GET /api/milestones/project/:projectId` - Get project milestones
- `POST /api/milestones/:subMilestoneId/claim` - Claim sub-milestone

### Contributions

- `GET /api/contributions/project/:projectId` - List contributions
- `GET /api/contributions/:id` - Get contribution details

### Webhooks

- `POST /webhooks/github` - GitHub webhook handler

### Health

- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed health status

## 📊 Kafka Topics

```
github.commit              - GitHub commit events
proof.generated            - Proof generation complete
proof.submitted            - Proof submitted to blockchain
proof.verified             - Proof verified onchain
payout.success             - Payment successful
payout.failed              - Payment failed
project.funded             - Project funding received
ai.milestones.generated    - AI milestone generation complete
milestone.rescoped         - Milestone rescoped
```

## 🔐 Environment Variables

See `.env.example` for all available configuration options.

**Critical variables:**

- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `KAFKA_BROKERS` - Kafka broker addresses
- `GITHUB_CLIENT_ID` & `GITHUB_CLIENT_SECRET` - GitHub OAuth
- `OPENROUTER_API_KEY` - AI service API key
- `BLOCKCHAIN_RPC_URL` - Ethereum RPC endpoint
- `JWT_SECRET` - JWT signing secret

## 🐳 Docker Services

All services are defined in `docker-compose.yml`:

- **postgres**: PostgreSQL 16 (port 5432)
- **redis**: Redis 7 (port 6379)
- **kafka**: Kafka with Zookeeper (ports 9092, 29092)
- **qdrant**: Vector database (port 6333)
- **minio**: S3-compatible storage (ports 9000, 9001)
- **kafka-ui**: Kafka management UI (port 8080)

Access Kafka UI at: `http://localhost:8080`
Access MinIO console at: `http://localhost:9001`

## 🧪 Development Workflow

1. **Start infrastructure**: `docker-compose up -d`
2. **Run migrations**: `npm run db:migrate`
3. **Start API server**: `npm run dev`
4. **Start workers**: `npm run worker:verifier` & `npm run worker:prover`
5. **Make changes** and test
6. **Check logs** in console and `logs/` directory

## 🚨 Troubleshooting

### Database Connection Issues

```bash
# Check if Postgres is running
docker ps | grep postgres

# View Postgres logs
docker logs devsponsor-postgres

# Reset database
docker-compose down -v
docker-compose up -d
npm run db:push
```

### Kafka Issues

```bash
# Check Kafka health
docker logs devsponsor-kafka

# View topics in Kafka UI
open http://localhost:8080
```

### Redis Connection

```bash
# Test Redis connection
docker exec -it devsponsor-redis redis-cli ping
```

## 🔒 Security Considerations

- All secrets must be stored in environment variables
- Use HTTPS in production
- Implement rate limiting on public endpoints
- Validate all webhook signatures
- Encrypt sensitive data at rest (S3)
- Use HSM for blockchain private keys in production

## 📈 Monitoring & Observability

- Winston logger with structured JSON logs
- Health check endpoints for service monitoring
- Kafka event tracking
- Prisma query logging
- Error tracking (configure Sentry DSN in .env)

## 🚢 Production Deployment

1. Build Docker image
2. Configure production environment variables
3. Setup managed PostgreSQL, Redis, Kafka
4. Deploy to Kubernetes or cloud container service
5. Configure load balancer and SSL certificates
6. Setup monitoring and alerts
7. Configure backup strategies

## 📝 License

MIT

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

---

For detailed architecture and implementation details, see [PRD.md](./PRD.md).
