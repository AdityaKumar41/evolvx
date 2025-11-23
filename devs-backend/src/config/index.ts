import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string(),

  // Redis
  REDIS_URL: z.string(),

  // Kafka
  KAFKA_BROKERS: z.string(),
  KAFKA_CLIENT_ID: z.string().default('devsponsor-backend'),
  KAFKA_GROUP_ID: z.string().default('devsponsor-consumer-group'),

  // Qdrant
  QDRANT_URL: z.string(),
  QDRANT_API_KEY: z.string().optional(),

  // S3
  S3_ENDPOINT: z.string(),
  S3_ACCESS_KEY: z.string(),
  S3_SECRET_KEY: z.string(),
  S3_BUCKET_NAME: z.string().default('devsponsor-artifacts'),
  S3_REGION: z.string().default('us-east-1'),

  // Server
  PORT: z.string().default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_BASE_URL: z.string(),
  FRONTEND_URL: z.string(),

  // Auth
  SESSION_SECRET: z.string(),
  JWT_SECRET: z.string(),
  JWT_EXPIRY: z.string().default('7d'),

  // GitHub
  GITHUB_CLIENT_ID: z.string(),
  GITHUB_CLIENT_SECRET: z.string(),
  GITHUB_CALLBACK_URL: z.string(),
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().optional(),
  GITHUB_PRIVATE_KEY_PATH: z.string().optional(),
  GITHUB_APP_NAME: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),

  // Blockchain
  BLOCKCHAIN_RPC_URL: z.string(),
  BLOCKCHAIN_NETWORK: z.string().default('sepolia'),
  PAYMENT_CONTRACT_ADDRESS: z.string().optional(),
  VERIFIER_CONTRACT_ADDRESS: z.string().optional(),
  RELAYER_PRIVATE_KEY: z.string().optional(),
  GAS_LIMIT: z.string().default('500000'),

  // Account Abstraction Contracts
  AA_ROOT_MANAGER_ADDRESS: z.string().default('0xe84bBe28F68F3091b7C263Dc52684b378b9a4E54'),
  AA_SMART_ACCOUNT_FACTORY_ADDRESS: z
    .string()
    .default('0x7A8Dc375b57C4436Fb89041A089846f5a46B9415'),
  AA_CREDIT_MANAGER_ADDRESS: z.string().default('0x2A90CCE97dfF2C06191FF421039835CFa8134767'),
  AA_CREDIT_PAYMASTER_ADDRESS: z.string().default('0x6dA662e707dd41abC090cd22f624168Da12E8c74'),
  AA_MILESTONE_MANAGER_ADDRESS: z.string().default('0x33D8B20e845828f053AeA2FA8114d0B38d8E87e4'),
  AA_ESCROW_AND_YIELD_ADDRESS: z.string().default('0x2D094af43eb4BC261Dfe7Fe00C1cc035829D81C8'),
  AA_MERKLE_COMMIT_STORAGE_ADDRESS: z
    .string()
    .default('0xb68401A0cc097BB7BdD6c766786F242520d8BA19'),
  AA_SESSION_KEY_REGISTRY_ADDRESS: z.string().default('0x0Af4E01864234543B55788b80e07b31D9657F49B'),
  AA_ENTRY_POINT_ADDRESS: z.string().default('0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'),
  WPOL_TOKEN_ADDRESS: z.string().default('0x980B62Da83eFf3D4576C647993b0c1D7faf17c73'),
  ARBITRUM_SEPOLIA_CHAIN_ID: z.string().default('421614'),

  // AI
  OPENROUTER_API_KEY: z.string(),
  OPENROUTER_BASE_URL: z.string().default('https://openrouter.ai/api/v1'),
  CLAUDE_MODEL: z.string().default('anthropic/claude-3.5-sonnet'),
  CODERABBIT_API_KEY: z.string().optional(),

  // Direct AI Provider Keys
  OPENAI_API_KEY: z.string(),
  ANTHROPIC_API_KEY: z.string(),
  OPENAI_MODEL: z.string().default('gpt-4o'),
  ANTHROPIC_MODEL: z.string().default('claude-3-5-sonnet-20241022'),

  // Inngest
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
  INNGEST_APP_ID: z.string().default('devsponsor'),

  // Monitoring
  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z.string().default('debug'),

  // ===== EMAIL =====
  SMTP_HOST: z.string(),
  SMTP_PORT: z.string().transform(Number),
  SMTP_SECURE: z.string().transform((val) => val === 'true'),
  SMTP_USER: z.string(),
  SMTP_PASS: z.string(),
  SMTP_FROM: z.string(),
  EMAIL_FROM_NAME: z.string().default('DevSponsor'),
  EMAIL_ENABLED: z.string().default('true'),

  // ZK Circuits
  CIRCUIT_VERSION: z.string().default('1.0.0'),
  PROVING_KEY_PATH: z.string().optional(),
  VERIFICATION_KEY_PATH: z.string().optional(),
  CIRCUIT_WASM_PATH: z.string().optional(),

  // Worker
  MAX_RETRIES: z.string().default('3'),
  PROOF_TIMEOUT_MS: z.string().default('300000'),
  TEST_TIMEOUT_MS: z.string().default('60000'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:', parsedEnv.error.format());
  process.exit(1);
}

export const config = {
  database: {
    url: parsedEnv.data.DATABASE_URL,
  },
  redis: {
    url: parsedEnv.data.REDIS_URL,
  },
  kafka: {
    brokers: parsedEnv.data.KAFKA_BROKERS.split(','),
    clientId: parsedEnv.data.KAFKA_CLIENT_ID,
    groupId: parsedEnv.data.KAFKA_GROUP_ID,
  },
  qdrant: {
    url: parsedEnv.data.QDRANT_URL,
    apiKey: parsedEnv.data.QDRANT_API_KEY,
  },
  s3: {
    endpoint: parsedEnv.data.S3_ENDPOINT,
    accessKey: parsedEnv.data.S3_ACCESS_KEY,
    secretKey: parsedEnv.data.S3_SECRET_KEY,
    bucketName: parsedEnv.data.S3_BUCKET_NAME,
    region: parsedEnv.data.S3_REGION,
  },
  server: {
    port: parseInt(parsedEnv.data.PORT),
    nodeEnv: parsedEnv.data.NODE_ENV,
    apiBaseUrl: parsedEnv.data.API_BASE_URL,
    frontendUrl: parsedEnv.data.FRONTEND_URL,
  },
  auth: {
    sessionSecret: parsedEnv.data.SESSION_SECRET,
    jwtSecret: parsedEnv.data.JWT_SECRET,
    jwtExpiry: parsedEnv.data.JWT_EXPIRY,
  },
  github: {
    clientId: parsedEnv.data.GITHUB_CLIENT_ID,
    clientSecret: parsedEnv.data.GITHUB_CLIENT_SECRET,
    callbackUrl: parsedEnv.data.GITHUB_CALLBACK_URL,
    appId: parsedEnv.data.GITHUB_APP_ID,
    privateKey: parsedEnv.data.GITHUB_APP_PRIVATE_KEY,
    privateKeyPath: parsedEnv.data.GITHUB_PRIVATE_KEY_PATH,
    appName: parsedEnv.data.GITHUB_APP_NAME,
    webhookSecret: parsedEnv.data.GITHUB_WEBHOOK_SECRET,
  },
  blockchain: {
    rpcUrl: parsedEnv.data.BLOCKCHAIN_RPC_URL,
    network: parsedEnv.data.BLOCKCHAIN_NETWORK,
    paymentContractAddress: parsedEnv.data.PAYMENT_CONTRACT_ADDRESS,
    verifierContractAddress: parsedEnv.data.VERIFIER_CONTRACT_ADDRESS,
    relayerPrivateKey: parsedEnv.data.RELAYER_PRIVATE_KEY,
    gasLimit: parseInt(parsedEnv.data.GAS_LIMIT),
    // Account Abstraction
    aa: {
      rootManager: parsedEnv.data.AA_ROOT_MANAGER_ADDRESS,
      smartAccountFactory: parsedEnv.data.AA_SMART_ACCOUNT_FACTORY_ADDRESS,
      creditManager: parsedEnv.data.AA_CREDIT_MANAGER_ADDRESS,
      creditPaymaster: parsedEnv.data.AA_CREDIT_PAYMASTER_ADDRESS,
      milestoneManager: parsedEnv.data.AA_MILESTONE_MANAGER_ADDRESS,
      escrowAndYield: parsedEnv.data.AA_ESCROW_AND_YIELD_ADDRESS,
      merkleCommitStorage: parsedEnv.data.AA_MERKLE_COMMIT_STORAGE_ADDRESS,
      sessionKeyRegistry: parsedEnv.data.AA_SESSION_KEY_REGISTRY_ADDRESS,
      entryPoint: parsedEnv.data.AA_ENTRY_POINT_ADDRESS,
      wpolToken: parsedEnv.data.WPOL_TOKEN_ADDRESS,
      chainId: parseInt(parsedEnv.data.ARBITRUM_SEPOLIA_CHAIN_ID),
    },
  },
  ai: {
    openRouterApiKey: parsedEnv.data.OPENROUTER_API_KEY,
    openRouterBaseUrl: parsedEnv.data.OPENROUTER_BASE_URL,
    claudeModel: parsedEnv.data.CLAUDE_MODEL,
    coderabbitApiKey: parsedEnv.data.CODERABBIT_API_KEY,
    openaiApiKey: parsedEnv.data.OPENAI_API_KEY,
    anthropicApiKey: parsedEnv.data.ANTHROPIC_API_KEY,
    openaiModel: parsedEnv.data.OPENAI_MODEL,
    anthropicModel: parsedEnv.data.ANTHROPIC_MODEL,
  },
  inngest: {
    eventKey: parsedEnv.data.INNGEST_EVENT_KEY,
    signingKey: parsedEnv.data.INNGEST_SIGNING_KEY,
    appId: parsedEnv.data.INNGEST_APP_ID,
  },
  monitoring: {
    sentryDsn: parsedEnv.data.SENTRY_DSN,
    logLevel: parsedEnv.data.LOG_LEVEL,
  },
  email: {
    smtp: {
      host: parsedEnv.data.SMTP_HOST,
      port: parsedEnv.data.SMTP_PORT,
      secure: parsedEnv.data.SMTP_SECURE,
      auth: {
        user: parsedEnv.data.SMTP_USER,
        pass: parsedEnv.data.SMTP_PASS,
      },
    },
    from: parsedEnv.data.SMTP_FROM,
    fromName: parsedEnv.data.EMAIL_FROM_NAME,
    enabled: parsedEnv.data.EMAIL_ENABLED === 'true',
  },
  circuits: {
    version: parsedEnv.data.CIRCUIT_VERSION,
    provingKeyPath: parsedEnv.data.PROVING_KEY_PATH,
    verificationKeyPath: parsedEnv.data.VERIFICATION_KEY_PATH,
    wasmPath: parsedEnv.data.CIRCUIT_WASM_PATH,
  },
  worker: {
    maxRetries: parseInt(parsedEnv.data.MAX_RETRIES),
    proofTimeout: parseInt(parsedEnv.data.PROOF_TIMEOUT_MS),
    testTimeout: parseInt(parsedEnv.data.TEST_TIMEOUT_MS),
  },
} as const;
