"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { WagmiProvider } from "wagmi";
import {
  RainbowKitProvider,
  darkTheme,
  lightTheme,
} from "@rainbow-me/rainbowkit";
import { ThemeProvider } from "@/components/theme-provider";
import { config } from "@/lib/wagmi-config";
import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import "@rainbow-me/rainbowkit/styles.css";

function RainbowKitThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch by only rendering after client mount
  useEffect(() => {
    setMounted(true);
  }, []);

  // Use resolvedTheme to get the actual theme (handles "system" preference)
  const currentTheme = mounted ? resolvedTheme || theme : "light";

  return (
    <RainbowKitProvider
      theme={currentTheme === "dark" ? darkTheme() : lightTheme()}
    >
      {children}
    </RainbowKitProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitThemeProvider>
            {children}
            <ReactQueryDevtools initialIsOpen={false} />
          </RainbowKitThemeProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  );
}
