'use client';

import { useMicropaymentHistory, useMicropaymentStats } from '@/hooks/use-micropayments';
import { useAuth } from '@/components/auth-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Coins, TrendingUp, CheckCircle, Activity } from 'lucide-react';
import { format } from 'date-fns';

export default function CreditsPage() {
  const { user, loading } = useAuth();
  const { data: history, isLoading: historyLoading } = useMicropaymentHistory(100);
  const stats = useMicropaymentStats();

  if (loading || historyLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Authentication Required</CardTitle>
            <CardDescription>Please sign in to view your AI usage</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const getComplexityColor = (complexity: string) => {
    switch (complexity) {
      case 'SIMPLE':
        return 'bg-green-500/10 text-green-400 border-green-500/30';
      case 'MEDIUM':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'COMPLEX':
        return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30';
      case 'VERY_COMPLEX':
        return 'bg-red-500/10 text-red-400 border-red-500/30';
      default:
        return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return 'bg-green-500/10 text-green-400 border-green-500/30';
      case 'PENDING':
        return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30';
      case 'FAILED':
        return 'bg-red-500/10 text-red-400 border-red-500/30';
      default:
        return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30';
    }
  };

  return (
    <div className="container mx-auto max-w-7xl space-y-8 p-6">
      <div>
        <h1 className="text-3xl font-bold">AI Usage & Payments</h1>
        <p className="mt-2 text-zinc-400">
          Track your AI micropayments with Account Abstraction
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
            <Coins className="h-4 w-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalSpent.toFixed(2)}</div>
            <p className="mt-1 text-xs text-zinc-400">Credits paid</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Prompts</CardTitle>
            <Activity className="h-4 w-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalPrompts}</div>
            <p className="mt-1 text-xs text-zinc-400">AI requests</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Cost</CardTitle>
            <TrendingUp className="h-4 w-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.averageCost.toFixed(2)}</div>
            <p className="mt-1 text-xs text-zinc-400">Credits per prompt</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Successful</CardTitle>
            <CheckCircle className="h-4 w-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.successfulPayments}</div>
            <p className="mt-1 text-xs text-zinc-400">Completed payments</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payment History</CardTitle>
          <CardDescription>
            All AI micropayments via Account Abstraction ({history?.length || 0} transactions)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!history || history.length === 0 ? (
            <div className="py-8 text-center text-sm text-zinc-400">
              No payments yet. Start using AI features to see your payment history.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Complexity</TableHead>
                  <TableHead className="text-right">Base</TableHead>
                  <TableHead className="text-right">Fee</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Transaction</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="text-sm">
                      {format(new Date(tx.createdAt), 'MMM d, yyyy HH:mm')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getComplexityColor(tx.promptComplexity)}>
                        {tx.promptComplexity}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {Number(tx.credits).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-zinc-400">
                      {Number(tx.platformFeeCredits).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {Number(tx.totalCredits).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getStatusColor(tx.status)}>
                        {tx.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {tx.transactionHash ? (
                        <a
                          href={`https://sepolia.arbiscan.io/tx/${tx.transactionHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-400 hover:underline"
                        >
                          {tx.transactionHash.slice(0, 6)}...{tx.transactionHash.slice(-4)}
                        </a>
                      ) : (
                        <span className="text-sm text-zinc-500">Pending</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
