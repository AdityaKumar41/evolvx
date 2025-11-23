export enum UserRole {
  SPONSOR = "SPONSOR",
  CONTRIBUTOR = "CONTRIBUTOR",
  ADMIN = "ADMIN",
}

export enum ProjectStatus {
  DRAFT = "DRAFT",
  ACTIVE = "ACTIVE",
  PAUSED = "PAUSED",
  CLOSED = "CLOSED",
}

export enum RepoType {
  PUBLIC = "PUBLIC",
  PRIVATE = "PRIVATE",
  PRIVATE_INVITE = "PRIVATE_INVITE",
  PRIVATE_REQUEST = "PRIVATE_REQUEST",
  OPEN_EVENT = "OPEN_EVENT",
}

export enum JoinRequestStatus {
  PENDING = "PENDING",
  ACCEPTED = "ACCEPTED",
  DECLINED = "DECLINED",
  EXPIRED = "EXPIRED",
}

export enum PRSubmissionStatus {
  PENDING = "PENDING",
  AI_REVIEW = "AI_REVIEW",
  SPONSOR_REVIEW = "SPONSOR_REVIEW",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  MERGED = "MERGED",
}

export enum FundingMode {
  ESCROW = "ESCROW",
  GASLESS = "GASLESS",
  YIELD = "YIELD",
}

export enum MilestoneStatus {
  OPEN = "OPEN",
  CLAIMED = "CLAIMED",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  RESCOPED = "RESCOPED",
}

export enum ContributionStatus {
  PENDING = "PENDING",
  VERIFIED = "VERIFIED",
  PAID = "PAID",
  DISPUTED = "DISPUTED",
}

export interface User {
  id: string;
  githubId: string;
  githubUsername: string;
  email?: string;
  avatarUrl?: string;
  role: UserRole;
  walletAddress?: string;
  name?: string;
  bio?: string;
  skills?: string[];
  organizationName?: string;
  onboardingCompleted?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Organization {
  id: string;
  name: string;
  description?: string;
  logoUrl?: string;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
  members?: OrganizationMember[];
  _count?: {
    members: number;
    projects: number;
  };
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
  user: User;
}

export interface Project {
  totalFunded: any;
  id: string;
  title: string;
  description: string;
  repositoryUrl?: string;
  repoType: RepoType;
  status: ProjectStatus;
  budget?: string;
  tokenAddress?: string;
  tokenNetwork?: string;
  fundingMode?: FundingMode;
  organizationId: string;
  sponsorId: string;
  totalPoints?: number;
  createdAt: string;
  updatedAt: string;
  sponsor?: User;
  organization?: Organization;
  milestones?: Milestone[];
  uiTemplates?: UITemplate[];
  _count?: {
    milestones: number;
    contributions: number;
  };
}

export interface Milestone {
  id: string;
  projectId: string;
  title: string;
  description: string;
  points: number;
  order: number;
  status: MilestoneStatus;
  createdByAI: boolean;
  createdAt: string;
  updatedAt: string;
  subMilestones?: SubMilestone[];
}

export interface SubMilestone {
  id: string;
  milestoneId: string;
  description: string;
  points: number;
  taskType?: "ui" | "code" | "feature" | "bug" | "docs";
  acceptanceCriteria?: string;
  checkpointAmount?: string;
  checkpointsCount?: number;
  estimateHours?: number;
  assignedTo?: string;
  status: MilestoneStatus;
  createdByAI: boolean;
  attachments?: Attachment[];
  createdAt: string;
  updatedAt: string;
  assignedUser?: User;
  contributions?: Contribution[];
  prSubmissions?: PRSubmission[];
}

export interface Attachment {
  id: string;
  type: "image" | "link";
  url: string;
  name: string;
  createdAt?: string;
}

export interface Contribution {
  id: string;
  subMilestoneId: string;
  contributorId: string;
  commitHash: string;
  prUrl?: string;
  status: ContributionStatus;
  amountPaid?: string;
  transactionHash?: string;
  verifiedAt?: string;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
  contributor?: User;
  subMilestone?: SubMilestone;
  proof?: any;
}

export interface MicroPayment {
  id: string;
  contributionId: string;
  amount: string;
  transactionHash?: string;
  createdAt: string;
}

export interface FundingTransaction {
  id: string;
  projectId: string;
  amount: string;
  token: string;
  mode: FundingMode;
  onchainTxHash?: string;
  createdAt: string;
}

export interface Payment {
  id: string;
  contributionId: string;
  amount: string;
  status: string;
  transactionHash?: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  userId: string;
  projectId?: string;
  title?: string;
  createdAt: string;
  messages?: Message[];
}

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

// API Request/Response Types
export interface CreateProjectRequest {
  title: string;
  description: string;
  repositoryUrl?: string;
  tokenAddress?: string;
  tokenNetwork?: "base" | "polygon" | "arbitrum";
  orgId: string;
  repoType?: RepoType;
}

export interface GitHubRepository {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  private: boolean;
  htmlUrl: string;
  description?: string;
  language?: string;
  stargazersCount: number;
  forksCount: number;
}

export interface GitHubAppStatus {
  isConfigured: boolean;
  appName?: string;
  appId?: string;
}

export interface FundProjectRequest {
  amount: string;
  token: string;
  mode: FundingMode;
  onchainTxHash: string;
}

export interface GenerateMilestonesRequest {
  prompt: string;
  documentUrl?: string;
}

export interface ClaimSubMilestoneRequest {
  branchUrl?: string;
}

export interface CreateOrganizationRequest {
  name: string;
  description?: string;
  logoUrl?: string;
}

export interface InviteMemberRequest {
  email: string;
  role: string;
}

export interface LinkWalletRequest {
  walletAddress: string;
  signature: string;
}

export interface SendMessageRequest {
  message: string;
  conversationId?: string;
  projectId?: string;
}

export interface OnboardingData {
  role: UserRole;
  name?: string;
  bio?: string;
  skills?: string[];
  organizationName?: string;
  organizationDescription?: string;
}

export interface JoinRequest {
  id: string;
  projectId: string;
  userId: string;
  message?: string;
  status: JoinRequestStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
  user?: User;
  project?: Project;
  reviewer?: User;
}

export interface PRSubmission {
  id: string;
  subMilestoneId: string;
  contributorId: string;
  prUrl: string;
  prNumber?: number;
  notes?: string;
  status: PRSubmissionStatus;
  aiReviewScore?: number;
  aiReviewFeedback?: any;
  sponsorFeedback?: string;
  mergedAt?: string;
  createdAt: string;
  updatedAt: string;
  subMilestone?: SubMilestone;
  contributor?: User;
  screenshots?: UIScreenshot[];
}

export interface UIScreenshot {
  id: string;
  prSubmissionId: string;
  s3Key: string;
  s3Url: string;
  filename: string;
  mimeType: string;
  size: number;
  metadata?: any;
  createdAt: string;
}

export interface UITemplate {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  colors: any; // { primary, secondary, accent, etc }
  fonts: any; // { heading, body, code, etc }
  components: any; // component rules
  layout: any; // layout rules
  styleTokens?: any;
  generatedByAI: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Document {
  id: string;
  projectId: string;
  milestoneId?: string;
  fileName: string;
  fileUrl: string;
  fileType: string; // "PDF", "MARKDOWN", "TEXT", "CODE", "IMAGE", etc.
  fileSizeBytes: number;
  uploadedBy?: string;
  vectorRefIds: string[]; // Qdrant point IDs
  createdAt: string;
  updatedAt: string;
  project?: {
    id: string;
    name: string;
  };
  milestone?: {
    id: string;
    title: string;
  };
  uploader?: {
    id: string;
    githubUsername: string;
    name?: string;
    avatarUrl?: string;
  };
}

// API Request Types
export interface CreateJoinRequestRequest {
  message?: string;
}

export interface ReviewJoinRequestRequest {
  status: "ACCEPTED" | "DECLINED";
}

export interface SubmitPRRequest {
  prUrl: string;
  prNumber?: number;
  notes?: string;
  screenshots?: File[];
}

export interface ReviewPRRequest {
  approved: boolean;
  feedback?: string;
}
