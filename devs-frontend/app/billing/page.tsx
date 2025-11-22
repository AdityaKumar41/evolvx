'use client'

import { useBilling } from '@/hooks/use-billing'
import { CreditBalance } from '@/components/billing/credit-balance'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, History, Settings as SettingsIcon } from 'lucide-react'
import Link from 'next/link'

export default function BillingPage() {
  const { billingInfo } = useBilling('user-id') // Replace with actual user ID

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Billing & Credits</h1>
          <p className="text-muted-foreground">Manage your AI credits and view usage</p>
        </div>
        <Button asChild>
          <Link href="/billing/add-credit">
            <Plus className="h-4 w-4 mr-2" />
            Add Credits
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <CreditBalance userId="user-id" />
        
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Billing Mode</CardTitle>
            <CardDescription>How AI usage is charged</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{billingInfo?.billingMode}</div>
            <Button variant="outline" className="mt-4 w-full" asChild>
              <Link href="/billing/settings">
                <SettingsIcon className="h-4 w-4 mr-2" />
                Change Mode
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick Actions</CardTitle>
            <CardDescription>Manage your account</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full" asChild>
              <Link href="/billing/usage">
                <History className="h-4 w-4 mr-2" />
                View Usage History
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
          <CardDescription>Your billing summary</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="history">Recent Activity</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="space-y-4">
              <div className="text-center py-8 text-muted-foreground">
                Billing overview coming soon
              </div>
            </TabsContent>
            <TabsContent value="history" className="space-y-4">
              <div className="text-center py-8 text-muted-foreground">
                Recent activity will appear here
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
