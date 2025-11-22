"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { UserRole } from "@/lib/types";
import { Briefcase, Code } from "lucide-react";

interface RoleStepProps {
  onRoleSelected: (role: UserRole) => void;
}

export function RoleStep({ onRoleSelected }: RoleStepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h3 className="text-xl font-semibold">Choose Your Role</h3>
        <p className="text-sm text-muted-foreground">
          Select how you want to use DevSponsor
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card
          className="p-6 cursor-pointer hover:border-primary transition-all hover:shadow-lg group"
          onClick={() => onRoleSelected(UserRole.SPONSOR)}
        >
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <Briefcase className="w-6 h-6 text-primary" />
            </div>
            <div className="space-y-2">
              <h4 className="text-lg font-semibold">Sponsor</h4>
              <p className="text-sm text-muted-foreground">
                Fund projects, create milestones, and manage contributions
              </p>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                Create and manage organizations
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                Fund projects with crypto
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                AI-powered milestone generation
              </li>
            </ul>
            <Button className="w-full" variant="outline">
              Select Sponsor
            </Button>
          </div>
        </Card>

        <Card
          className="p-6 cursor-pointer hover:border-primary transition-all hover:shadow-lg group"
          onClick={() => onRoleSelected(UserRole.CONTRIBUTOR)}
        >
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <Code className="w-6 h-6 text-primary" />
            </div>
            <div className="space-y-2">
              <h4 className="text-lg font-semibold">Contributor</h4>
              <p className="text-sm text-muted-foreground">
                Work on projects, complete milestones, and earn rewards
              </p>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                Browse and claim tasks
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                Get paid for verified work
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                Automated micropayments
              </li>
            </ul>
            <Button className="w-full" variant="outline">
              Select Contributor
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
