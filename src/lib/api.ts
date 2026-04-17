import { Game } from './types'

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

// API health check configuration
const MAX_RETRY_DELAY_MS = 10000 // Maximum delay between retries

export interface ApiStatus {
  available: boolean
  databaseConnected: boolean
  databaseError: string | null
  emailConfigured: boolean
  emailError: string | null
}

/**
 * Check if the API is available and what mode it's running in
 * @param retries - Number of retries to attempt (default: 0 for regular checks, use higher for initial load)
 * @param retryDelay - Initial delay between retries in ms (will increase exponentially)
 * @returns ApiStatus object indicating availability, database connection, and email configuration
 *          - On success: available=true, with database and email status details
 *          - On failure after all retries: available=false, databaseConnected=false
 */
export async function checkApiStatus(retries = 0, retryDelay = 1000): Promise<ApiStatus> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Increase timeout for first attempt to accommodate cold starts
      const timeout = attempt === 0 ? 8000 : 5000
      
      const response = await fetch(`${API_BASE_URL}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(timeout)
      })
      
      const data = await response.json()
      
      // API is reachable - check database status
      // Health endpoint returns checks.database.status = 'ok' | 'error' | 'degraded' | 'not_configured'
      const databaseConnected = data.checks?.database?.status === 'ok'
      const databaseError = data.checks?.database?.error || null
      
      return {
        available: true,
        databaseConnected,
        databaseError,
        emailConfigured: data.checks?.email?.status === 'ok',
        emailError: data.checks?.email?.error || null
      }
    } catch {
      // If we have more retries left, wait before trying again
      if (attempt < retries) {
        // Exponential backoff: wait longer after each failed attempt
        // Cap delay to prevent excessive wait times
        const delay = Math.min(retryDelay * Math.pow(2, attempt), MAX_RETRY_DELAY_MS)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }
  
  // All retries failed - API is not reachable
  return { 
    available: false, 
    databaseConnected: false,
    databaseError: null,
    emailConfigured: false,
    emailError: null
  }
}

export interface CreateGameData {
  name: string
  amount: string
  currency: string
  date: string
  time?: string
  location: string
  allowReassignment: boolean
  isProtected?: boolean // When true, participants need unique tokens to access the game
  generalNotes: string
  organizerEmail?: string
  participants: Array<{ name: string; email?: string; desiredGift: string; wish: string }>
  sendEmails?: boolean
  language?: 'en' | 'es' | 'pt' | 'fr' | 'it' | 'ja' | 'ko' | 'zh' | 'de' | 'nl'
}

export interface CreateGameResponse extends Game {
  emailResults?: {
    organizerEmailSent: boolean
    participantEmailsSent: number
    participantEmailsFailed: number
  }
}

export async function createGameAPI(gameData: CreateGameData): Promise<CreateGameResponse> {
  const response = await fetch(`${API_BASE_URL}/games`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(gameData)
  })

  if (!response.ok) {
    throw new Error('Failed to create game')
  }

  return response.json()
}

export async function getGameAPI(code: string, options?: { participantToken?: string; organizerToken?: string; participantId?: string }): Promise<Game & { authenticatedParticipantId?: string; requiresToken?: boolean; giverHasConfirmed?: boolean }> {
  const params = new URLSearchParams()
  if (options?.participantToken) params.append('participantToken', options.participantToken)
  if (options?.organizerToken) params.append('organizerToken', options.organizerToken)
  if (options?.participantId) params.append('participantId', options.participantId)
  
  const url = `${API_BASE_URL}/games/${code}${params.toString() ? `?${params.toString()}` : ''}`
  const response = await fetch(url)

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to get game')
  }

  return response.json()
}

export async function updateGameAPI(
  code: string,
  action: 'requestReassignment',
  participantId: string,
  language?: 'en' | 'es' | 'pt' | 'fr' | 'it' | 'ja' | 'ko' | 'zh' | 'de' | 'nl'
): Promise<Game> {
  const response = await fetch(`${API_BASE_URL}/games/${code}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action,
      participantId,
      language
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to update game')
  }

  return response.json()
}

// Organizer API functions

export interface UpdateGameDetailsPayload {
  name?: string
  amount?: string
  currency?: string
  date?: string
  time?: string
  location?: string
  generalNotes?: string
  allowReassignment?: boolean
}

export async function updateGameDetailsAPI(
  code: string,
  organizerToken: string,
  details: UpdateGameDetailsPayload
): Promise<Game> {
  const response = await fetch(`${API_BASE_URL}/games/${code}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'updateGameDetails',
      organizerToken,
      ...details
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to update game details')
  }

  return response.json()
}

export async function addParticipantAPI(
  code: string,
  organizerToken: string,
  participantName: string,
  participantEmail?: string
): Promise<Game> {
  const response = await fetch(`${API_BASE_URL}/games/${code}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'addParticipant',
      organizerToken,
      participantName,
      participantEmail
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to add participant')
  }

  return response.json()
}

export async function removeParticipantAPI(
  code: string,
  organizerToken: string,
  participantId: string
): Promise<Game> {
  const response = await fetch(`${API_BASE_URL}/games/${code}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'removeParticipant',
      organizerToken,
      participantId
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to remove participant')
  }

  return response.json()
}

export async function updateWishAPI(
  code: string,
  participantId: string,
  wish: string,
  language?: 'en' | 'es' | 'pt' | 'fr' | 'it' | 'ja' | 'ko' | 'zh' | 'de' | 'nl'
): Promise<Game> {
  const response = await fetch(`${API_BASE_URL}/games/${code}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'updateWish',
      participantId,
      wish,
      language
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to update wish')
  }

  return response.json()
}

export async function updateParticipantEmailAPI(
  code: string,
  participantId: string,
  email: string,
  language?: 'en' | 'es' | 'pt' | 'fr' | 'it' | 'ja' | 'ko' | 'zh' | 'de' | 'nl'
): Promise<Game> {
  const response = await fetch(`${API_BASE_URL}/games/${code}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'updateParticipantEmail',
      participantId,
      email,
      language
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to update email')
  }

  return response.json()
}

export interface UpdateParticipantDetailsPayload {
  name?: string
  email?: string
  desiredGift?: string
  wish?: string
  hasConfirmedAssignment?: boolean
}

export async function updateParticipantDetailsAPI(
  code: string,
  organizerToken: string,
  participantId: string,
  details: UpdateParticipantDetailsPayload
): Promise<Game> {
  const response = await fetch(`${API_BASE_URL}/games/${code}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'updateParticipantDetails',
      organizerToken,
      participantId,
      ...details
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to update participant details')
  }

  return response.json()
}

export async function confirmAssignmentAPI(
  code: string,
  participantId: string,
  language?: 'en' | 'es' | 'pt' | 'fr' | 'it' | 'ja' | 'ko' | 'zh' | 'de' | 'nl'
): Promise<Game> {
  const response = await fetch(`${API_BASE_URL}/games/${code}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'confirmAssignment',
      participantId,
      language
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to confirm assignment')
  }

  return response.json()
}

export async function regenerateParticipantTokenAPI(
  code: string,
  organizerToken: string,
  participantId: string
): Promise<Game> {
  const response = await fetch(`${API_BASE_URL}/games/${code}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'regenerateToken',
      organizerToken,
      participantId
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to regenerate participant token')
  }

  return response.json()
}

export interface RegenerateOrganizerTokenResult {
  success: boolean
  message: string
  emailSent: boolean
}

export async function regenerateOrganizerTokenAPI(
  code: string,
  organizerToken: string,
  language: string = 'es'
): Promise<RegenerateOrganizerTokenResult> {
  const response = await fetch(`${API_BASE_URL}/games/${code}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'regenerateOrganizerToken',
      organizerToken,
      language
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to regenerate organizer token')
  }

  return response.json()
}

// Organizer reassignment functions

export async function approveReassignmentAPI(
  code: string,
  organizerToken: string,
  participantId: string
): Promise<Game> {
  const response = await fetch(`${API_BASE_URL}/games/${code}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'approveReassignment',
      organizerToken,
      participantId
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to approve reassignment')
  }

  return response.json()
}

export async function approveAllReassignmentsAPI(
  code: string,
  organizerToken: string
): Promise<Game> {
  const response = await fetch(`${API_BASE_URL}/games/${code}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'approveAllReassignments',
      organizerToken
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to approve all reassignments')
  }

  return response.json()
}

export async function reassignAllAPI(
  code: string,
  organizerToken: string
): Promise<Game> {
  const response = await fetch(`${API_BASE_URL}/games/${code}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'reassignAll',
      organizerToken
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to reassign all')
  }

  return response.json()
}

export async function forceReassignParticipantAPI(
  code: string,
  organizerToken: string,
  participantId: string
): Promise<Game> {
  const response = await fetch(`${API_BASE_URL}/games/${code}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'forceReassignParticipant',
      organizerToken,
      participantId
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to force reassign participant')
  }

  return response.json()
}

export async function cancelReassignmentRequestAPI(
  code: string,
  organizerToken: string,
  participantId: string
): Promise<Game> {
  const response = await fetch(`${API_BASE_URL}/games/${code}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'cancelReassignmentRequest',
      organizerToken,
      participantId
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to cancel reassignment request')
  }

  return response.json()
}

// Email API functions

export interface SendEmailResponse {
  success: boolean
  message?: string
  sent?: number
  failed?: number
  errors?: string[]
}

export async function sendOrganizerEmailAPI(
  code: string,
  organizerToken: string,
  language: 'en' | 'es' | 'pt' | 'fr' | 'it' | 'ja' | 'ko' | 'zh' | 'de' | 'nl' = 'es'
): Promise<SendEmailResponse> {
  const response = await fetch(`${API_BASE_URL}/email/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      code,
      type: 'organizer',
      organizerToken,
      language
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to send organizer email')
  }

  return response.json()
}

export async function sendParticipantEmailAPI(
  code: string,
  participantId: string,
  language: 'es' | 'en' = 'es'
): Promise<SendEmailResponse> {
  const response = await fetch(`${API_BASE_URL}/email/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      code,
      type: 'participant',
      participantId,
      language
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to send participant email')
  }

  return response.json()
}

export async function sendAllParticipantEmailsAPI(
  code: string,
  organizerToken: string,
  language: 'en' | 'es' | 'pt' | 'fr' | 'it' | 'ja' | 'ko' | 'zh' | 'de' | 'nl' = 'es'
): Promise<SendEmailResponse> {
  const response = await fetch(`${API_BASE_URL}/email/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      code,
      type: 'allParticipants',
      organizerToken,
      language
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to send participant emails')
  }

  return response.json()
}

export async function sendReminderEmailAPI(
  code: string,
  organizerToken: string,
  participantId: string,
  language: 'en' | 'es' | 'pt' | 'fr' | 'it' | 'ja' | 'ko' | 'zh' | 'de' | 'nl' = 'es',
  customMessage?: string
): Promise<SendEmailResponse> {
  const response = await fetch(`${API_BASE_URL}/email/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      code,
      type: 'reminder',
      organizerToken,
      participantId,
      language,
      customMessage
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to send reminder email')
  }

  return response.json()
}

export async function sendReminderToAllAPI(
  code: string,
  organizerToken: string,
  language: 'en' | 'es' | 'pt' | 'fr' | 'it' | 'ja' | 'ko' | 'zh' | 'de' | 'nl' = 'es',
  customMessage?: string
): Promise<SendEmailResponse> {
  const response = await fetch(`${API_BASE_URL}/email/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      code,
      type: 'reminderAll',
      organizerToken,
      language,
      customMessage
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to send reminder emails')
  }

  return response.json()
}

// Archive game API function (soft delete)

export interface ArchiveGameResponse {
  success: boolean
  message: string
  archivedCode: string
}

export async function archiveGameAPI(
  code: string,
  organizerToken: string
): Promise<ArchiveGameResponse> {
  const response = await fetch(`${API_BASE_URL}/games/${code}?organizerToken=${encodeURIComponent(organizerToken)}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json'
    }
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to archive game')
  }

  return response.json()
}

// Organizer link recovery - no auth required, email verification only
export interface RecoverOrganizerLinkResponse {
  success: boolean
  message: string
  code?: string  // Error code if applicable
}

export async function recoverOrganizerLinkAPI(
  code: string,
  email: string,
  language: 'en' | 'es' | 'pt' | 'fr' | 'it' | 'ja' | 'ko' | 'zh' | 'de' | 'nl' = 'es'
): Promise<RecoverOrganizerLinkResponse> {
  const response = await fetch(`${API_BASE_URL}/email/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      code,
      type: 'recoverOrganizerLink',
      email,
      language
    })
  })

  const data = await response.json()
  
  if (!response.ok) {
    return {
      success: false,
      message: data.message || data.error || 'Failed to recover link',
      code: data.code
    }
  }

  return {
    success: true,
    message: data.message || 'Recovery email sent if email matches'
  }
}
// Recover participant link via email
export async function recoverParticipantLinkAPI(
  code: string,
  email: string,
  language: 'en' | 'es' | 'pt' | 'fr' | 'it' | 'ja' | 'ko' | 'zh' | 'de' | 'nl' = 'es'
): Promise<RecoverOrganizerLinkResponse> {
  const response = await fetch(`${API_BASE_URL}/email/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      code,
      type: 'recoverParticipantLink',
      email,
      language
    })
  })

  const data = await response.json()
  
  if (!response.ok) {
    return {
      success: false,
      message: data.message || data.error || 'Failed to recover link',
      code: data.code
    }
  }

  return {
    success: true,
    message: data.message || 'Recovery email sent if email matches'
  }
}