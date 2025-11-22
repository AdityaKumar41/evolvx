'use client'

import { useState } from 'react'
import { useBilling, useAddCredit } from '@/hooks/use-billing'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Wallet } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

export default function AddCreditPage() {
  const [amount, setAmount] = useState('10')
  const { mutate: addCredit, isPending } = useAddCredit()

  const handleAddCredit = () => {
    const numAmount = parseFloat(amount)
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error('Please enter a valid amount')
      return
    }
    addCredit({ amount: numAmount, paymentMethod: 'web3' })
  }

  const presetAmounts = [10, 25, 50, 100]

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/billing">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Add Credits</h1>
          <p className="text-muted-foreground">Top up your AI credit balance</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Purchase Credits</CardTitle>
          <CardDescription>Choose an amount to add to your balance</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Quick Select</Label>
            <div className="grid grid-cols-4 gap-2">
              {presetAmounts.map((preset) => (
                <Button
                  key={preset}
                  variant={amount === preset.toString() ? 'default' : 'outline'}
                  onClick={() => setAmount(preset.toString())}
                >
                  ${preset}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="custom-amount">Custom Amount</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="custom-amount"
                  type="number"
                  min="1"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="pl-7"
                  placeholder="Enter amount"
                />
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <div className="flex justify-between text-sm mb-4">
              <span className="text-muted-foreground">Payment Method</span>
              <span className="font-medium">Web3 Wallet</span>
            </div>
            <Button 
              className="w-full" 
              size="lg"
              onClick={handleAddCredit}
              disabled={isPending}
            >
              <Wallet className="h-4 w-4 mr-2" />
              {isPending ? 'Processing...' : `Add $${amount} Credits`}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
