import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Globe, Lock, Users, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface RepoSettingsProps {
  projectId: string;
  currentMode?: "PUBLIC" | "PRIVATE" | "EVENT";
  onUpdate?: (mode: string) => void;
}

export function RepoSettings({
  projectId,
  currentMode = "PUBLIC",
  onUpdate,
}: RepoSettingsProps) {
  const [mode, setMode] = useState(currentMode);
  const [inviteUsername, setInviteUsername] = useState("");

  const handleSyncPermissions = () => {
    toast.success("Repository permissions synced");
  };

  const handleInvite = () => {
    if (!inviteUsername.trim()) {
      toast.error("Please enter a GitHub username");
      return;
    }
    toast.success(`Invited ${inviteUsername}`);
    setInviteUsername("");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Repository Visibility</CardTitle>
          <CardDescription>Control who can access this project</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            value={mode}
            onValueChange={(value) =>
              setMode(value as "PUBLIC" | "PRIVATE" | "EVENT")
            }
          >
            <div className="flex items-start space-x-3 space-y-0 rounded-md border p-4">
              <RadioGroupItem value="PUBLIC" id="public" />
              <div className="flex-1">
                <Label
                  htmlFor="public"
                  className="font-medium flex items-center gap-2"
                >
                  <Globe className="h-4 w-4" />
                  Public
                </Label>
                <p className="text-sm text-muted-foreground">
                  Anyone can view and contribute to this project
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3 space-y-0 rounded-md border p-4">
              <RadioGroupItem value="PRIVATE" id="private" />
              <div className="flex-1">
                <Label
                  htmlFor="private"
                  className="font-medium flex items-center gap-2"
                >
                  <Lock className="h-4 w-4" />
                  Private (Invite Only)
                </Label>
                <p className="text-sm text-muted-foreground">
                  Only invited contributors can participate
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3 space-y-0 rounded-md border p-4">
              <RadioGroupItem value="EVENT" id="event" />
              <div className="flex-1">
                <Label
                  htmlFor="event"
                  className="font-medium flex items-center gap-2"
                >
                  <Users className="h-4 w-4" />
                  Event (Hackathon Mode)
                </Label>
                <p className="text-sm text-muted-foreground">
                  Open source event with join requests enabled
                </p>
              </div>
            </div>
          </RadioGroup>

          <Button
            onClick={() => onUpdate?.(mode)}
            disabled={mode === currentMode}
            className="w-full"
          >
            Update Visibility
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invite Contributors</CardTitle>
          <CardDescription>Add contributors by GitHub username</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="GitHub username"
              value={inviteUsername}
              onChange={(e) => setInviteUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleInvite()}
            />
            <Button onClick={handleInvite}>Invite</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Repository Permissions</CardTitle>
          <CardDescription>
            Sync GitHub permissions with platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={handleSyncPermissions}
            variant="outline"
            className="w-full"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Sync Permissions
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
