"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useCurrentUser } from "@/hooks/use-auth";
import { useAccount } from "wagmi";
import { SmartAccountSetup } from "@/components/sponsor/smart-account-setup";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Wallet, CreditCard, Settings, AlertCircle } from "lucide-react";
import { redirect } from "next/navigation";

export default function SponsorAccountPage() {
  const { user } = useAuth();
  const { data: currentUser, isLoading } = useCurrentUser();
  const { address, isConnected } = useAccount();
  const [activeTab, setActiveTab] = useState("smart-account");

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "SPONSOR")) {
      redirect("/dashboard");
    }
  }, [user, isLoading]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== "SPONSOR") {
    return null;
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Account Setup</h1>
        <p className="text-muted-foreground">
          Configure your smart account and payment settings
        </p>
      </div>

      {!isConnected && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Please connect your wallet to set up your account
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="smart-account">
            <Wallet className="h-4 w-4 mr-2" />
            Smart Account
          </TabsTrigger>
          <TabsTrigger value="credits">
            <CreditCard className="h-4 w-4 mr-2" />
            Credits
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="smart-account" className="space-y-4">
          <SmartAccountSetup
            onComplete={(smartAccountAddress) => {
              console.log("Smart account setup complete:", smartAccountAddress);
              setActiveTab("credits");
            }}
          />

          <Card>
            <CardHeader>
              <CardTitle>Connected Wallet</CardTitle>
              <CardDescription>
                Your primary wallet for signing transactions
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isConnected && address ? (
                <div className="flex items-center gap-2">
                  <code className="text-sm bg-muted px-2 py-1 rounded">
                    {address}
                  </code>
                  <Badge variant="outline">Connected</Badge>
                </div>
              ) : (
                <p className="text-muted-foreground">No wallet connected</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="credits" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Credit Management</CardTitle>
              <CardDescription>
                Purchase and manage credits for gasless transactions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Complete smart account setup to purchase credits
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Account Settings</CardTitle>
              <CardDescription>
                Manage your account preferences and session keys
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Session key management coming soon
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
