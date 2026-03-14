'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TransactionsDialog } from '@/components/transactions'
import { Loader, LoaderWithText } from '@/components/Loader'
import { Download, Filter, X, Loader2 } from 'lucide-react'
import JsonView from '@uiw/react-json-view'
import { safeToLocaleDateString } from '@/lib/dateUtils'

interface Payout {
  id: string | number
  date: string
  amount: string | number
  currency: string
  status: string
  inDatabase?: boolean
  addedToDatabaseAt?: string
  netsuiteDepositNumber?: string | null
  netsuiteDepositId?: string | null
  pushedToNsBy?: string | null
  pushedToNsAt?: string | null
}

interface Transaction {
  id: string
  source_order_id: string
  amount: string | number
  fee: string | number
  net: string | number
  type: string
  currency: string
  processedAt: string
}

interface SavedPayout {
  id: string
  date: string
  amount: number
  currency: string
  status: string
  netsuiteDepositNumber: string | null
  netsuiteDepositId: string | null
  pushedToNsBy?: string | null
  pushedToNsAt?: string | null
  transactionCount?: number
  transactions: Array<{
    id: string
    source_order_id: string
    order_name?: string | null
    amount: number
    fee: number
    net: number
    type: string
    currency: string
    processedAt: string | null
    netsuiteTransactionId?: string | null
    netsuiteTransactionName?: string | null
    netsuiteAmount?: number | null
  }>
}

export function PayoutsSection() {
  // Payout state
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [savedPayouts, setSavedPayouts] = useState<SavedPayout[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingSaved, setIsLoadingSaved] = useState(false)
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false)
  const [selectedPayoutTransactions, setSelectedPayoutTransactions] = useState<Transaction[]>([])
  const [selectedPayoutTotalAmount, setSelectedPayoutTotalAmount] = useState<number | null>(null)
  const [selectedPayoutCurrency, setSelectedPayoutCurrency] = useState<string>('USD')
  const [selectedPayoutId, setSelectedPayoutId] = useState<string | null>(null)
  const [payoutIdInput, setPayoutIdInput] = useState('')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [hideSensitiveData, setHideSensitiveData] = useState(false)

  // Range import state
  const [payoutRangeStart, setPayoutRangeStart] = useState('')
  const [payoutRangeEnd, setPayoutRangeEnd] = useState('')

  // Search and filter state
  const [statusView, setStatusView] = useState<'all' | 'unpushed' | 'pushed'>('unpushed')
  const [sortField, setSortField] = useState<'id' | 'date' | 'amount' | 'status'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [payoutSearchTerm, setPayoutSearchTerm] = useState('')
  const [isPayoutFiltersOpen, setIsPayoutFiltersOpen] = useState(false)
  const [filters, setFilters] = useState({
    netsuiteStatus: {
      all: true,
      not_pushed: false,
      pushed: false
    },
    payoutStatus: {
      all: true,
      paid: false,
      pending: false
    },
    dateRange: {
      all: true,
      recent: false
    }
  })

  // NetSuite preview dialog state
  const [netsuitePreviewDialog, setNetsuitePreviewDialog] = useState<{
    isOpen: boolean
    payoutId: string | null
    previewData: {
      depositRequest: any
      stats: {
        totalTransactions: number
        transactionsWithNS: number
        depositItemsCount: number
        totalFees: number
      }
    } | null
    isLoading: boolean
  }>({
    isOpen: false,
    payoutId: null,
    previewData: null,
    isLoading: false,
  })

  // Edit NetSuite ID dialog state
  const [isEditNetSuiteIdDialogOpen, setIsEditNetSuiteIdDialogOpen] = useState(false)
  const [editingNetSuiteId, setEditingNetSuiteId] = useState('')
  const [selectedPayoutForEdit, setSelectedPayoutForEdit] = useState<Payout | null>(null)

  // --- Data fetching ---

  const fetchSavedPayouts = async () => {
    setIsLoadingSaved(true)
    try {
      console.log('[DEBUG] Frontend: Fetching /api/payouts...')
      const response = await fetch('/api/payouts')
      const data = await response.json()
      console.log('[DEBUG] Frontend: Response status:', response.status)
      console.log('[DEBUG] Frontend: Payouts array length:', data.payouts?.length || 0)

      if (response.ok) {
        setSavedPayouts(data.payouts || [])
        console.log(`Loaded ${data.payouts?.length || 0} saved payouts from database`)
      } else {
        console.error('Error fetching saved payouts:', data.error)
      }
    } catch (error) {
      console.error('Error fetching saved payouts:', error)
    } finally {
      setIsLoadingSaved(false)
    }
  }

  const checkPayoutDatabaseStatus = async (payoutsToCheck: Payout[]) => {
    try {
      const response = await fetch('/api/payouts')
      const data = await response.json()

      if (response.ok && data.payouts) {
        const savedPayoutsMap = new Map(data.payouts.map((p: any) => [String(p.id), p]))

        const updatedPayouts = payoutsToCheck.map(payout => {
          const savedPayout = savedPayoutsMap.get(String(payout.id))
          const isInDatabase = !!savedPayout

          console.log(`Payout ${payout.id}: ${isInDatabase ? 'IN DB' : 'NOT IN DB'}`)

          return {
            ...payout,
            inDatabase: isInDatabase,
            addedToDatabaseAt: (savedPayout as any)?.createdAt || undefined,
            netsuiteDepositNumber: (savedPayout as any)?.netsuiteDepositNumber || null,
            pushedToNsBy: (savedPayout as any)?.pushedToNsBy || null,
            pushedToNsAt: (savedPayout as any)?.pushedToNsAt || null,
          }
        })

        setPayouts(updatedPayouts)
      }
    } catch (error) {
      console.error('Error checking payout database status:', error)
    }
  }

  const importAllPayouts = async (fetchAll: boolean = false, maxPayouts?: number) => {
    console.log(`Starting ${fetchAll ? 'import ALL payouts' : 'import recent payouts'}...`)
    setIsLoading(true)
    try {
      let url = '/api/shopify/payouts'
      if (fetchAll) {
        url += '?all=true'
        if (maxPayouts) {
          url += `&limit=${maxPayouts}`
        }
      }

      console.log(`Fetching payouts from Shopify API... (${fetchAll ? 'paginated' : 'single page'})`)
      const response = await fetch(url)
      const data = await response.json()

      if (response.ok) {
        const fetchedPayouts = data.payouts || []
        console.log(`Fetched ${fetchedPayouts.length} payouts from Shopify`)
        setPayouts(fetchedPayouts)

        console.log('Checking database status...')
        await checkPayoutDatabaseStatus(fetchedPayouts)

        console.log('Saving new payouts to database...')
        await saveNewPayoutsOnly(fetchedPayouts)

        console.log('Import completed successfully!')
      } else {
        console.error('Error fetching payouts:', data.error)
        alert('Error fetching payouts: ' + (data.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Error fetching payouts:', error)
      alert('Error fetching payouts: ' + error)
    } finally {
      setIsLoading(false)
      console.log('Import process finished')
    }
  }

  const importPayoutById = async () => {
    const raw = payoutIdInput.trim()
    if (!raw) {
      alert('Please enter a payout ID or paste the Shopify payout URL')
      return
    }

    const urlMatch = raw.match(/\/payments\/payouts\/(\d+)/) || raw.match(/\/payouts\/(\d+)/)
    const payoutId = urlMatch ? urlMatch[1] : raw.replace(/\?.*$/, '').trim()

    console.log('[Payout import] Raw input:', raw, '| Extracted payout ID:', payoutId)

    if (!payoutId) {
      alert('Could not find a payout ID. Enter the ID (e.g. 129291944193) or paste the full Shopify payout URL.')
      return
    }

    setIsLoading(true)
    try {
      const url = `/api/shopify/payouts?payoutId=${encodeURIComponent(payoutId)}`
      console.log('[Payout import] Fetching:', url)
      const response = await fetch(url)
      const data = await response.json()
      if (response.ok) {
        const filteredPayouts = data.payouts || []
        console.log('[Payout import] Response OK. Payouts returned:', filteredPayouts.length, filteredPayouts.length ? `(id: ${filteredPayouts[0]?.id})` : '')
        if (filteredPayouts.length === 0) {
          alert(`No payout found with ID ${payoutId}. It may be older than the last 250 payouts.`)
          setPayouts([])
        } else {
          setPayouts(filteredPayouts)
          await checkPayoutDatabaseStatus(filteredPayouts)
          await saveNewPayoutsOnly(filteredPayouts)
          console.log('[Payout import] Import complete for payout', payoutId)
        }
      } else {
        console.error('[Payout import] API error:', response.status, data.error)
        alert('Error fetching payouts: ' + (data.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('[Payout import] Failed:', error)
      alert('Error fetching payouts: ' + error)
    } finally {
      setIsLoading(false)
    }
  }

  const importPayoutsByRange = async () => {
    const start = parseInt(payoutRangeStart.trim())
    const end = parseInt(payoutRangeEnd.trim())

    if (!payoutRangeStart.trim() || !payoutRangeEnd.trim()) {
      alert('Please enter both start and end values')
      return
    }

    if (isNaN(start) || isNaN(end)) {
      alert('Please enter valid numbers')
      return
    }

    if (start > end) {
      alert('Start number must be less than or equal to end number')
      return
    }

    const limit = end

    setIsLoading(true)
    try {
      console.log(`Importing the most recent ${limit} payouts (positions ${start}-${end})...`)

      const response = await fetch(`/api/shopify/payouts?limit=${limit}`)
      const data = await response.json()

      if (response.ok) {
        const fetchedPayouts = data.payouts || []
        console.log(`Fetched ${fetchedPayouts.length} payouts from Shopify`)

        if (fetchedPayouts.length === 0) {
          alert(`No payouts found`)
        } else {
          const rangePayouts = fetchedPayouts.slice(start - 1, end)

          await checkPayoutDatabaseStatus(rangePayouts)
          await saveNewPayoutsOnly(rangePayouts)

          setPayouts(rangePayouts)
          alert(`Successfully imported ${rangePayouts.length} payouts (positions ${start}-${end} of ${fetchedPayouts.length} total)`)
        }
      } else {
        console.error('Error fetching payouts:', data.error)
        alert(`Error fetching payouts: ${data.error}`)
      }
    } catch (error) {
      console.error('Error importing payouts by range:', error)
      alert('Error importing payouts by range: ' + error)
    } finally {
      setIsLoading(false)
    }
  }

  const saveNewPayoutsOnly = async (payoutsToSave: Payout[]) => {
    console.log('Checking existing payouts in database...')

    const response = await fetch('/api/payouts')
    const data = await response.json()
    const existingPayoutIds = new Set((data.payouts || []).map((p: any) => String(p.id)))

    console.log(`Database currently has ${existingPayoutIds.size} payouts`)
    console.log('Existing payout IDs:', Array.from(existingPayoutIds))

    const newPayouts = payoutsToSave.filter(payout => !existingPayoutIds.has(String(payout.id)))

    console.log(`Found ${newPayouts.length} new payouts to save out of ${payoutsToSave.length} total`)
    console.log('New payout IDs:', newPayouts.map(p => String(p.id)))

    const payoutsToProcess = payoutsToSave.length > 0 ? payoutsToSave : []

    if (payoutsToProcess.length === 0) {
      console.log('No payouts to process')
      return
    }

    for (const payout of payoutsToProcess) {
      console.log(`Processing payout ${payout.id}...`)
      try {
        console.log(`Fetching all transactions for payout ${payout.id} from Shopify...`)
        const fetchRes = await fetch(`/api/shopify/payouts/${payout.id}/transactions`)
        if (!fetchRes.ok) {
          console.error(`Failed to fetch transactions for payout ${payout.id}`)
          continue
        }

        const fetchData = await fetchRes.json()
        const allTransactions = fetchData.transactions || []

        console.log(`Total transactions fetched for payout ${payout.id}: ${allTransactions.length}`)

        if (allTransactions.length === 0) {
          console.warn(`No transactions found for payout ${payout.id}`)
          continue
        }

        console.log(`Saving ${allTransactions.length} transactions for payout ${payout.id}...`)
        const saveResponse = await fetch('/api/payouts/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payout, transactions: allTransactions }),
        })

        if (saveResponse.ok) {
          const saveData = await saveResponse.json()
          console.log(`Saved ${saveData.transactionsProcessed} transactions for payout ${payout.id}`)
        } else {
          const errorData = await saveResponse.json().catch(() => ({ error: 'Unknown' }))
          console.error(`Failed to save payout ${payout.id}:`, errorData)
        }
      } catch (error) {
        console.error(`Error processing payout ${payout.id}:`, error)
      }
    }

    await fetchSavedPayouts()
    await checkPayoutDatabaseStatus(payoutsToSave)
  }

  const fetchTransactions = async (payoutId: string) => {
    setIsLoadingTransactions(true)
    setSelectedPayoutId(payoutId)
    try {
      const response = await fetch(`/api/payouts/${payoutId}/transactions`)

      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text()
        console.error('Non-JSON response received:', text.substring(0, 200))
        throw new Error(`Server returned non-JSON response (${response.status} ${response.statusText}). The API route may not be found or there's a server error.`)
      }

      const data = await response.json()
      if (response.ok) {
        setSelectedPayoutTransactions(data.transactions || [])
        setSelectedPayoutTotalAmount(data.payoutTotalAmount ?? null)
        setSelectedPayoutCurrency(data.payoutCurrency || 'USD')
        setIsDialogOpen(true)
      } else {
        console.error('Error fetching transactions:', data)
        const errorMsg = data.error || 'Unknown error'
        const details = data.details ? `\n\nDetails: ${data.details}` : ''
        alert(`Error fetching transactions: ${errorMsg}${details}`)
      }
    } catch (error) {
      console.error('Error fetching transactions:', error)
      const errorMsg = error instanceof Error ? error.message : String(error)
      alert(`Error fetching transactions: ${errorMsg}`)
    } finally {
      setIsLoadingTransactions(false)
    }
  }

  // --- NetSuite deposit functions ---

  const pushToNetSuite = async (payoutId: string) => {
    setNetsuitePreviewDialog({
      isOpen: true,
      payoutId,
      previewData: null,
      isLoading: true,
    })

    try {
      const previewResponse = await fetch(`/api/payouts/${payoutId}/preview-deposit`)
      const previewData = await previewResponse.json()

      if (!previewResponse.ok || !previewData.success) {
        setNetsuitePreviewDialog({
          isOpen: false,
          payoutId: null,
          previewData: null,
          isLoading: false,
        })
        alert(`Cannot preview deposit:\n\n${JSON.stringify(previewData, null, 2)}`)
        return
      }

      console.log('NetSuite Deposit Preview:', {
        stats: previewData.stats,
        depositRequest: previewData.depositRequest,
      })
      console.log('JSON Body to be sent:', JSON.stringify(previewData.depositRequest, null, 2))

      setNetsuitePreviewDialog({
        isOpen: true,
        payoutId,
        previewData,
        isLoading: false,
      })
    } catch (error) {
      console.error('Error previewing deposit:', error)
      setNetsuitePreviewDialog({
        isOpen: false,
        payoutId: null,
        previewData: null,
        isLoading: false,
      })
      alert(`Error previewing deposit: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleCreateNetSuiteDeposit = async () => {
    if (!netsuitePreviewDialog.payoutId) return
    const payoutId = netsuitePreviewDialog.payoutId
    const apiUrl = `/api/payouts/${payoutId}/create-deposit`

    const savedName = typeof window !== 'undefined' ? localStorage.getItem('pirani_push_user') : null
    const pushedBy = window.prompt('Your name (for audit trail):', savedName || '')
    if (!pushedBy || !pushedBy.trim()) return
    localStorage.setItem('pirani_push_user', pushedBy.trim())

    setNetsuitePreviewDialog(prev => ({ ...prev, isLoading: true }))

    const callApi = async (body: any): Promise<any> => {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const text = await res.text()
      let data: any
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error(
          res.status === 504 || text.includes('timed out') || text.includes('An error o')
            ? `Request timed out (${res.status}). The chunk may be too large for the serverless function limit.`
            : `Server returned non-JSON response (${res.status}): ${text.slice(0, 150)}`
        )
      }
      if (!res.ok || !data.success) {
        const err = new Error(data.error || `HTTP ${res.status}`) as any
        err.debug = data.debug || null
        err.skipped = data.skipped || null
        throw err
      }
      return data
    }

    try {
      const result = await callApi({ pushedBy: pushedBy.trim() })
      setNetsuitePreviewDialog({ isOpen: false, payoutId: null, previewData: null, isLoading: false })

      if (result.message === 'Deposit already created') {
        alert(`Deposit already created: ${result.depositId}`)
      } else {
        let msg = `Successfully created NetSuite deposit!\n\nDeposit ID: ${result.depositId}\nTotal items: ${result.totalItems}`
        if (result.skipped?.length) {
          msg += `\n\n${result.skipped.length} transaction(s) skipped:`
          result.skipped.forEach((s: any) => { msg += `\n  ${s.tranid || s.id}: ${s.reason}` })
        }
        alert(msg)
      }
      fetchSavedPayouts()
    } catch (error: any) {
      console.error('Error creating NetSuite deposit:', error)
      setNetsuitePreviewDialog({ isOpen: false, payoutId: null, previewData: null, isLoading: false })
      let msg = `Error creating NetSuite deposit:\n\n${error?.message || 'Unknown error'}`
      if (error?.skipped?.length) {
        msg += `\n\n${error.skipped.length} transaction(s) were pre-filtered:`
        error.skipped.forEach((s: any) => { msg += `\n  ${s.tranid || s.id}: ${s.reason}` })
      }
      if (error?.debug) {
        const d = error.debug
        msg += `\n\n--- Debug Info ---`
        msg += `\nDate: ${d.trandate}`
        msg += `\nDeposit items (${d.depositItemCount}): ${(d.depositItemIds || []).join(', ')}`
        msg += `\nOther items: ${d.otherItemCount}`
      }
      alert(msg)
    }
  }

  const clearNetSuiteDepositId = async (payoutId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation()
    }

    if (!confirm(`Are you sure you want to clear the NetSuite Deposit ID for payout ${payoutId}? This will allow you to retest creating the deposit.`)) {
      return
    }

    try {
      const response = await fetch(`/api/payouts/${payoutId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ clearNetsuiteDepositId: true }),
      })

      const data = await response.json()

      if (response.ok) {
        console.log(`Successfully cleared NetSuite deposit ID:`, data.message)
        fetchSavedPayouts()
      } else {
        console.error('Failed to clear NetSuite deposit ID:', data.error)
        alert(`Failed to clear NetSuite deposit ID: ${data.error}`)
      }
    } catch (error) {
      console.error('Error clearing NetSuite deposit ID:', error)
      alert('Error clearing NetSuite deposit ID from database')
    }
  }

  const deletePayout = async (payoutId: string) => {
    if (!confirm(`Are you sure you want to delete payout ${payoutId} and all its transactions? This action cannot be undone!`)) {
      return
    }

    try {
      const response = await fetch(`/api/payouts/${payoutId}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (response.ok) {
        console.log(`Successfully deleted payout:`, data.message)
        alert(`Successfully deleted payout ${payoutId} and ${data.deletedTransactions} transactions`)

        setSavedPayouts(prev => prev.filter(p => p.id !== payoutId))
        setPayouts(prev => prev.filter(p => String(p.id) !== payoutId))
      } else {
        console.error('Failed to delete payout:', data.error)
        alert(`Failed to delete payout: ${data.error}`)
      }
    } catch (error) {
      console.error('Error deleting payout:', error)
      alert('Error deleting payout from database')
    }
  }

  // --- Edit NetSuite ID ---

  const openEditNetSuiteIdDialog = (payout: Payout) => {
    setSelectedPayoutForEdit(payout)
    setEditingNetSuiteId(payout.netsuiteDepositNumber || '')
    setIsEditNetSuiteIdDialogOpen(true)
  }

  const saveEditedNetSuiteId = async () => {
    if (!selectedPayoutForEdit || !editingNetSuiteId.trim()) return

    try {
      const endpoint = `/api/payouts/${selectedPayoutForEdit.id}/netsuite`

      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ netsuiteDepositNumber: editingNetSuiteId.trim() }),
      })

      const data = await response.json()

      if (response.ok) {
        setPayouts(prev => prev.map(payout =>
          payout.id === selectedPayoutForEdit.id
            ? { ...payout, netsuiteDepositNumber: editingNetSuiteId.trim() }
            : payout
        ))
        setSavedPayouts(prev => prev.map(p =>
          p.id === String(selectedPayoutForEdit.id)
            ? { ...p, netsuiteDepositNumber: editingNetSuiteId.trim() }
            : p
        ))

        console.log('NetSuite ID updated successfully:', data)
        alert('NetSuite ID updated successfully!')
        setIsEditNetSuiteIdDialogOpen(false)
        setEditingNetSuiteId('')
        setSelectedPayoutForEdit(null)
      } else {
        console.error('Error updating NetSuite ID:', data)
        alert('Error updating NetSuite ID: ' + (data.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Error updating NetSuite ID:', error)
      alert('Error updating NetSuite ID')
    }
  }

  // --- Effects ---

  useEffect(() => {
    fetchSavedPayouts()
  }, [])

  // --- Computed values ---

  // Combine saved payouts with fetched payouts for display
  const allPayouts = [...savedPayouts.map(p => ({
    id: p.id,
    date: p.date,
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    inDatabase: true,
    addedToDatabaseAt: p.date,
    netsuiteDepositNumber: p.netsuiteDepositNumber,
    netsuiteDepositId: p.netsuiteDepositId,
    pushedToNsBy: p.pushedToNsBy,
    pushedToNsAt: p.pushedToNsAt,
  })), ...payouts.filter(p => !p.inDatabase)]

  // Helper function to check if a payout has transactions with issues (missing cash sales, etc.)
  const hasMissingCashSale = (payout: typeof allPayouts[0]): boolean => {
    const savedPayout = savedPayouts.find(sp => String(sp.id) === String(payout.id))
    if (!savedPayout) return false

    const txns = savedPayout.transactions ?? []
    if (txns.length === 0) return false

    return txns.some((transaction: any) => {
      const hasOrderName = transaction.order_name &&
                          transaction.order_name !== '\u2014' &&
                          transaction.order_name !== 'N/A'
      const missingNetSuiteName = !transaction.netsuiteTransactionName ||
                                  transaction.netsuiteTransactionName === null ||
                                  transaction.netsuiteTransactionName === ''
      return hasOrderName && missingNetSuiteName
    })
  }

  // Filter payouts based on selected filters
  const filteredPayouts = allPayouts.filter(payout => {
    // Search filter
    if (payoutSearchTerm.trim()) {
      const searchLower = payoutSearchTerm.toLowerCase()
      const payoutId = String(payout.id).toLowerCase()
      const amount = String(payout.amount).toLowerCase()
      const currency = payout.currency.toLowerCase()

      if (!payoutId.includes(searchLower) &&
          !amount.includes(searchLower) &&
          !currency.includes(searchLower)) {
        return false
      }
    }

    // Status view toggle filter
    if (statusView === 'unpushed' && !!payout.netsuiteDepositNumber) return false
    if (statusView === 'pushed' && !payout.netsuiteDepositNumber) return false

    // NetSuite Status filter (from advanced filters dialog)
    if (!filters.netsuiteStatus.all) {
      const hasNetSuiteId = !!payout.netsuiteDepositNumber
      const matchesNetSuite = (filters.netsuiteStatus.pushed && hasNetSuiteId) ||
                             (filters.netsuiteStatus.not_pushed && !hasNetSuiteId)
      if (!matchesNetSuite) return false
    }

    // Payout Status filter
    if (!filters.payoutStatus.all) {
      const matchesStatus = (filters.payoutStatus.paid && payout.status === 'paid') ||
                           (filters.payoutStatus.pending && payout.status === 'pending')
      if (!matchesStatus) return false
    }

    // Date Range filter
    if (!filters.dateRange.all) {
      if (filters.dateRange.recent) {
        const payoutDate = new Date(payout.date)
        const thirtyDaysAgo = new Date()
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
        if (payoutDate < thirtyDaysAgo) return false
      }
    }

    return true
  })

  // Sort payouts
  const sortedPayouts = [...filteredPayouts].sort((a, b) => {
    let cmp = 0
    switch (sortField) {
      case 'id': cmp = String(a.id).localeCompare(String(b.id)); break
      case 'date': cmp = new Date(a.date).getTime() - new Date(b.date).getTime(); break
      case 'amount': cmp = Number(a.amount) - Number(b.amount); break
      case 'status': cmp = (a.status || '').localeCompare(b.status || ''); break
    }
    return sortDir === 'asc' ? cmp : -cmp
  })

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir(field === 'date' ? 'desc' : 'asc')
    }
  }

  const SortIcon = ({ field }: { field: typeof sortField }) => (
    <span className="ml-1 text-[10px]">
      {sortField === field ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
    </span>
  )

  // --- Render ---

  return (
    <div className="space-y-6">

      {/* Combined Payouts Management */}
            <Card>
              <CardContent className="pt-6">
                {/* Compact Controls */}
                <div className="flex flex-wrap items-center gap-4 mb-6 pb-4 border-b">
                  {/* Search Bar */}
                  <div className="flex items-center gap-3 flex-1 min-w-[300px]">
                    <Input
                      placeholder="Search payouts by ID, amount, or currency..."
                      value={payoutSearchTerm}
                      onChange={(e) => setPayoutSearchTerm(e.target.value)}
                      className="h-9 flex-1"
                    />
                  </div>

                  {/* Status View Toggle */}
                  <div className="flex items-center rounded-md border overflow-hidden">
                    {(['unpushed', 'all', 'pushed'] as const).map((view) => (
                      <button
                        key={view}
                        onClick={() => setStatusView(view)}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                          statusView === view
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-background text-muted-foreground hover:bg-muted'
                        } ${view !== 'unpushed' ? 'border-l' : ''}`}
                      >
                        {view === 'unpushed' ? 'Unpushed' : view === 'pushed' ? 'Pushed' : 'All'}
                      </button>
                    ))}
                  </div>

                  {/* Filter and Import Controls */}
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsPayoutFiltersOpen(true)}
                      className="h-9 flex items-center gap-2"
                    >
                      <Filter className="h-4 w-4" />
                      Filters
                    </Button>

                    <Button
                      onClick={() => importAllPayouts(false)}
                      disabled={isLoading}
                      className="flex items-center gap-2 h-9"
                      size="sm"
                    >
                      {isLoading ? <LoaderWithText text="Importing..." /> : (
                        <>
                          <Download className="h-4 w-4" />
                          Import Payouts
                        </>
                      )}
                    </Button>

                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Payout ID or paste URL"
                        value={payoutIdInput}
                        onChange={(e) => setPayoutIdInput(e.target.value)}
                        className="min-w-[200px] h-9"
                      />
                      <Button
                        onClick={importPayoutById}
                        disabled={isLoading || !payoutIdInput.trim()}
                        className="h-9"
                        size="sm"
                      >
                        Import
                      </Button>
                    </div>

                  </div>

                  {/* Results Count */}
                  <div className="text-sm text-muted-foreground">
                    {sortedPayouts.length} of {allPayouts.length}
                  </div>
                </div>

          {/* Payouts Display */}
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-20 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : allPayouts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No payouts found. Click &quot;Import All Payouts&quot; or &quot;Import by ID&quot; to get started.
            </div>
          ) : sortedPayouts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No payouts match the current filters. Try adjusting your filter criteria.
            </div>
          ) : (
            <div className="space-y-3">
              {/* Column Headers */}
              <div className="grid grid-cols-[200px_70px_100px_140px_1fr] items-center gap-4 px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <button onClick={() => toggleSort('id')} className="hover:text-foreground cursor-pointer flex items-center">
                  Payout ID<SortIcon field="id" />
                </button>
                <button onClick={() => toggleSort('status')} className="hover:text-foreground cursor-pointer flex items-center">
                  Status<SortIcon field="status" />
                </button>
                <button onClick={() => toggleSort('date')} className="hover:text-foreground cursor-pointer flex items-center">
                  Date<SortIcon field="date" />
                </button>
                <button onClick={() => toggleSort('amount')} className="hover:text-foreground cursor-pointer flex items-center">
                  Amount<SortIcon field="amount" />
                </button>
                <div className="text-right">Actions</div>
              </div>
              {sortedPayouts.map((payout) => (
                <Card key={payout.id} className="p-4">
                  <div className="grid grid-cols-[200px_70px_100px_140px_1fr] items-center gap-4">
                    {/* Payout ID */}
                    <div className="flex items-center space-x-2">
                      <h4 className="font-semibold text-sm truncate">
                        #{payout.id}
                      </h4>
                      <a
                        href={`https://admin.shopify.com/store/pirani-life/payments/payouts/${payout.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 text-xs flex-shrink-0"
                        title="View in Shopify"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                      {payout.netsuiteDepositId && (
                        <a
                          href={`https://7913744.app.netsuite.com/app/accounting/transactions/deposit.nl?id=${payout.netsuiteDepositId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-green-600 hover:text-green-800 text-xs flex-shrink-0"
                          title="View in NetSuite"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      )}
                    </div>

                    {/* Status */}
                    <span className={`px-2 py-1 rounded-full text-xs font-medium text-center w-fit ${
                      payout.status === 'paid'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {payout.status}
                    </span>

                    {/* Date */}
                    <div className="text-sm text-muted-foreground">
                      {safeToLocaleDateString(payout.date)}
                    </div>

                    {/* Amount */}
                    <div className="font-bold text-sm">
                      {hideSensitiveData ? (
                        <span className="text-gray-500">{"••••••"}</span>
                      ) : (
                        `${payout.currency} ${Number(payout.amount).toFixed(2)}`
                      )}
                    </div>

                    {/* Right side - Status badges and actions */}
                    <div className="flex items-center justify-end space-x-4">
                      {/* Status Badges */}
                      <div className="flex items-center space-x-2">
                        {payout.inDatabase && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            &#10003; In DB
                          </span>
                        )}
                        {payout.netsuiteDepositNumber && (
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => openEditNetSuiteIdDialog(payout)}
                              className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 hover:bg-blue-200 cursor-pointer transition-colors"
                              title="Click to edit NetSuite ID"
                            >
                              &#10003; NS: {payout.netsuiteDepositNumber}
                            </button>
                            <button
                              onClick={(e) => clearNetSuiteDepositId(String(payout.id), e)}
                              className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-600 hover:bg-red-200 cursor-pointer transition-colors"
                              title="Clear NetSuite Deposit ID (for testing)"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                        {payout.pushedToNsBy && (
                          <span className="text-xs text-muted-foreground" title={payout.pushedToNsAt ? new Date(payout.pushedToNsAt).toLocaleString() : ''}>
                            by {payout.pushedToNsBy}{payout.pushedToNsAt ? ` on ${new Date(payout.pushedToNsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                          </span>
                        )}
                        {payout.inDatabase && !payout.netsuiteDepositNumber && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                            Ready for NS
                          </span>
                        )}
                      </div>

                       {/* Actions */}
                       <div className="flex items-center space-x-2">
                         <Button
                           variant="outline"
                           size="sm"
                           onClick={() => fetchTransactions(String(payout.id))}
                           disabled={isLoadingTransactions}
                           className={`text-xs ${
                             hasMissingCashSale(payout)
                               ? 'border-red-500 bg-red-50 text-red-700 hover:bg-red-100 hover:border-red-600'
                               : ''
                           }`}
                         >
                           View Transactions
                         </Button>
                         {payout.inDatabase && !payout.netsuiteDepositNumber && (
                           <Button
                             size="sm"
                             onClick={() => pushToNetSuite(String(payout.id))}
                             className="bg-blue-600 hover:bg-blue-700 text-xs px-3"
                           >
                             Push to NS
                           </Button>
                         )}
                         {payout.inDatabase && (
                           <Button
                             variant="outline"
                             size="sm"
                             onClick={() => deletePayout(String(payout.id))}
                             className="text-xs border-red-300 text-red-600 hover:bg-red-50"
                           >
                             Delete
                           </Button>
                         )}
                       </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Transactions Dialog */}
          <TransactionsDialog
            key={selectedPayoutId || 'transactions-dialog'}
            isOpen={isDialogOpen}
            onClose={() => setIsDialogOpen(false)}
            payoutId={selectedPayoutId}
            transactions={selectedPayoutTransactions}
            payoutTotalAmount={selectedPayoutTotalAmount}
            payoutCurrency={selectedPayoutCurrency}
            isLoading={isLoadingTransactions}
            hideSensitiveData={hideSensitiveData}
            onRefreshTransactions={selectedPayoutId ? () => fetchTransactions(selectedPayoutId) : undefined}
          />
        </CardContent>
      </Card>

      {/* Payout Filters Dialog */}
      <Dialog open={isPayoutFiltersOpen} onOpenChange={setIsPayoutFiltersOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Filter content just for you</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 mb-3">NETSUITE STATUS</h3>
              <div className="grid grid-cols-3 gap-4">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.netsuiteStatus.all}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setFilters(prev => ({
                        ...prev,
                        netsuiteStatus: {
                          all: checked,
                          not_pushed: checked ? false : prev.netsuiteStatus.not_pushed,
                          pushed: checked ? false : prev.netsuiteStatus.pushed
                        }
                      }))
                    }}
                    className="w-4 h-4 rounded border-2 border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm">All NetSuite</span>
                </label>
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.netsuiteStatus.not_pushed}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setFilters(prev => ({
                        ...prev,
                        netsuiteStatus: {
                          all: false,
                          not_pushed: checked,
                          pushed: prev.netsuiteStatus.pushed
                        }
                      }))
                    }}
                    className="w-4 h-4 rounded border-2 border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm">Not Pushed</span>
                </label>
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.netsuiteStatus.pushed}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setFilters(prev => ({
                        ...prev,
                        netsuiteStatus: {
                          all: false,
                          not_pushed: prev.netsuiteStatus.not_pushed,
                          pushed: checked
                        }
                      }))
                    }}
                    className="w-4 h-4 rounded border-2 border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm">Pushed</span>
                </label>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 mb-3">PAYOUT STATUS</h3>
              <div className="grid grid-cols-3 gap-4">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.payoutStatus.all}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setFilters(prev => ({
                        ...prev,
                        payoutStatus: {
                          all: checked,
                          paid: checked ? false : prev.payoutStatus.paid,
                          pending: checked ? false : prev.payoutStatus.pending
                        }
                      }))
                    }}
                    className="w-4 h-4 rounded border-2 border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm">All Status</span>
                </label>
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.payoutStatus.paid}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setFilters(prev => ({
                        ...prev,
                        payoutStatus: {
                          all: false,
                          paid: checked,
                          pending: prev.payoutStatus.pending
                        }
                      }))
                    }}
                    className="w-4 h-4 rounded border-2 border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm">Paid</span>
                </label>
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.payoutStatus.pending}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setFilters(prev => ({
                        ...prev,
                        payoutStatus: {
                          all: false,
                          paid: prev.payoutStatus.paid,
                          pending: checked
                        }
                      }))
                    }}
                    className="w-4 h-4 rounded border-2 border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm">Pending</span>
                </label>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 mb-3">DATE RANGE</h3>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.dateRange.all}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setFilters(prev => ({
                        ...prev,
                        dateRange: {
                          all: checked,
                          recent: checked ? false : prev.dateRange.recent
                        }
                      }))
                    }}
                    className="w-4 h-4 rounded border-2 border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm">All Time</span>
                </label>
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.dateRange.recent}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setFilters(prev => ({
                        ...prev,
                        dateRange: {
                          all: false,
                          recent: checked
                        }
                      }))
                    }}
                    className="w-4 h-4 rounded border-2 border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm">Last 30 Days</span>
                </label>
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-6 border-t">
            <Button
              variant="ghost"
              onClick={() => setFilters({
                netsuiteStatus: { all: true, not_pushed: false, pushed: false },
                payoutStatus: { all: true, paid: false, pending: false },
                dateRange: { all: true, recent: false }
              })}
              className="text-slate-600"
            >
              Clear
            </Button>
            <Button
              onClick={() => setIsPayoutFiltersOpen(false)}
              className="bg-purple-600 hover:bg-purple-700"
            >
              Apply Filters
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* NetSuite Deposit Preview Dialog */}
      <Dialog
        open={netsuitePreviewDialog.isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setNetsuitePreviewDialog({
              isOpen: false,
              payoutId: null,
              previewData: null,
              isLoading: false,
            })
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              NetSuite Deposit Preview - Payout #{netsuitePreviewDialog.payoutId || ''}
            </DialogTitle>
          </DialogHeader>

          {/* Actions - Moved to top */}
          {netsuitePreviewDialog.previewData && !netsuitePreviewDialog.isLoading && (
            <div className="flex justify-end gap-2 pb-4 border-b">
              <Button
                variant="outline"
                onClick={() => {
                  setNetsuitePreviewDialog({
                    isOpen: false,
                    payoutId: null,
                    previewData: null,
                    isLoading: false,
                  })
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateNetSuiteDeposit}
                disabled={netsuitePreviewDialog.isLoading}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {netsuitePreviewDialog.isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Creating...
                  </>
                ) : (
                  'Create Deposit'
                )}
              </Button>
            </div>
          )}

          {netsuitePreviewDialog.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader />
            </div>
          ) : netsuitePreviewDialog.previewData ? (
            <div className="space-y-4">
              {/* Stats */}
              <div className="p-4 bg-gray-50 rounded-lg border">
                <h3 className="font-semibold mb-3">Summary</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Total Transactions</p>
                    <p className="text-lg font-semibold">{netsuitePreviewDialog.previewData.stats.totalTransactions}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Transactions with NS IDs</p>
                    <p className="text-lg font-semibold text-green-600">{netsuitePreviewDialog.previewData.stats.transactionsWithNS}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Deposit Items</p>
                    <p className="text-lg font-semibold">{netsuitePreviewDialog.previewData.stats.depositItemsCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Total Fees</p>
                    <p className="text-lg font-semibold text-red-600">
                      {netsuitePreviewDialog.previewData.stats.totalFees.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>

              {/* JSON Body */}
              <div>
                <h3 className="font-semibold mb-2">JSON Body to be sent to NetSuite</h3>
                <div className="bg-white border border-gray-200 p-4 rounded-lg overflow-x-auto">
                  <JsonView
                    value={netsuitePreviewDialog.previewData.depositRequest}
                    style={{
                      backgroundColor: 'transparent',
                      fontSize: '12px',
                    }}
                    collapsed={false}
                    displayDataTypes={false}
                    displayObjectSize={false}
                    enableClipboard={true}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Click arrows to expand/collapse sections. Also logged to browser console for easy copying
                </p>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Edit NetSuite ID Dialog */}
      <Dialog open={isEditNetSuiteIdDialogOpen} onOpenChange={setIsEditNetSuiteIdDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit NetSuite ID</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Payout</label>
              <p className="text-sm text-muted-foreground">
                #{selectedPayoutForEdit?.id}
              </p>
            </div>

            <div>
              <label className="text-sm font-medium">NetSuite Deposit ID</label>
              <Input
                placeholder="Enter NetSuite ID..."
                value={editingNetSuiteId}
                onChange={(e) => setEditingNetSuiteId(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setIsEditNetSuiteIdDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={saveEditedNetSuiteId}
              disabled={!editingNetSuiteId.trim()}
            >
              Update NetSuite ID
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
