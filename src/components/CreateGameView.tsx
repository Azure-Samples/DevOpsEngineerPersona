import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowLeft, ArrowRight, Gift, Users, X, UserPlus, Envelope, CircleNotch, ShieldCheck, Warning, Info } from '@phosphor-icons/react'
import { generateGameCode, generateId, generateAssignments, isValidDate } from '@/lib/game-utils'
import { isValidEmail } from '@/lib/utils'
import { Game, Participant, CURRENCIES } from '@/lib/types'
import { createGameAPI, CreateGameResponse, checkApiStatus } from '@/lib/api'
import { useLanguage } from './useLanguage'
import { LanguageToggle } from './LanguageToggle'
import { DarkModeToggle } from './DarkModeToggle'
import { toast } from 'sonner'

interface CreateGameViewProps {
  onGameCreated: (game: Game, emailResults?: CreateGameResponse['emailResults']) => void
  onBack: () => void
  emailConfigured?: boolean
}

export function CreateGameView({ onGameCreated, onBack, emailConfigured = false }: CreateGameViewProps) {
  const [step, setStep] = useState(1)
  const { t, language } = useLanguage()
  const [isCreating, setIsCreating] = useState(false)

  const [eventName, setEventName] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [location, setLocation] = useState('')

  const [participantInput, setParticipantInput] = useState('')
  const [participantEmailInput, setParticipantEmailInput] = useState('')
  const [desiredGiftInput, setDesiredGiftInput] = useState('')
  const [participants, setParticipants] = useState<{ name: string; email?: string; desiredGift: string }[]>([])
  
  // Refs for input focus management
  const nameInputRef = useRef<HTMLInputElement>(null)
  const emailInputRef = useRef<HTMLInputElement>(null)
  const giftInputRef = useRef<HTMLInputElement>(null)

  const [allowReassignment, setAllowReassignment] = useState(true)
  const [isProtected, setIsProtected] = useState(true) // Enabled by default
  const [generalNotes, setGeneralNotes] = useState('')
  const [organizerEmail, setOrganizerEmail] = useState('')
  const [sendEmailsOnCreate, setSendEmailsOnCreate] = useState(true)

  // Focus on name input when step 2 is shown
  useEffect(() => {
    if (step === 2 && nameInputRef.current) {
      nameInputRef.current.focus()
    }
  }, [step])

  const addParticipant = () => {
    const name = participantInput.trim()
    const email = participantEmailInput.trim() || undefined
    
    // Check for duplicate names (case-insensitive)
    if (!name || participants.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      return
    }
    
    // Validate email format
    if (email && !isValidEmail(email)) {
      toast.error(t('invalidEmailFormat'))
      return
    }
    
    // Check for duplicate emails (case-insensitive)
    if (email && participants.some(p => p.email?.toLowerCase() === email.toLowerCase())) {
      toast.error(t('emailAlreadyExists'))
      return
    }
    
    setParticipants([...participants, { name, email, desiredGift: desiredGiftInput.trim() }])
    setParticipantInput('')
    setParticipantEmailInput('')
    setDesiredGiftInput('')
    // Focus back on name input for adding another participant
    setTimeout(() => nameInputRef.current?.focus(), 0)
  }

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab' && !e.shiftKey && participantInput.trim()) {
      e.preventDefault()
      // If email is configured, go to email field; otherwise go directly to gift field
      if (emailConfigured) {
        emailInputRef.current?.focus()
      } else {
        giftInputRef.current?.focus()
      }
    } else if (e.key === 'Enter' && participantInput.trim()) {
      e.preventDefault()
      addParticipant()
    }
  }

  const handleEmailKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault()
      giftInputRef.current?.focus()
    } else if (e.key === 'Enter' && participantInput.trim()) {
      e.preventDefault()
      addParticipant()
    }
  }

  const handleGiftKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Tab' || e.key === 'Enter') && participantInput.trim()) {
      e.preventDefault()
      addParticipant()
    }
  }

  const removeParticipant = (index: number) => {
    setParticipants(participants.filter((_, i) => i !== index))
  }

  const canProceedStep1 = eventName.trim() && amount.trim() && date && isValidDate(date) && location.trim()
  const canProceedStep2 = participants.length >= 3

  // Helper function to create game locally (demo mode)
  const createGameLocally = () => {
    console.log('📦 Creating game locally (demo mode)')
    
    const gameCode = generateGameCode()
    const organizerToken = generateId()

    const gameParticipants: Participant[] = participants.map(p => ({
      id: generateId(),
      name: p.name,
      email: p.email,
      desiredGift: p.desiredGift,
      wish: '',
      hasConfirmedAssignment: false,
      hasPendingReassignmentRequest: false,
      token: isProtected ? generateId() : undefined
    }))

    const assignments = generateAssignments(gameParticipants)

    const game: Game = {
      id: generateId(),
      code: gameCode,
      name: eventName,
      amount,
      currency,
      date,
      time: time || undefined,
      location,
      allowReassignment,
      isProtected,
      generalNotes,
      participants: gameParticipants,
      assignments,
      organizerToken,
      reassignmentRequests: [],
      createdAt: Date.now()
    }

    toast.info(t('gameCreatedLocally'))
    onGameCreated(game)
  }

  const handleFinish = async () => {
    setIsCreating(true)

    // Check API and database status first
    const apiStatus = await checkApiStatus()
    
    // If API is unavailable OR database is not connected, create locally
    if (!apiStatus.available || !apiStatus.databaseConnected) {
      console.warn('API or database unavailable, creating game locally')
      createGameLocally()
      setIsCreating(false)
      return
    }

    // Try to create the game via API
    try {
      const apiResponse = await createGameAPI({
        name: eventName,
        amount,
        currency,
        date,
        time: time || undefined,
        location,
        allowReassignment,
        isProtected,
        generalNotes,
        organizerEmail: organizerEmail.trim() || undefined,
        participants: participants.map(p => ({
          name: p.name,
          email: p.email,
          desiredGift: p.desiredGift,
          wish: ''
        })),
        sendEmails: sendEmailsOnCreate && (!!organizerEmail.trim() || participants.some(p => p.email)),
        language
      })

      // Show email notification results
      if (apiResponse.emailResults) {
        const { organizerEmailSent, participantEmailsSent, participantEmailsFailed } = apiResponse.emailResults
        if (organizerEmailSent) {
          toast.success(t('emailSentToOrganizer'))
        }
        if (participantEmailsSent > 0) {
          toast.success(t('emailsSentToParticipants').replace('{count}', String(participantEmailsSent)))
        }
        if (participantEmailsFailed > 0) {
          toast.error(t('emailsFailed').replace('{count}', String(participantEmailsFailed)))
        }
      }

      onGameCreated(apiResponse, apiResponse.emailResults)
    } catch {
      // If API call fails, fall back to local creation
      console.warn('API call failed, creating game locally')
      createGameLocally()
    } finally {
      setIsCreating(false)
    }
  }

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

      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-display font-bold text-primary">
              {t('createGame')}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex-1 flex items-center gap-2">
                <div
                  className={`flex-1 h-2 rounded-full transition-colors ${
                    s <= step ? 'bg-primary' : 'bg-muted'
                  }`}
                />
                {s < 3 && <div className="w-2 h-2 rounded-full bg-muted" />}
              </div>
            ))}
          </div>

          <p className="mt-3 text-sm text-muted-foreground font-medium">
            {step === 1 && t('step1')}
            {step === 2 && t('step2')}
            {step === 3 && t('step3')}
          </p>
        </div>

        {step === 1 && (
          <Card className="p-6 md:p-8 space-y-6">
            <div className="space-y-2">
              <Label htmlFor="event-name">{t('eventName')}</Label>
              <Input
                id="event-name"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder={t('eventNamePlaceholder')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">{t('giftAmount')}</Label>
              <div className="flex gap-2">
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="w-[180px]" aria-label={t('selectCurrency')}>
                    <SelectValue placeholder={t('selectCurrency')} />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((curr) => (
                      <SelectItem key={curr.code} value={curr.code}>
                        <span className="flex items-center gap-2">
                          <span>{curr.flag}</span>
                          <span>{curr.code}</span>
                          <span className="text-muted-foreground">({curr.symbol})</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  id="amount"
                  type="number"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={t('giftAmountPlaceholder')}
                  className="flex-1"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">{t('eventDate')}</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className={date && !isValidDate(date) ? 'border-red-500' : ''}
              />
              {date && !isValidDate(date) && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <Warning size={14} />
                  {t('invalidDate')}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="time">{t('eventTime')}</Label>
              <Input
                id="time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">{t('eventLocation')}</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={t('eventLocationPlaceholder')}
              />
            </div>

            {emailConfigured && (
              <div className="space-y-2">
                <Label htmlFor="organizer-email" className="flex items-center gap-2">
                  <Envelope size={16} />
                  {t('organizerEmail')}
                </Label>
                <Input
                  id="organizer-email"
                  type="email"
                  value={organizerEmail}
                  onChange={(e) => setOrganizerEmail(e.target.value)}
                  placeholder={t('organizerEmailPlaceholder')}
                />
                <p className="text-xs text-muted-foreground">
                  {t('organizerEmailDesc')}
                </p>
              </div>
            )}

            <Button
              size="lg"
              className="w-full gap-2"
              onClick={() => setStep(2)}
              disabled={!canProceedStep1}
            >
              {t('next')}
              <ArrowRight size={20} />
            </Button>
          </Card>
        )}

        {step === 2 && (
          <Card className="p-6 md:p-8 space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Users size={24} className="text-primary" />
                <h2 className="text-xl font-semibold">{t('participants')}</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                {t('participantsDesc')}
              </p>
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-900 flex items-start gap-2">
                  <Info size={18} className="text-blue-600 shrink-0 mt-0.5" weight="duotone" />
                  <span>{t('organizerNote')}</span>
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <div className="relative">
                  <Input
                    ref={nameInputRef}
                    value={participantInput}
                    onChange={(e) => setParticipantInput(e.target.value)}
                    placeholder={t('participantNamePlaceholder')}
                    onKeyDown={handleNameKeyDown}
                    className={participantInput.trim() ? 'pr-32' : ''}
                  />
                  {participantInput.trim() && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground bg-background px-1">
                      {emailConfigured ? t('tabToAddEmail') : t('tabToAddGift')}
                    </span>
                  )}
                </div>
                {emailConfigured && (
                  <div className="relative">
                    <Input
                      ref={emailInputRef}
                      type="email"
                      value={participantEmailInput}
                      onChange={(e) => setParticipantEmailInput(e.target.value)}
                      placeholder={t('participantEmailPlaceholder')}
                      onKeyDown={handleEmailKeyDown}
                      className={!participantEmailInput ? '' : 'pr-32'}
                    />
                    {!participantEmailInput && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground bg-background px-1 pointer-events-none">
                        {t('participantEmailOptional')}
                      </span>
                    )}
                  </div>
                )}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      ref={giftInputRef}
                      value={desiredGiftInput}
                      onChange={(e) => setDesiredGiftInput(e.target.value)}
                      placeholder={t('desiredGiftPlaceholder')}
                      onKeyDown={handleGiftKeyDown}
                      className={participantInput.trim() ? 'pr-36' : ''}
                    />
                    {participantInput.trim() && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground bg-background px-1">
                        {participants.length >= 2 ? t('tabToFinish') : t('tabToAddAnother')}
                      </span>
                    )}
                  </div>
                  <Button onClick={addParticipant} className="gap-2 shrink-0" disabled={!participantInput.trim()}>
                    <UserPlus size={20} />
                    {t('addParticipant')}
                  </Button>
                </div>
              </div>

              {participants.length > 0 && (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {participants.map((participant, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-muted rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{participant.name}</span>
                        {emailConfigured && participant.email && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Envelope size={12} /> {participant.email}
                          </p>
                        )}
                        {participant.desiredGift && (
                          <p className="text-sm text-muted-foreground truncate">
                            🎁 {participant.desiredGift}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeParticipant(index)}
                        aria-label={`${t('removeParticipant')} ${participant.name}`}
                      >
                        <X size={16} />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {participants.length < 3 && (
                <p className="text-sm text-muted-foreground">
                  {t('minParticipants')} ({participants.length}/3)
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                size="lg"
                onClick={() => setStep(1)}
                className="gap-2"
              >
                <ArrowLeft size={20} />
                {t('back')}
              </Button>
              <Button
                size="lg"
                className="flex-1 gap-2"
                onClick={() => setStep(3)}
                disabled={!canProceedStep2}
              >
                {t('next')}
                <ArrowRight size={20} />
              </Button>
            </div>
          </Card>
        )}

        {step === 3 && (
          <Card className="p-6 md:p-8 space-y-6">
            <div className="flex items-center gap-4 p-4 bg-primary/5 border border-primary/20 rounded-lg">
              <Switch
                id="protected"
                checked={isProtected}
                onCheckedChange={setIsProtected}
              />
              <div className="flex-1">
                <Label htmlFor="protected" className="text-base font-semibold cursor-pointer flex items-center gap-2">
                  <ShieldCheck size={18} className="text-primary" />
                  {t('protectParticipants')}
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('protectParticipantsDesc')}
                </p>
                {isProtected && (
                  <p className="text-sm text-amber-600 mt-2 flex items-center gap-1">
                    <Warning size={16} />
                    {t('protectParticipantsWarning')}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
              <Switch
                id="reassignment"
                checked={allowReassignment}
                onCheckedChange={setAllowReassignment}
              />
              <div className="flex-1">
                <Label htmlFor="reassignment" className="text-base font-semibold cursor-pointer">
                  {t('allowReassignment')}
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('allowReassignmentDesc')}
                </p>
              </div>
            </div>

            {emailConfigured && (organizerEmail || participants.some(p => p.email)) && (
              <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                <Switch
                  id="send-emails"
                  checked={sendEmailsOnCreate}
                  onCheckedChange={setSendEmailsOnCreate}
                />
                <div className="flex-1">
                  <Label htmlFor="send-emails" className="text-base font-semibold cursor-pointer flex items-center gap-2">
                    <Envelope size={18} />
                    {t('sendEmailNotifications')}
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('sendEmailNotificationsDesc')}
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">{t('generalNotes')}</Label>
              <Textarea
                id="notes"
                value={generalNotes}
                onChange={(e) => setGeneralNotes(e.target.value)}
                placeholder={t('generalNotesPlaceholder')}
                rows={4}
              />
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                size="lg"
                onClick={() => setStep(2)}
                className="gap-2"
                disabled={isCreating}
              >
                <ArrowLeft size={20} />
                {t('back')}
              </Button>
              <Button
                size="lg"
                className="flex-1 gap-2"
                onClick={handleFinish}
                disabled={isCreating}
              >
                {isCreating ? (
                  <>
                    <CircleNotch size={20} className="animate-spin" />
                    {t('creating')}
                  </>
                ) : (
                  <>
                    <Gift size={20} weight="bold" />
                    {t('finish')}
                  </>
                )}
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
