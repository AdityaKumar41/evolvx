# Frontend Integration Guide

Quick reference for integrating DevSponsor API with your frontend application.

## 🚀 Quick Setup

### 1. Install HTTP Client

```bash
# Using axios
npm install axios

# Or using fetch (built-in)
```

### 2. Create API Client

```typescript
// src/lib/api.ts
import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Important for cookie-based auth
});

// Add auth token to requests
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('jwt_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Redirect to login
      localStorage.removeItem('jwt_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
```

## 🔐 Authentication Flow

### GitHub OAuth

```typescript
// Step 1: Redirect to GitHub OAuth
export const initiateGitHubLogin = () => {
  window.location.href = `${API_BASE_URL}/auth/github`;
};

// Step 2: Handle callback (in your callback page)
export const handleAuthCallback = () => {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  if (token) {
    localStorage.setItem('jwt_token', token);
    return true;
  }
  return false;
};

// Step 3: Get current user
export const getCurrentUser = async () => {
  const response = await apiClient.get('/auth/me');
  return response.data.user;
};

// Link wallet
export const linkWallet = async (walletAddress: string, signature: string) => {
  const response = await apiClient.post('/auth/link-wallet', {
    walletAddress,
    signature,
  });
  return response.data;
};
```

### React Hook Example

```typescript
// hooks/useAuth.ts
import { useState, useEffect } from 'react';
import { getCurrentUser } from '@/lib/api';

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await getCurrentUser();
        setUser(userData);
      } catch (error) {
        console.error('Auth error:', error);
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, []);

  return { user, loading };
};
```

## 📋 Projects API

```typescript
// Create project
export const createProject = async (data: {
  title: string;
  description?: string;
  repositoryUrl?: string;
  tokenAddress?: string;
  orgId?: string;
}) => {
  const response = await apiClient.post('/api/projects', data);
  return response.data.project;
};

// Get all projects
export const getProjects = async (filters?: {
  status?: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  sponsorId?: string;
}) => {
  const response = await apiClient.get('/api/projects', { params: filters });
  return response.data.projects;
};

// Get project by ID
export const getProject = async (projectId: string) => {
  const response = await apiClient.get(`/api/projects/${projectId}`);
  return response.data.project;
};

// Fund project
export const fundProject = async (
  projectId: string,
  data: {
    amount: string;
    token: string;
    mode: 'ESCROW' | 'YIELD';
    onchainTxHash: string;
  }
) => {
  const response = await apiClient.post(`/api/projects/${projectId}/fund`, data);
  return response.data;
};

// Generate AI milestones
export const generateAIMilestones = async (
  projectId: string,
  data: {
    prompt: string;
    documentUrl?: string;
  }
) => {
  const response = await apiClient.post(`/api/projects/${projectId}/ai/generate`, data);
  return response.data;
};
```

### React Component Example

```typescript
// components/ProjectList.tsx
import { useQuery } from '@tanstack/react-query';
import { getProjects } from '@/lib/api';

export const ProjectList = () => {
  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => getProjects({ status: 'ACTIVE' }),
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      {projects?.map((project) => (
        <div key={project.id}>
          <h3>{project.title}</h3>
          <p>{project.description}</p>
        </div>
      ))}
    </div>
  );
};
```

## 🎯 Milestones & Tasks

```typescript
// Get project milestones
export const getProjectMilestones = async (projectId: string) => {
  const response = await apiClient.get(`/api/milestones/project/${projectId}`);
  return response.data.milestones;
};

// Claim sub-milestone
export const claimSubMilestone = async (subMilestoneId: string, branchUrl?: string) => {
  const response = await apiClient.post(`/api/milestones/${subMilestoneId}/claim`, { branchUrl });
  return response.data;
};
```

## 💬 AI Chat Assistant

```typescript
// Send chat message (non-streaming)
export const sendChatMessage = async (data: {
  message: string;
  conversationId?: string;
  context?: {
    projectId?: string;
    milestoneId?: string;
    subMilestoneId?: string;
  };
}) => {
  const response = await apiClient.post('/api/chat', data);
  return response.data;
};

// Streaming chat (using fetch for SSE)
export const streamChatMessage = async (
  data: {
    message: string;
    conversationId?: string;
    context?: any;
  },
  onChunk: (chunk: string) => void,
  onComplete: () => void
) => {
  const token = localStorage.getItem('jwt_token');
  const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader!.read();
    if (done) {
      onComplete();
      break;
    }

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') {
          onComplete();
          return;
        }
        try {
          const parsed = JSON.parse(data);
          onChunk(parsed.content);
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }
  }
};

// Get conversations
export const getConversations = async () => {
  const response = await apiClient.get('/api/chat/conversations');
  return response.data.conversations;
};

// Get task suggestions
export const getTaskSuggestions = async (data: { projectId: string; milestoneId: string }) => {
  const response = await apiClient.post('/api/chat/suggestions', data);
  return response.data;
};
```

### React Streaming Chat Component

```typescript
// components/ChatInterface.tsx
import { useState } from 'react';
import { streamChatMessage } from '@/lib/api';

export const ChatInterface = ({ projectId }: { projectId: string }) => {
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  const handleSend = async () => {
    setIsStreaming(true);
    setResponse('');

    await streamChatMessage(
      {
        message,
        context: { projectId },
      },
      (chunk) => {
        setResponse((prev) => prev + chunk);
      },
      () => {
        setIsStreaming(false);
      }
    );

    setMessage('');
  };

  return (
    <div>
      <div>{response}</div>
      <input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        disabled={isStreaming}
      />
      <button onClick={handleSend} disabled={isStreaming}>
        Send
      </button>
    </div>
  );
};
```

## 💰 Payments & Funding

```typescript
// Get funding quote
export const getFundingQuote = async (
  projectId: string,
  data: {
    amount: string;
    token: string;
    mode: 'ESCROW' | 'YIELD';
  }
) => {
  const response = await apiClient.post(`/api/funding/${projectId}/quote`, data);
  return response.data;
};

// Get contributor earnings
export const getContributorEarnings = async (contributorId: string) => {
  const response = await apiClient.get(`/api/payments/contributor/${contributorId}/earnings`);
  return response.data;
};

// Get payment history
export const getPaymentHistory = async (contributorId: string) => {
  const response = await apiClient.get(`/api/payments/contributor/${contributorId}/history`);
  return response.data;
};
```

## 🏢 Organizations

```typescript
// Create organization
export const createOrganization = async (data: {
  name: string;
  description?: string;
  githubOrg?: string;
  website?: string;
}) => {
  const response = await apiClient.post('/api/organizations', data);
  return response.data.organization;
};

// Get user organizations
export const getUserOrganizations = async () => {
  const response = await apiClient.get('/api/organizations');
  return response.data.organizations;
};

// Invite member
export const inviteOrgMember = async (
  orgId: string,
  data: {
    email: string;
    role: 'MEMBER' | 'ADMIN';
  }
) => {
  const response = await apiClient.post(`/api/organizations/${orgId}/invite`, data);
  return response.data;
};
```

## 🔔 Real-time Updates (WebSocket)

```typescript
// Connect to WebSocket
import { io } from 'socket.io-client';

const socket = io(API_BASE_URL, {
  auth: {
    token: localStorage.getItem('jwt_token'),
  },
});

// Listen for project updates
socket.on('project:updated', (data) => {
  console.log('Project updated:', data);
  // Refresh your UI
});

// Listen for payment events
socket.on('payment:processed', (data) => {
  console.log('Payment processed:', data);
  // Show notification
});

// Listen for milestone updates
socket.on('milestone:completed', (data) => {
  console.log('Milestone completed:', data);
});
```

## 🎨 TypeScript Types

```typescript
// types/api.ts
export interface User {
  id: string;
  githubId: string;
  githubUsername: string;
  email: string;
  walletAddress: string | null;
  role: 'SPONSOR' | 'DEVELOPER' | 'ADMIN';
  avatarUrl: string | null;
}

export interface Project {
  id: string;
  title: string;
  description: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  repositoryUrl: string | null;
  tokenAddress: string | null;
  paymentMode: 'ESCROW' | 'YIELD' | null;
  totalTokenAmount: string;
  sponsor: {
    id: string;
    githubUsername: string;
    avatarUrl: string | null;
  };
  milestones: Milestone[];
  createdAt: string;
  updatedAt: string;
}

export interface Milestone {
  id: string;
  title: string;
  description: string | null;
  status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  order: number;
  subMilestones: SubMilestone[];
}

export interface SubMilestone {
  id: string;
  description: string;
  status: 'OPEN' | 'CLAIMED' | 'SUBMITTED' | 'VERIFIED' | 'PAID';
  checkpointAmount: string;
  acceptanceCriteria: any;
  assignedUser: User | null;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}
```

## 🛠️ Error Handling

```typescript
// lib/errorHandler.ts
export const handleApiError = (error: any) => {
  if (error.response) {
    // Server responded with error
    const message = error.response.data?.error || 'An error occurred';
    const statusCode = error.response.status;

    switch (statusCode) {
      case 400:
        return { message: `Bad request: ${message}`, type: 'warning' };
      case 401:
        return { message: 'Please login to continue', type: 'error' };
      case 403:
        return { message: 'You do not have permission', type: 'error' };
      case 404:
        return { message: 'Resource not found', type: 'error' };
      default:
        return { message, type: 'error' };
    }
  }

  return { message: 'Network error', type: 'error' };
};

// Usage in component
try {
  await createProject(data);
} catch (error) {
  const { message, type } = handleApiError(error);
  toast[type](message);
}
```

## 🧪 Testing with Mock Data

```typescript
// lib/mockData.ts
export const mockProjects = [
  {
    id: '1',
    title: 'Web3 Dashboard',
    description: 'Build a comprehensive dashboard',
    status: 'ACTIVE',
    // ... rest of mock data
  },
];

// Use in development
export const getProjects = async () => {
  if (process.env.NODE_ENV === 'development') {
    return mockProjects;
  }
  // Real API call
  const response = await apiClient.get('/api/projects');
  return response.data.projects;
};
```

## 📱 React Query Setup

```typescript
// lib/queryClient.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// hooks/useProjects.ts
export const useProjects = (filters?: any) => {
  return useQuery({
    queryKey: ['projects', filters],
    queryFn: () => getProjects(filters),
  });
};

export const useCreateProject = () => {
  return useMutation({
    mutationFn: createProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
};
```

## 🎯 Best Practices

1. **Always handle errors** - Use try/catch and show user-friendly messages
2. **Cache aggressively** - Use React Query or SWR for automatic caching
3. **Optimize re-renders** - Memoize API calls and data
4. **Use TypeScript** - Type safety prevents runtime errors
5. **Handle loading states** - Show skeletons/spinners during requests
6. **Implement retry logic** - For failed requests
7. **Secure tokens** - Store JWT securely, consider httpOnly cookies
8. **Test thoroughly** - Use the Postman collection for integration testing

---

**Need Help?** Check the [Postman Collection](./README.md) for detailed examples!
