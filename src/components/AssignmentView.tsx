import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Gift,
  ArrowLeft,
  CalendarBlank,
  MapPin,
  CurrencyDollar,
  Note,
  Shuffle,
  Download,
  Heart,
  PencilSimple,
  CircleNotch,
  Clock,
  Envelope,
  ArrowsClockwise,
  CheckCircle,
  Warning,
} from '@phosphor-icons/react'
import { Game, Participant } from '@/lib/types'
import { useLanguage } from './useLanguage'
import { formatDate } from '@/lib/game-utils'
import { formatAmount } from '@/lib/currency-utils'
import { generateICS, downloadICS } from '@/lib/calendar-utils'
import { EventCountdown } from './EventCountdown'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { LanguageToggle } from './LanguageToggle'
import { DarkModeToggle } from './DarkModeToggle'
import { updateWishAPI, updateGameAPI, checkApiStatus, updateParticipantEmailAPI, getGameAPI, confirmAssignmentAPI } from '@/lib/api'
import { requestReassignmentLocal, updateWishLocal, updateParticipantEmailLocal, confirmAssignmentLocal } from '@/lib/local-game-operations'

interface AssignmentViewProps {
  game: Game
  participant: Participant
  onUpdateGame: (game: Game) => void
  onBack: () => void
  emailConfigured?: boolean
}

export function AssignmentView({
  game,
  participant,
  onUpdateGame,
  onBack,
  emailConfigured = false
}: AssignmentViewProps) {
  const { t, language } = useLanguage()
  const [showReassignDialog, setShowReassignDialog] = useState(false)
  const [showEditWishDialog, setShowEditWishDialog] = useState(false)
  const [showWishChangeWarning, setShowWishChangeWarning] = useState(false)
  const [isRevealed, setIsRevealed] = useState(false)
  const [currentReceiver, setCurrentReceiver] = useState<Participant | null>(null)
  const [currentParticipant, setCurrentParticipant] = useState<Participant>(participant)
  const [editingWish, setEditingWish] = useState('')
  const [editingEmail, setEditingEmail] = useState('')
  const [isSavingWish, setIsSavingWish] = useState(false)
  const [isSavingEmail, setIsSavingEmail] = useState(false)
  const [isRequestingReassignment, setIsRequestingReassignment] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [giverHasConfirmed, setGiverHasConfirmed] = useState(false)
  const hasTriggeredConfettiRef = useRef(false)

  // Refresh game data from API
  const refreshGameData = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const apiStatus = await checkApiStatus()
      if (apiStatus.available && apiStatus.databaseConnected) {
        // For protected games, get token from sessionStorage
        const storedToken = sessionStorage.getItem(`participant-token-${game.code}`)
        // Pass participant token for protected games, or participant ID for non-protected games
        const freshGame = await getGameAPI(game.code, {
          participantToken: storedToken || undefined,
          participantId: !game.isProtected ? participant.id : undefined
        })
        // Ensure we update with the fresh game data
        if (freshGame) {
          onUpdateGame(freshGame)
        }
      }
    } catch (error) {
      // Log error for debugging but continue with cached data
      console.warn('Failed to refresh game data:', error)
    } finally {
      setIsRefreshing(false)
    }
  }, [game.code, game.isProtected, participant.id, onUpdateGame])



  useEffect(() => {
    // Defensive check: ensure participants array exists
    if (!game.participants) return
    
    const updatedParticipant = game.participants.find(p => p.id === participant.id)
    if (updatedParticipant) {
      setCurrentParticipant(updatedParticipant)
      setEditingEmail(updatedParticipant.email || '')
    }
  }, [game.participants, participant.id])

  // Update currentReceiver whenever game data changes
  useEffect(() => {
    // Defensive check: ensure participants and assignments arrays exist
    if (!game.participants || !game.assignments) return
    
    const currentAssignment = game.assignments.find(a => a.giverId === participant.id)
    const receiver = game.participants.find(p => p.id === currentAssignment?.receiverId)
    setCurrentReceiver(receiver || null)
    
    // Check if giver has confirmed from the game response flag (for protected games)
    // For non-protected games or when flag is not available, fall back to checking assignments
    const gameWithFlag = game as Game & { giverHasConfirmed?: boolean }
    if (gameWithFlag.giverHasConfirmed !== undefined) {
      setGiverHasConfirmed(gameWithFlag.giverHasConfirmed)
    } else {
      // Fallback: Find who gives to current participant (the giver) and check if they've confirmed
      const giverAssignment = game.assignments.find(a => a.receiverId === participant.id)
      const giver = game.participants.find(p => p.id === giverAssignment?.giverId)
      setGiverHasConfirmed(giver?.hasConfirmedAssignment || false)
    }
  }, [game, participant.id])

  useEffect(() => {
    const timer = setTimeout(() => setIsRevealed(true), 300)
    return () => clearTimeout(timer)
  }, [currentReceiver])

  useEffect(() => {
    hasTriggeredConfettiRef.current = false
  }, [game.code, participant.id])

  useEffect(() => {
    if (!isRevealed || !currentReceiver || hasTriggeredConfettiRef.current || typeof window === 'undefined') {
      return
    }

    const confettiStorageKey = `assignment-viewed-${game.code}-${participant.id}`

    if (window.localStorage.getItem(confettiStorageKey) === 'true') {
      return
    }

    hasTriggeredConfettiRef.current = true
    window.localStorage.setItem(confettiStorageKey, 'true')

    if (currentParticipant.hasConfirmedAssignment) {
      return
    }

    void import('canvas-confetti')
      .then(({ default: confetti }) => {
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.65 }
        })
      })
      .catch(() => {
        // Ignore confetti loading errors to avoid breaking assignment view
      })
  }, [isRevealed, currentReceiver, game.code, participant.id, currentParticipant.hasConfirmedAssignment])

  // Note: No mount-time refresh needed - game data is already loaded when entering this view
  // refreshGameData is available for manual refresh via the refresh button only

  const handleReassignment = async () => {
    if (!game.allowReassignment) {
      toast.error(t('reassignmentNotAllowed'))
      return
    }

    if (currentParticipant.hasPendingReassignmentRequest) {
      toast.error(t('reassignmentUsed'))
      return
    }

    setIsRequestingReassignment(true)
    
    try {
      const apiStatus = await checkApiStatus()
      if (apiStatus.available && apiStatus.databaseConnected) {
        // API is available - use it as the source of truth
        try {
          const updatedGame = await updateGameAPI(game.code, 'requestReassignment', participant.id, language)
          onUpdateGame(updatedGame)
        } catch {
          // API call failed - fall back to local operation
          const updatedGame = requestReassignmentLocal(game, participant.id)
          onUpdateGame(updatedGame)
        }
      } else {
        // API not available - apply local update
        const updatedGame = requestReassignmentLocal(game, participant.id)
        onUpdateGame(updatedGame)
      }
      setShowReassignDialog(false)
      toast.success(t('reassignmentSuccess'))
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to request reassignment'
      toast.error(message)
    } finally {
      setIsRequestingReassignment(false)
    }
  }

  const handleOpenEditWish = () => {
    // Load wish if participant has added one, otherwise use desiredGift from organizer
    setEditingWish(currentParticipant.wish || currentParticipant.desiredGift || '')
    
    // Show warning if giver has confirmed and there's an existing wish and email is configured
    if (giverHasConfirmed && emailConfigured && (currentParticipant.wish || currentParticipant.desiredGift)) {
      setShowWishChangeWarning(true)
    } else {
      setShowEditWishDialog(true)
    }
  }
  
  const handleProceedWithWishChange = () => {
    setShowWishChangeWarning(false)
    setShowEditWishDialog(true)
  }

  const handleSaveWish = async () => {
    setIsSavingWish(true)
    try {
      const apiStatus = await checkApiStatus()
      if (apiStatus.available && apiStatus.databaseConnected) {
        try {
          const updatedGame = await updateWishAPI(game.code, currentParticipant.id, editingWish.trim(), language)
          onUpdateGame(updatedGame)
        } catch {
          // API call failed - fall back to local operation
          const updatedGame = updateWishLocal(game, currentParticipant.id, editingWish.trim())
          onUpdateGame(updatedGame)
        }
      } else {
        // Fallback to local update
        const updatedGame = updateWishLocal(game, currentParticipant.id, editingWish.trim())
        onUpdateGame(updatedGame)
      }
      toast.success(t('wishSaved'))
      setShowEditWishDialog(false)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to save wish'
      toast.error(message)
    } finally {
      setIsSavingWish(false)
    }
  }

  const handleSaveEmailOnly = async () => {
    if (editingEmail.trim() === (currentParticipant.email || '')) {
      return // No change
    }
    setIsSavingEmail(true)
    try {
      const apiStatus = await checkApiStatus()
      if (apiStatus.available && apiStatus.databaseConnected) {
        try {
          const updatedGame = await updateParticipantEmailAPI(game.code, currentParticipant.id, editingEmail.trim(), language)
          onUpdateGame(updatedGame)
        } catch {
          // API call failed - fall back to local operation
          const updatedGame = updateParticipantEmailLocal(game, currentParticipant.id, editingEmail.trim())
          onUpdateGame(updatedGame)
        }
      } else {
        // Fallback to local update
        const updatedGame = updateParticipantEmailLocal(game, currentParticipant.id, editingEmail.trim())
        onUpdateGame(updatedGame)
      }
      toast.success(t('emailUpdated'))
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update email'
      toast.error(message)
    } finally {
      setIsSavingEmail(false)
    }
  }

  const handleConfirmAssignment = async () => {
    setIsConfirming(true)
    try {
      const apiStatus = await checkApiStatus()
      if (apiStatus.available && apiStatus.databaseConnected) {
        try {
          const updatedGame = await confirmAssignmentAPI(game.code, currentParticipant.id, language)
          onUpdateGame(updatedGame)
        } catch {
          // API call failed - fall back to local operation
          const updatedGame = confirmAssignmentLocal(game, currentParticipant.id)
          onUpdateGame(updatedGame)
        }
      } else {
        // Fallback to local update
        const updatedGame = confirmAssignmentLocal(game, currentParticipant.id)
        onUpdateGame(updatedGame)
      }
      toast.success(t('assignmentConfirmed'))
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to confirm assignment'
      toast.error(message)
    } finally {
      setIsConfirming(false)
    }
  }

  const handleDownloadCard = async () => {
    toast.loading(t('downloadingCard'))

    const canvas = document.createElement('canvas')
    canvas.width = 800
    canvas.height = 1100
    const ctx = canvas.getContext('2d')

    if (!ctx || !currentReceiver) return

    ctx.fillStyle = '#FEFAF5'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.fillStyle = '#8B2520'
    ctx.fillRect(0, 0, canvas.width, 80)

    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 36px Inter'
    ctx.textAlign = 'center'
    ctx.fillText(t('appName'), canvas.width / 2, 50)

    ctx.fillStyle = '#3D1B1A'
    ctx.font = 'bold 28px Inter'
    ctx.fillText(game.name, canvas.width / 2, 140)

    ctx.fillStyle = '#8B2520'
    ctx.font = '20px Inter'
    ctx.fillText(t('youGiftTo'), canvas.width / 2, 220)

    ctx.fillStyle = '#3D1B1A'
    ctx.font = 'bold 40px Inter'
    ctx.fillText(currentReceiver.name, canvas.width / 2, 280)

    // Get the gift wish (prefer wish, fallback to desiredGift)
    const giftWish = currentReceiver.wish || currentReceiver.desiredGift
    let detailsY = 380

    // Add receiver's gift wish if available
    if (giftWish) {
      ctx.fillStyle = '#E91E63'
      ctx.font = 'bold 18px Inter'
      ctx.fillText('🎁 ' + t('theirWish'), canvas.width / 2, 330)
      
      ctx.fillStyle = '#3D1B1A'
      ctx.font = 'italic 16px Inter'
      const wishText = giftWish
      const wishLines: string[] = []
      let wishLine = ''
      for (const word of wishText.split(' ')) {
        const testLine = wishLine + word + ' '
        const metrics = ctx.measureText(testLine)
        if (metrics.width > 600 && wishLine !== '') {
          wishLines.push(wishLine)
          wishLine = word + ' '
        } else {
          wishLine = testLine
        }
      }
      wishLines.push(wishLine)
      
      let wishY = 360
      for (const line of wishLines) {
        ctx.fillText(line, canvas.width / 2, wishY)
        wishY += 25
      }
      detailsY = wishY + 30
    }

    ctx.strokeStyle = '#D4C4B0'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(100, detailsY)
    ctx.lineTo(700, detailsY)
    ctx.stroke()

    ctx.fillStyle = '#665947'
    ctx.font = 'bold 18px Inter'
    ctx.textAlign = 'left'
    ctx.fillText(t('amount') + ':', 100, detailsY + 50)
    ctx.fillStyle = '#3D1B1A'
    ctx.font = '18px Inter'
    ctx.fillText(formatAmount(game.amount, game.currency, t('notSpecified')), 250, detailsY + 50)

    ctx.fillStyle = '#665947'
    ctx.font = 'bold 18px Inter'
    ctx.fillText(t('date') + ':', 100, detailsY + 90)
    ctx.fillStyle = '#3D1B1A'
    ctx.font = '18px Inter'
    ctx.fillText(formatDate(game.date, language) + (game.time ? ` - ${game.time}` : ''), 250, detailsY + 90)

    ctx.fillStyle = '#665947'
    ctx.font = 'bold 18px Inter'
    ctx.fillText(t('location') + ':', 100, detailsY + 130)
    ctx.fillStyle = '#3D1B1A'
    ctx.font = '18px Inter'
    ctx.fillText(game.location, 250, detailsY + 130)

    if (game.generalNotes) {
      ctx.fillStyle = '#665947'
      ctx.font = 'bold 18px Inter'
      ctx.textAlign = 'center'
      ctx.fillText(t('instructions') + ':', canvas.width / 2, detailsY + 200)

      ctx.fillStyle = '#3D1B1A'
      ctx.font = '16px Inter'
      const notes = game.generalNotes.split(' ')
      let noteLine = ''
      let noteY = detailsY + 235
      for (const word of notes) {
        const testLine = noteLine + word + ' '
        const metrics = ctx.measureText(testLine)
        if (metrics.width > 700 && noteLine !== '') {
          ctx.fillText(noteLine, canvas.width / 2, noteY)
          noteLine = word + ' '
          noteY += 25
        } else {
          noteLine = testLine
        }
      }
      ctx.fillText(noteLine, canvas.width / 2, noteY)
    }

    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ZavaGiftExchange-${game.code}.png`
      a.click()
      URL.revokeObjectURL(url)
      toast.dismiss()
      toast.success(t('cardDownloaded'))
    })
  }

  if (!currentReceiver) {
    return (
      <div className="min-h-screen bg-background">
        <header className="flex justify-between items-center p-4 border-b">
          <Button variant="ghost" onClick={onBack} className="gap-2">
            <ArrowLeft size={20} />
            {t('back')}
          </Button>
          <div className="flex items-center gap-2">
            <DarkModeToggle />
            <LanguageToggle />
          </div>
        </header>
        <div className="max-w-3xl mx-auto px-4 py-8">
          <Card className="p-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="bg-amber-100 p-4 rounded-full">
                <Clock size={48} weight="duotone" className="text-amber-600" />
              </div>
            </div>
            <h2 className="text-xl font-bold mb-2">{t('pendingAssignment')}</h2>
            <p className="text-muted-foreground">
              {t('pendingAssignmentDesc')}
            </p>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="flex justify-between items-center p-4 border-b">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft size={20} />
          {t('back')}
        </Button>
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={refreshGameData}
            disabled={isRefreshing}
            title={t('refreshData')}
          >
            <ArrowsClockwise size={20} className={isRefreshing ? 'animate-spin' : ''} />
          </Button>
          <DarkModeToggle />
          <LanguageToggle />
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="p-6 md:p-8 space-y-6">
            <div className="text-center space-y-2">
              <div className="flex justify-center">
                <div className="bg-secondary/20 p-4 rounded-full">
                  <Gift size={48} weight="duotone" className="text-secondary" />
                </div>
              </div>
              <h1 className="text-2xl font-display font-bold text-primary">
                {t('yourAssignment')}
              </h1>
              <Badge variant="outline" className="font-mono text-lg px-4 py-1">
                {game.code}
              </Badge>
            </div>

            <Separator />

            <motion.div
              initial={{ opacity: 0, filter: 'blur(10px)' }}
              animate={{
                opacity: isRevealed ? 1 : 0,
                filter: isRevealed ? 'blur(0px)' : 'blur(10px)'
              }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="text-center space-y-4 py-6"
            >
              <p className="text-lg text-muted-foreground">{t('youGiftTo')}</p>
              <h2 className="text-4xl font-display font-bold text-secondary">
                {currentReceiver.name}
              </h2>
              
              {/* Receiver's gift wish - show wish if available, otherwise desiredGift */}
              {(currentReceiver.wish || currentReceiver.desiredGift) ? (
                <div className="mt-4 p-4 bg-pink-50 border border-pink-200 rounded-lg">
                  <div className="flex items-center justify-center gap-2 text-pink-600 mb-2">
                    <Heart size={20} weight="fill" />
                    <span className="font-semibold">{t('theirWish')}</span>
                  </div>
                  <p className="text-pink-900 italic">"{currentReceiver.wish || currentReceiver.desiredGift}"</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">{t('noWishYet')}</p>
              )}

              {/* Reassignment button - shown only if allowed */}
              {game.allowReassignment && (
                <div className="mt-4">
                  {currentParticipant.hasPendingReassignmentRequest ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled
                      className="gap-2"
                    >
                      <Clock size={16} className="text-amber-500" />
                      {t('reassignmentPending')}
                    </Button>
                  ) : currentParticipant.hasConfirmedAssignment ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled
                      className="gap-2 opacity-50 cursor-not-allowed"
                      title={t('cannotReassignConfirmed')}
                    >
                      <Shuffle size={16} />
                      {t('requestReassignment')}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowReassignDialog(true)}
                      className="gap-2 border-amber-400 text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                    >
                      <Shuffle size={16} />
                      {t('requestReassignment')}
                    </Button>
                  )}
                </div>
              )}
            </motion.div>

            <Separator />

            {/* Your email section - only show if email service is configured */}
            {emailConfigured && (
              <>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Envelope size={20} className="text-blue-500" />
                      {t('yourEmail')}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="email"
                      value={editingEmail}
                      onChange={(e) => setEditingEmail(e.target.value)}
                      placeholder={t('yourEmailPlaceholder')}
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSaveEmailOnly}
                      disabled={isSavingEmail || editingEmail.trim() === (currentParticipant.email || '')}
                      className="gap-2 whitespace-nowrap"
                    >
                      {isSavingEmail && <CircleNotch size={16} className="animate-spin" />}
                      {t('saveChanges')}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('yourEmailDesc')}
                  </p>
                </div>

                <Separator />
              </>
            )}

            {/* Your own wish section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Heart size={20} className="text-pink-500" />
                  {t('yourWish')}
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleOpenEditWish}
                  className="gap-2"
                >
                  <PencilSimple size={16} />
                  {(currentParticipant.wish || currentParticipant.desiredGift) ? t('editWish') : t('addYourWish')}
                </Button>
              </div>
              {(currentParticipant.wish || currentParticipant.desiredGift) ? (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm italic">"{currentParticipant.wish || currentParticipant.desiredGift}"</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic p-3 bg-muted/30 rounded-lg">
                  {t('noWishAddedYet')}
                </p>
              )}
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Note size={20} className="text-primary" />
                {t('eventDetails')}
              </h3>

              <div className="grid gap-3">
                <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                  <CurrencyDollar size={24} className="text-accent shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {t('amount')}
                    </p>
                    <p className="text-base font-semibold">{formatAmount(game.amount, game.currency, t('notSpecified'))}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                  <CalendarBlank size={24} className="text-accent shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {t('date')}
                    </p>
                    <p className="text-base font-semibold">
                      {game.date ? `${formatDate(game.date, language)}${game.time ? ` - ${game.time}` : ''}` : t('notSpecified')}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                  <MapPin size={24} className="text-accent shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {t('location')}
                    </p>
                    <p className="text-base font-semibold">{game.location || t('notSpecified')}</p>
                  </div>
                </div>

                {game.generalNotes && (
                  <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                    <Note size={24} className="text-accent shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        {t('instructions')}
                      </p>
                      <p className="text-sm mt-1 whitespace-pre-wrap">
                        {game.generalNotes}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Countdown timer */}
              {game.date && (
                <EventCountdown
                  targetDate={game.date}
                  targetTime={game.time}
                  label={t('eventCountdown')}
                />
              )}

              {/* Add to Calendar button */}
              {game.date && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => {
                    const ics = generateICS({
                      name: game.name,
                      date: game.date,
                      time: game.time,
                      location: game.location,
                      assignedTo: currentReceiver?.name,
                      desiredGift: currentReceiver?.desiredGift,
                      wish: currentReceiver?.wish,
                      amount: game.amount,
                      currency: game.currency,
                      generalNotes: game.generalNotes,
                    })
                    downloadICS(ics, `${game.name.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 50) || 'event'}.ics`)
                  }}
                >
                  <CalendarBlank size={16} />
                  {t('addToCalendar')}
                </Button>
              )}
            </div>

            <div className="flex justify-between gap-3 pt-4">
              {/* Download button - left side, outline, only if confirmed */}
              <div>
                {currentParticipant.hasConfirmedAssignment && (
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={handleDownloadCard}
                    className="gap-2"
                  >
                    <Download size={20} />
                    {t('downloadCard')}
                  </Button>
                )}
              </div>

              {/* Confirm Assignment Button - right side, green */}
              <div>
                {!currentParticipant.hasConfirmedAssignment ? (
                  <Button
                    size="lg"
                    onClick={handleConfirmAssignment}
                    disabled={isConfirming}
                    className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                  >
                    {isConfirming ? (
                      <CircleNotch size={20} className="animate-spin" />
                    ) : (
                      <CheckCircle size={20} />
                    )}
                    {t('confirmAssignment')}
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="lg"
                    disabled
                    className="gap-2 bg-green-100 text-green-700"
                  >
                    <CheckCircle size={20} />
                    {t('assignmentConfirmed')}
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </motion.div>
      </div>

      <Dialog open={showReassignDialog} onOpenChange={setShowReassignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('requestReassignmentTitle')}</DialogTitle>
            <DialogDescription>
              {t('requestReassignmentDesc')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowReassignDialog(false)}
              disabled={isRequestingReassignment}
            >
              {t('cancel')}
            </Button>
            <Button onClick={handleReassignment} disabled={isRequestingReassignment} className="gap-2">
              {isRequestingReassignment && <CircleNotch size={16} className="animate-spin" />}
              {t('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditWishDialog} onOpenChange={setShowEditWishDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Heart size={24} className="text-pink-500" />
              {t('yourWish')}
            </DialogTitle>
            <DialogDescription>
              {t('wishDialogDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="wish-input">{t('yourWish')}</Label>
              <Textarea
                id="wish-input"
                value={editingWish}
                onChange={(e) => setEditingWish(e.target.value)}
                placeholder={t('yourWishPlaceholder')}
                rows={4}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowEditWishDialog(false)}
              disabled={isSavingWish}
            >
              {t('cancel')}
            </Button>
            <Button onClick={handleSaveWish} disabled={isSavingWish} className="gap-2">
              {isSavingWish && <CircleNotch size={16} className="animate-spin" />}
              {t('saveWish')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showWishChangeWarning} onOpenChange={setShowWishChangeWarning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Warning size={24} className="text-amber-500" />
              {t('wishChangeWarningTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('wishChangeWarningDesc')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowWishChangeWarning(false)}
            >
              {t('cancel')}
            </Button>
            <Button onClick={handleProceedWithWishChange} className="gap-2">
              {t('proceedWithChange')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
