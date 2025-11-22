"use client";

import { useBilling } from "@/hooks/use-billing";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export default function BillingSettingsPage() {
  const { billingInfo, updateBillingMode, isUpdating } = useBilling("user-id");
  const [selectedMode, setSelectedMode] = useState(
    billingInfo?.billingMode || "CREDIT"
  );

  const handleSave = () => {
    updateBillingMode(selectedMode as any);
  };

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/billing">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Billing Settings</h1>
          <p className="text-muted-foreground">
            Configure how AI usage is charged
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Billing Mode</CardTitle>
          <CardDescription>
            Choose how you want to pay for AI usage
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <RadioGroup
            value={selectedMode}
            onValueChange={(value) =>
              setSelectedMode(value as "CREDIT" | "MICROPAYMENT" | "HYBRID")
            }
          >
            <div className="flex items-start space-x-3 space-y-0 rounded-md border p-4">
              <RadioGroupItem value="CREDIT" id="credit" />
              <div className="flex-1">
                <Label htmlFor="credit" className="font-medium">
                  Credit-based
                </Label>
                <p className="text-sm text-muted-foreground">
                  Pre-purchase credits and use them for AI operations. Best for
                  predictable usage.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3 space-y-0 rounded-md border p-4">
              <RadioGroupItem value="MICROPAYMENT" id="micropayment" />
              <div className="flex-1">
                <Label htmlFor="micropayment" className="font-medium">
                  Pay-per-use
                </Label>
                <p className="text-sm text-muted-foreground">
                  Pay only for what you use with blockchain micropayments. No
                  upfront costs.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3 space-y-0 rounded-md border p-4">
              <RadioGroupItem value="HYBRID" id="hybrid" />
              <div className="flex-1">
                <Label htmlFor="hybrid" className="font-medium">
                  Hybrid
                </Label>
                <p className="text-sm text-muted-foreground">
                  Use credits first, automatically fall back to micropayments
                  when credits run out.
                </p>
              </div>
            </div>
          </RadioGroup>

          <Button
            onClick={handleSave}
            disabled={isUpdating || selectedMode === billingInfo?.billingMode}
            className="w-full"
          >
            {isUpdating ? "Saving..." : "Save Changes"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
