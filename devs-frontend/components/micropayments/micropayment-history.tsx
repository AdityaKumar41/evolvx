"use client";

import { useMicropaymentHistory } from "@/hooks/use-micropayments";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  AlertCircle,
  ExternalLink,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";

interface MicropaymentHistoryProps {
  limit?: number;
  className?: string;
}

export function MicropaymentHistory({
  limit = 50,
  className,
}: MicropaymentHistoryProps) {
  const { data: history, isLoading, error } = useMicropaymentHistory(limit);

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Micropayment History</CardTitle>
          <CardDescription>
            Gasless AI payments via Account Abstraction
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Micropayment History</CardTitle>
          <CardDescription>
            Gasless AI payments via Account Abstraction
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center gap-2 py-8 text-red-400">
            <AlertCircle className="h-5 w-5" />
            <span>Failed to load transaction history</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!history || history.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Micropayment History</CardTitle>
          <CardDescription>
            Gasless AI payments via Account Abstraction
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center text-sm text-zinc-400">
            No transactions yet. Start using AI features to see your payment
            history.
          </div>
        </CardContent>
      </Card>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "SUCCESS":
        return (
          <Badge
            variant="outline"
            className="bg-green-50 text-green-700 border-green-200"
          >
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Success
          </Badge>
        );
      case "PENDING":
        return (
          <Badge
            variant="outline"
            className="bg-blue-50 text-blue-700 border-blue-200"
          >
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
      case "FAILED":
        return (
          <Badge
            variant="outline"
            className="bg-red-50 text-red-700 border-red-200"
          >
            <XCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Micropayment History</CardTitle>
        <CardDescription>
          Your recent gasless AI payments ({history.length} transaction
          {history.length !== 1 ? "s" : ""})
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Prompt</TableHead>
              <TableHead className="text-right">Credits</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>TX</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.map((tx) => (
              <TableRow key={tx.id}>
                <TableCell className="text-sm">
                  {format(new Date(tx.createdAt), "MMM d, yyyy HH:mm")}
                </TableCell>
                <TableCell className="max-w-xs truncate text-sm">
                  {tx.promptText || "AI Usage"}
                </TableCell>
                <TableCell className="text-right font-mono font-semibold">
                  {tx.totalCredits.toFixed(2)}
                </TableCell>
                <TableCell>{getStatusBadge(tx.status)}</TableCell>
                <TableCell>
                  {tx.transactionHash ? (
                    <Button variant="ghost" size="sm" asChild>
                      <a
                        href={`https://sepolia.arbiscan.io/tx/${tx.transactionHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                        View
                      </a>
                    </Button>
                  ) : tx.userOpHash ? (
                    <span className="text-xs text-muted-foreground font-mono">
                      {tx.userOpHash.slice(0, 8)}...
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
