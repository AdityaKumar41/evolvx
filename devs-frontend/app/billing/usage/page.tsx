'use client'

import { useUsageLogs } from '@/hooks/use-billing'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function UsagePage() {
  const { data: usageLogs, isLoading } = useUsageLogs('user-id')

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/billing">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Usage History</h1>
          <p className="text-muted-foreground">Detailed AI usage logs</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>AI Usage Logs</CardTitle>
          <CardDescription>Track your AI consumption and costs</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Workflow</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Tokens</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Billed Via</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usageLogs?.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <Badge variant="outline">{log.workflow}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{log.model}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>{log.totalTokens.toLocaleString()}</div>
                        <div className="text-muted-foreground text-xs">
                          {log.inputTokens}↑ {log.outputTokens}↓
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono">${log.cost.toFixed(4)}</TableCell>
                    <TableCell>
                      <Badge variant={log.billedVia === 'FREE' ? 'secondary' : 'default'}>
                        {log.billedVia}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(log.createdAt).toLocaleDateString()}
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
