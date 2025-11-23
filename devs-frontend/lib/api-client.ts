/**
 * API Client Configuration
 * Centralized axios client with authentication and error handling
 */

import axios from "axios";

// Get backend URL from environment variable or default to localhost
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor for adding auth token
apiClient.interceptors.request.use(
  (config) => {
    // Get token from localStorage or cookies
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("jwt_token");
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized access
      if (typeof window !== "undefined") {
        localStorage.removeItem("jwt_token");
        window.location.href = "/";
      }
    }
    return Promise.reject(error);
  }
);

/**
 * API Endpoints
 * These match the backend routes from BACKEND_IMPLEMENTATION.md
 */

export const api = {
  // Auth
  auth: {
    login: (githubToken: string) =>
      apiClient.post("/auth/login", { githubToken }),
    me: () => apiClient.get("/auth/me"),
    logout: () => apiClient.post("/auth/logout"),
  },

  // Projects
  projects: {
    list: () => apiClient.get("/api/projects"),
    get: (id: string) => apiClient.get(`/api/projects/${id}`),
    create: (data: any) => apiClient.post("/api/projects", data),
    update: (id: string, data: any) =>
      apiClient.put(`/api/projects/${id}`, data),
    delete: (id: string) => apiClient.delete(`/api/projects/${id}`),
    updateAIModel: (id: string, model: string) =>
      apiClient.put(`/api/projects/${id}/ai-model`, { model }),
    fund: (id: string, amount: number, txHash: string) =>
      apiClient.post(`/api/projects/${id}/fund`, {
        amount,
        transactionHash: txHash,
      }),
  },

  // Milestones
  milestones: {
    list: (projectId: string) => apiClient.get(`/api/milestones/${projectId}`),
    create: (data: any) => apiClient.post("/api/milestones", data),
    update: (id: string, data: any) =>
      apiClient.put(`/api/milestones/${id}`, data),
    delete: (id: string) => apiClient.delete(`/api/milestones/${id}`),
    generate: (id: string) => apiClient.post(`/api/milestones/${id}/generate`),
    getCost: (id: string) => apiClient.get(`/api/milestones/${id}/cost`),
  },

  // SubMilestones
  subMilestones: {
    create: (data: any) => apiClient.post("/api/submilestones", data),
    update: (id: string, data: any) =>
      apiClient.patch(`/api/submilestones/${id}`, data),
    delete: (id: string) => apiClient.delete(`/api/submilestones/${id}`),
    assign: (id: string, userId: string) =>
      apiClient.post(`/api/submilestones/${id}/assign`, { userId }),
    submitPR: (id: string, data: any) =>
      apiClient.post(`/api/submilestones/${id}/submit-pr`, data),
  },

  // PR & Contributions
  pr: {
    verify: (id: string) =>
      apiClient.post(`/api/submilestones/pr-submissions/${id}/ai/verify`),
    merge: (id: string) =>
      apiClient.post(`/api/submilestones/pr-submissions/${id}/ai/merge`),
    getScores: (id: string) =>
      apiClient.get(`/api/submilestones/submissions/${id}`),
    uploadContributorScreenshot: (id: string, file: File) => {
      const formData = new FormData();
      formData.append("screenshot", file);
      return apiClient.post(
        `/api/submilestones/pr-submissions/${id}/ui/contributor-screenshot`,
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );
    },
    uploadSponsorScreenshot: (id: string, file: File) => {
      const formData = new FormData();
      formData.append("screenshot", file);
      return apiClient.post(
        `/api/submilestones/pr-submissions/${id}/ui/sponsor-screenshot`,
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );
    },
    compareScreenshots: (id: string) =>
      apiClient.post(`/api/submilestones/pr-submissions/${id}/ui/analyze`),
    approveUI: (id: string, feedback?: string) =>
      apiClient.post(`/api/submilestones/pr-submissions/${id}/ui/approve`, {
        feedback,
      }),
    rejectUI: (id: string, feedback: string) =>
      apiClient.post(`/api/submilestones/pr-submissions/${id}/ui/reject`, {
        feedback,
      }),
    getVerificationStatus: (id: string) =>
      apiClient.get(`/api/submilestones/pr-submissions/${id}/ui/status`),
  },

  // AI & Billing
  ai: {
    chat: (data: { projectId?: string; message: string; history?: any[] }) =>
      apiClient.post("/ai/chat", data),
    getContext: (projectId: string, query: string) =>
      apiClient.post("/ai/context", { projectId, query }),
    generateMilestones: (data: {
      projectId: string;
      prompt: string;
      repositoryUrl?: string;
      attachments?: File[];
    }) => {
      const formData = new FormData();
      formData.append("projectId", data.projectId);
      formData.append("prompt", data.prompt);
      if (data.repositoryUrl) {
        formData.append("repositoryUrl", data.repositoryUrl);
      }
      if (data.attachments) {
        data.attachments.forEach((file) => {
          formData.append("attachments", file);
        });
      }
      return apiClient.post("/api/ai/milestones/generate", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    getMilestoneStatus: (projectId: string) =>
      apiClient.get(`/api/ai/milestones/status/${projectId}`),
  },

  billing: {
    getUsage: (filters?: any) =>
      apiClient.get("/billing/ai/usage", { params: filters }),
    getStats: (period: string) =>
      apiClient.get("/billing/ai/stats", { params: { period } }),
    addCredit: (amount: number, paymentMethod: string) =>
      apiClient.post("/billing/credits/add", { amount, paymentMethod }),
    getBalance: () => apiClient.get("/billing/credits/balance"),
    updateBillingMode: (mode: string) =>
      apiClient.put("/billing/mode", { mode }),
  },

  // Documents
  documents: {
    list: (projectId: string) => apiClient.get(`/api/documents/${projectId}`),
    upload: (data: FormData) =>
      apiClient.post("/api/documents", data, {
        headers: { "Content-Type": "multipart/form-data" },
      }),
    get: (id: string) => apiClient.get(`/api/documents/${id}`),
    delete: (id: string) => apiClient.delete(`/api/documents/${id}`),
    index: (id: string) => apiClient.post(`/api/documents/${id}/index`),
  },

  // Organizations
  organizations: {
    list: () => apiClient.get("/api/organizations"),
    get: (id: string) => apiClient.get(`/api/organizations/${id}`),
    create: (data: any) => apiClient.post("/api/organizations", data),
    update: (id: string, data: any) =>
      apiClient.patch(`/api/organizations/${id}`, data),
    delete: (id: string) => apiClient.delete(`/api/organizations/${id}`),

    // Members
    getMembers: (id: string) =>
      apiClient.get(`/api/organizations/${id}/members`),
    removeMember: (id: string, memberId: string) =>
      apiClient.delete(`/api/organizations/${id}/members/${memberId}`),

    // Invites
    inviteMember: (
      id: string,
      data: { email?: string; githubUsername?: string; role: string }
    ) => apiClient.post(`/api/organizations/${id}/invite`, data),
    getPendingInvites: (id: string) =>
      apiClient.get(`/api/organizations/${id}/invites`),
    validateInviteToken: (token: string) =>
      apiClient.get(`/api/organizations/invites/validate/${token}`),
    acceptInvite: (inviteId: string) =>
      apiClient.post(`/api/organizations/invites/${inviteId}/accept`),
    acceptInviteByToken: (token: string) =>
      apiClient.post(`/api/organizations/invites/token/${token}/accept`),
    declineInvite: (inviteId: string) =>
      apiClient.post(`/api/organizations/invites/${inviteId}/decline`),
    declineInviteByToken: (token: string) =>
      apiClient.post(`/api/organizations/invites/token/${token}/decline`),
  },

  // Contributions
  contributions: {
    list: (filters?: any) =>
      apiClient.get("/api/contributions", { params: filters }),
    claim: (id: string) => apiClient.post(`/api/contributions/${id}/claim`),
    getStatus: (id: string) => apiClient.get(`/api/contributions/${id}/status`),
  },

  // Session Keys (Account Abstraction)
  sessionKeys: {
    register: (data: {
      userId: string;
      smartAccountAddress: string;
      signature: string;
      config: {
        maxCreditsPerPrompt: number;
        maxTotalSpend: number;
        validDuration: number;
      };
    }) => apiClient.post("/api/session-keys/register", data),
    list: () => apiClient.get("/api/session-keys/list"),
    getActive: (smartAccountAddress: string) =>
      apiClient.get("/api/session-keys/active", {
        params: { smartAccountAddress },
      }),
    revoke: (data: {
      sessionKeyId: string;
      smartAccountAddress: string;
      sessionKeyAddress: string;
    }) => apiClient.post("/api/session-keys/revoke", data),
  },

  // Micropayments (Account Abstraction)
  micropayments: {
    calculateCost: (data: { promptText: string; estimatedTokens?: number }) =>
      apiClient.post("/api/micropayment/calculate-cost", data),
    getHistory: (limit?: number) =>
      apiClient.get("/api/micropayment/history", {
        params: { limit },
      }),
  },
};

export default apiClient;
