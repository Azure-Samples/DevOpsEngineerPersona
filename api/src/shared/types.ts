// Supported languages for email notifications
export type Language = 'en' | 'es' | 'pt' | 'fr' | 'it' | 'ja' | 'zh' | 'de' | 'nl' | 'vi'

// Input length limits to prevent abuse and stay within Cosmos DB 2MB item limit
export const INPUT_LIMITS = {
  GAME_NAME: 100,
  PARTICIPANT_NAME: 80,
  LOCATION: 200,
  AMOUNT: 20,
  CURRENCY: 10,
  GENERAL_NOTES: 2000,
  DESIRED_GIFT: 500,
  WISH: 500,
  EMAIL: 254,
  MAX_PARTICIPANTS: 100,
} as const

/**
 * Validates that a string does not exceed the specified max length.
 * Returns an error message if invalid, or null if valid.
 */
export function validateLength(field: string, value: string | undefined, maxLength: number): string | null {
  if (value && value.length > maxLength) {
    return `${field} must be ${maxLength} characters or less (got ${value.length})`
  }
  return null
}

export interface Participant {
  id: string
  name: string
  email?: string // Optional email for participant notifications
  desiredGift: string
  wish: string
  hasConfirmedAssignment: boolean // Participant has confirmed they received their assignment
  hasPendingReassignmentRequest: boolean
  token?: string // Unique token for protected games
  preferredLanguage?: Language // Preferred language for email notifications (only stored when email service is configured)
}

export interface Assignment {
  giverId: string
  receiverId: string
}

// Pair of participant IDs that should never be assigned to give to each other
export interface ExclusionPair {
  participantId1: string
  participantId2: string
}

export interface ReassignmentRequest {
  participantId: string
  participantName: string
  requestedAt: number
}

export interface Game {
  id: string
  code: string
  name: string
  amount: string
  currency: string
  date: string
  time?: string // Optional time for the event
  location: string
  allowReassignment: boolean
  isProtected: boolean // When true, participants need unique tokens to access the game
  generalNotes: string
  participants: Participant[]
  assignments: Assignment[]
  reassignmentRequests: ReassignmentRequest[]
  exclusions?: ExclusionPair[] // Pairs that should never be assigned to each other
  organizerToken: string
  organizerEmail?: string // Optional email for organizer notifications
  organizerLanguage?: Language // Preferred language for organizer email notifications (only stored when email service is configured)
  invitationToken?: string // Token for invitation link to allow new participants to join
  createdAt: number // Unix timestamp in milliseconds since epoch when the game was created (Date.now())
  isArchived?: boolean // When true, the game has been soft-deleted/archived
  archivedAt?: number // Unix timestamp in milliseconds since epoch when the game was archived (Date.now())
}

// Organizer action types
export type OrganizerAction = 
  | 'updateGameDetails'
  | 'addParticipant'
  | 'removeParticipant'
  | 'updateParticipantDetails'
  | 'approveReassignment'
  | 'approveAllReassignments'
  | 'reassignAll'
  | 'cancelReassignmentRequest'
  | 'regenerateOrganizerToken'
  | 'forceReassignParticipant'

export interface UpdateGameDetailsPayload {
  action: 'updateGameDetails'
  organizerToken: string
  name?: string
  amount?: string
  currency?: string
  date?: string
  time?: string
  location?: string
  generalNotes?: string
  allowReassignment?: boolean
}

export interface AddParticipantPayload {
  action: 'addParticipant'
  organizerToken: string
  participantName: string
  participantEmail?: string
}

export interface RemoveParticipantPayload {
  action: 'removeParticipant'
  organizerToken: string
  participantId: string
}

export interface UpdateParticipantDetailsPayload {
  action: 'updateParticipantDetails'
  organizerToken: string
  participantId: string
  name?: string
  email?: string
  desiredGift?: string
  wish?: string
  hasConfirmedAssignment?: boolean
}

export interface ApproveReassignmentPayload {
  action: 'approveReassignment'
  organizerToken: string
  participantId: string
}

export interface ReassignAllPayload {
  action: 'reassignAll'
  organizerToken: string
}

export interface ApproveAllReassignmentsPayload {
  action: 'approveAllReassignments'
  organizerToken: string
}

export interface CancelReassignmentRequestPayload {
  action: 'cancelReassignmentRequest'
  organizerToken: string
  participantId: string
}

export interface RegenerateTokenPayload {
  action: 'regenerateToken'
  organizerToken: string
  participantId: string
}

export interface RegenerateOrganizerTokenPayload {
  action: 'regenerateOrganizerToken'
  organizerToken: string
}

export interface ForceReassignParticipantPayload {
  action: 'forceReassignParticipant'
  organizerToken: string
  participantId: string
}

// Participant action types
export interface RequestReassignmentPayload {
  action: 'requestReassignment'
  participantId: string
}

export interface UpdateWishPayload {
  action: 'updateWish'
  participantId: string
  wish: string
}

export interface UpdateParticipantEmailPayload {
  action: 'updateParticipantEmail'
  participantId: string
  email: string
}

export interface ConfirmAssignmentPayload {
  action: 'confirmAssignment'
  participantId: string
}

// Join via invitation action type
export interface JoinInvitationPayload {
  action: 'joinInvitation'
  invitationToken: string
  participantName: string
  participantEmail?: string
  desiredGift?: string
  wish?: string
  language?: Language
}

// Create game request types
export interface CreateGameParticipant {
  name: string
  email?: string
  desiredGift?: string
  wish?: string
}

export interface CreateGamePayload {
  name: string
  amount?: string
  currency?: string
  date?: string
  time?: string
  location?: string
  allowReassignment?: boolean
  isProtected?: boolean
  generalNotes?: string
  organizerEmail?: string
  participants: CreateGameParticipant[]
  exclusions?: ExclusionPair[]
  sendEmails?: boolean
  language?: Language
}

export type GameUpdatePayload = 
  | UpdateGameDetailsPayload 
  | AddParticipantPayload 
  | RemoveParticipantPayload
  | UpdateParticipantDetailsPayload
  | ApproveReassignmentPayload
  | ApproveAllReassignmentsPayload
  | ReassignAllPayload
  | CancelReassignmentRequestPayload
  | RegenerateTokenPayload
  | RegenerateOrganizerTokenPayload
  | ForceReassignParticipantPayload
  | RequestReassignmentPayload
  | UpdateWishPayload
  | UpdateParticipantEmailPayload
  | ConfirmAssignmentPayload
  | JoinInvitationPayload

export type SendEmailType = 'organizer' | 'participant' | 'allParticipants' | 'reminder' | 'reminderAll' | 'recoverOrganizerLink' | 'recoverParticipantLink'

export interface SendEmailPayload {
  code: string
  type: SendEmailType
  organizerToken?: string
  participantId?: string
  email?: string
  language?: Language
  customMessage?: string
}
