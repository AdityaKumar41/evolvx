import { http, createConfig } from "wagmi";
import { mainnet, sepolia, polygon, polygonAmoy } from "wagmi/chains";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";

export const config = getDefaultConfig({
  appName: "DevSponsor",
  projectId:
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "YOUR_PROJECT_ID",
  chains: [mainnet, sepolia, polygon, polygonAmoy],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
    [polygon.id]: http(),
    [polygonAmoy.id]: http(),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
