import { useMutation, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { LinkWalletRequest, OnboardingData, User } from "@/lib/types";

// Auth endpoints are at /auth, not /api/auth
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const authClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add auth token to requests
authClient.interceptors.request.use(
  (config) => {
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

export function useCurrentUser() {
  return useQuery<User>({
    queryKey: ["currentUser"],
    queryFn: async () => {
      const response = await authClient.get("/auth/me");
      return response.data.user;
    },
    retry: false,
  });
}

export function useLinkWallet() {
  return useMutation({
    mutationFn: async (data: LinkWalletRequest) => {
      const response = await authClient.post("/auth/link-wallet", data);
      return response.data;
    },
  });
}

export function useCompleteOnboarding() {
  return useMutation({
    mutationFn: async (data: OnboardingData) => {
      const response = await authClient.post("/auth/onboarding", data);

      // Update the JWT token with the new role
      if (response.data.token) {
        localStorage.setItem("jwt_token", response.data.token);
      }

      return response.data;
    },
  });
}

export function useUpdateRole() {
  return useMutation({
    mutationFn: async (role: "SPONSOR" | "CONTRIBUTOR") => {
      const response = await authClient.put("/auth/role", { role });

      // Update the JWT token with the new role
      if (response.data.token) {
        localStorage.setItem("jwt_token", response.data.token);
      }

      return response.data;
    },
  });
}

export function useLogout() {
  return useMutation({
    mutationFn: async () => {
      const response = await authClient.post("/auth/logout");
      return response.data;
    },
  });
}
