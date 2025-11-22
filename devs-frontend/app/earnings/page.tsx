'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { TrendingUp } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

export default function EarningsPage() {
  const { data: earnings, isLoading } = useQuery({
    queryKey: ['earnings'],
    queryFn: async () => {
      // Mock API call
      return {
        total: 1250.50,
        pending: 350.00,
        completed: 900.50,
        transactions: [
          { id: '1', project: 'DevSponsor', task: 'Login System', amount: 150.00, status: 'completed', date: '2025-01-15' },
          { id: '2', project: 'DevSponsor', task: 'Dashboard UI', amount: 200.00, status: 'pending', date: '2025-01-14' },
        ]
      }
    }
  })

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">My Earnings</h1>
        <p className="text-muted-foreground">Track your contributions and payments</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Total Earned</CardTitle>
            <CardDescription>All-time earnings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">${earnings?.total.toFixed(2)}</div>
            <div className="flex items-center text-sm text-green-600 mt-2">
              <TrendingUp className="h-4 w-4 mr-1" />
              +12% this month
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pending</CardTitle>
            <CardDescription>Awaiting release</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">${earnings?.pending.toFixed(2)}</div>
            <Badge variant="secondary" className="mt-2">In Escrow</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Completed</CardTitle>
            <CardDescription>Successfully released</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">${earnings?.completed.toFixed(2)}</div>
            <div className="text-sm text-muted-foreground mt-2">
              Available for withdrawal
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
          <CardDescription>Your completed and pending payments</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Task</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {earnings?.transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="font-medium">{tx.project}</TableCell>
                    <TableCell>{tx.task}</TableCell>
                    <TableCell className="font-mono">${tx.amount.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant={tx.status === 'completed' ? 'default' : 'secondary'}>
                        {tx.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(tx.date).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
