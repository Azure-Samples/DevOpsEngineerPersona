import { EmailClient, EmailMessage, KnownEmailSendStatus } from '@azure/communication-email'
import { Game, Participant, Language } from './types'

/**
 * HTML-escape user-provided content to prevent XSS in email templates.
 */
export function escapeHtml(text: string | undefined): string {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// Helper function to get translation with fallback to English
function getTranslation<T>(translations: Partial<Record<Language, T>>, language: Language): T {
  const translation = translations[language] ?? translations.en
  if (translation) {
    return translation
  }
  throw new Error('English email translation is missing')
}

// Email notification types
export type EmailNotificationType = 
  | 'gameCreatedOrganizer'        // Organizer gets email when game is created
  | 'participantInvitation'        // Participant invited to a game (when game is created with their email)
  | 'participantAssignment'        // Participant gets their assignment
  | 'participantConfirmed'         // Participant confirmed their assignment - notify organizer
  | 'reassignmentRequested'        // Organizer notified of reassignment request
  | 'reassignmentApproved'         // Participant notified their reassignment was approved
  | 'reassignmentRejected'         // Participant notified their reassignment was rejected
  | 'wishUpdated'                  // Participant notified when their assignee adds a wish
  | 'eventDetailsChanged'          // All participants notified of event changes
  | 'reminder'                     // Reminder email to participant(s)
  | 'participantRemoved'           // Participant notified when organizer removes them
  | 'gameDeleted'                  // All participants notified when game is cancelled
  | 'eventUpcoming'                // Automated reminder 1 day before event
  | 'allConfirmed'                 // Organizer notified when all participants confirmed
  | 'emailUpdated'                 // Participant notified when their email is changed

// Store changed event fields for notification purposes
export interface EventChanges {
  date?: { old: string; new: string }
  time?: { old?: string; new?: string }
  location?: { old: string; new: string }
  generalNotes?: { old: string; new: string }
}

// Email service configuration
let emailClient: EmailClient | null = null
let emailConfigured = false
let configurationError: string | null = null
let senderAddress: string | null = null

export interface EmailServiceStatus {
  configured: boolean
  error: string | null
}

export function getEmailServiceStatus(): EmailServiceStatus {
  return {
    configured: emailConfigured,
    error: configurationError
  }
}

export async function initializeEmailService(): Promise<void> {
  const connectionString = process.env.ACS_CONNECTION_STRING
  const sender = process.env.ACS_SENDER_ADDRESS

  if (!connectionString || !sender) {
    configurationError = 'ACS_CONNECTION_STRING and ACS_SENDER_ADDRESS environment variables are not configured'
    emailConfigured = false
    return
  }

  try {
    emailClient = new EmailClient(connectionString)
    senderAddress = sender
    emailConfigured = true
    configurationError = null
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to connect to Azure Communication Services'
    configurationError = errorMessage
    emailConfigured = false
  }
}

export interface SendEmailOptions {
  to: Array<{ address: string; displayName?: string }>
  subject: string
  plainText?: string
  html?: string
}

export async function sendEmail(options: SendEmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!emailConfigured || !emailClient || !senderAddress) {
    return {
      success: false,
      error: 'Email service not configured'
    }
  }

  try {
    const message: EmailMessage = {
      senderAddress,
      content: {
        subject: options.subject,
        plainText: options.plainText || '',
        html: options.html
      },
      recipients: {
        to: options.to
      }
    }

    const poller = await emailClient.beginSend(message)
    const result = await poller.pollUntilDone()

    if (result.status === KnownEmailSendStatus.Succeeded) {
      return {
        success: true,
        messageId: result.id
      }
    } else {
      const errorMessage = result.error?.message || 'Email send failed'
      return {
        success: false,
        error: errorMessage
      }
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to send email'
    return {
      success: false,
      error: errorMessage
    }
  }
}

// Helper to get participant link
function getParticipantLink(baseUrl: string, gameCode: string): string {
  return `${baseUrl}?code=${gameCode}`
}

// Helper to get protected participant link (with token)
function getProtectedParticipantLink(baseUrl: string, gameCode: string, participantToken: string): string {
  return `${baseUrl}?code=${gameCode}&participant=${participantToken}`
}

// Helper to get organizer link
function getOrganizerLink(baseUrl: string, gameCode: string, organizerToken: string): string {
  return `${baseUrl}?code=${gameCode}&organizer=${organizerToken}`
}

// Get the base URL from environment (no default - we don't reference external URLs)
function getBaseUrl(): string {
  return process.env.APP_BASE_URL || ''
}

// Check if base URL is configured
function hasBaseUrl(): boolean {
  return !!process.env.APP_BASE_URL
}

export interface GameEmailTemplateData {
  game: Game
  language: Language
}

// Email templates for game creation
export function generateOrganizerEmailContent(data: GameEmailTemplateData): { subject: string; html: string; plainText: string } {
  const { game, language } = data
  const baseUrl = getBaseUrl()
  const hasUrl = hasBaseUrl()
  const participantLink = hasUrl ? getParticipantLink(baseUrl, game.code) : ''
  const organizerLink = hasUrl ? getOrganizerLink(baseUrl, game.code, game.organizerToken) : ''

  const translations: Partial<Record<Language, {
    subject: string; greeting: string; gameCreated: string; gameDetails: string; name: string;
    code: string; date: string; location: string; amount: string; participants: string;
    participantLink: string; participantLinkDesc: string; organizerLink: string;
    organizerLinkDesc: string; organizerToken: string; organizerTokenDesc: string;
    shareCodeDesc: string; footer: string;
  }>> = {
    es: {
      subject: `🎁 Tu juego de Zava Gift Exchange "${game.name}" ha sido creado`,
      greeting: '¡Hola!',
      gameCreated: 'Tu juego de Zava Gift Exchange ha sido creado exitosamente.',
      gameDetails: 'Detalles del juego:',
      name: 'Nombre del evento',
      code: 'Código del juego',
      date: 'Fecha',
      location: 'Lugar',
      amount: 'Monto del regalo',
      participants: 'Participantes',
      participantLink: 'Enlace para participantes',
      participantLinkDesc: 'Comparte este enlace con todos los participantes:',
      organizerLink: 'Enlace del organizador',
      organizerLinkDesc: 'Usa este enlace para administrar el juego (¡no lo compartas!):',
      organizerToken: 'Token del organizador',
      organizerTokenDesc: 'Usa este token junto con el código del juego para administrar el juego (¡no lo compartas!):',
      shareCodeDesc: 'Comparte este código con todos los participantes para que se unan al juego:',
      footer: 'Gracias por usar Zava Gift Exchange. ¡Que disfruten el intercambio de regalos!'
    },
    en: {
      subject: `🎁 Your Zava Gift Exchange game "${game.name}" has been created`,
      greeting: 'Hello!',
      gameCreated: 'Your Zava Gift Exchange game has been created successfully.',
      gameDetails: 'Game details:',
      name: 'Event name',
      code: 'Game code',
      date: 'Date',
      location: 'Location',
      amount: 'Gift amount',
      participants: 'Participants',
      participantLink: 'Participant link',
      participantLinkDesc: 'Share this link with all participants:',
      organizerLink: 'Organizer link',
      organizerLinkDesc: 'Use this link to manage the game (don\'t share it!):',
      organizerToken: 'Organizer token',
      organizerTokenDesc: 'Use this token along with the game code to manage the game (don\'t share it!):',
      shareCodeDesc: 'Share this code with all participants so they can join the game:',
      footer: 'Thank you for using Zava Gift Exchange. Enjoy the gift exchange!'
    },
    pt: {
      subject: `🎁 Seu jogo de Zava Gift Exchange "${game.name}" foi criado`,
      greeting: 'Olá!',
      gameCreated: 'Seu jogo de Zava Gift Exchange foi criado com sucesso.',
      gameDetails: 'Detalhes do jogo:',
      name: 'Nome do evento',
      code: 'Código do jogo',
      date: 'Data',
      location: 'Local',
      amount: 'Valor do presente',
      participants: 'Participantes',
      participantLink: 'Link para participantes',
      participantLinkDesc: 'Compartilhe este link com todos os participantes:',
      organizerLink: 'Link do organizador',
      organizerLinkDesc: 'Use este link para gerenciar o jogo (não compartilhe!):',
      organizerToken: 'Token do organizador',
      organizerTokenDesc: 'Use este token junto com o código do jogo para gerenciá-lo (não compartilhe!):',
      shareCodeDesc: 'Compartilhe este código com todos os participantes para que entrem no jogo:',
      footer: 'Obrigado por usar o Zava Gift Exchange. Aproveite a troca de presentes!'
    },
    fr: {
      subject: `🎁 Votre jeu Zava Gift Exchange "${game.name}" a été créé`,
      greeting: 'Bonjour !',
      gameCreated: 'Votre jeu Zava Gift Exchange a été créé avec succès.',
      gameDetails: 'Détails du jeu :',
      name: 'Nom de l\'événement',
      code: 'Code du jeu',
      date: 'Date',
      location: 'Lieu',
      amount: 'Montant du cadeau',
      participants: 'Participants',
      participantLink: 'Lien pour les participants',
      participantLinkDesc: 'Partagez ce lien avec tous les participants :',
      organizerLink: 'Lien organisateur',
      organizerLinkDesc: 'Utilisez ce lien pour gérer le jeu (ne le partagez pas !) :',
      organizerToken: 'Token organisateur',
      organizerTokenDesc: 'Utilisez ce token avec le code du jeu pour le gérer (ne le partagez pas !) :',
      shareCodeDesc: 'Partagez ce code avec tous les participants pour qu\'ils rejoignent le jeu :',
      footer: 'Merci d\'utiliser Zava Gift Exchange. Profitez de l\'échange de cadeaux !'
    },
    it: {
      subject: `🎁 Il tuo gioco Zava Gift Exchange "${game.name}" è stato creato`,
      greeting: 'Ciao!',
      gameCreated: 'Il tuo gioco Zava Gift Exchange è stato creato con successo.',
      gameDetails: 'Dettagli del gioco:',
      name: 'Nome dell\'evento',
      code: 'Codice del gioco',
      date: 'Data',
      location: 'Luogo',
      amount: 'Importo del regalo',
      participants: 'Partecipanti',
      participantLink: 'Link per i partecipanti',
      participantLinkDesc: 'Condividi questo link con tutti i partecipanti:',
      organizerLink: 'Link dell\'organizzatore',
      organizerLinkDesc: 'Usa questo link per gestire il gioco (non condividerlo!):',
      organizerToken: 'Token dell\'organizzatore',
      organizerTokenDesc: 'Usa questo token insieme al codice del gioco per gestirlo (non condividerlo!):',
      shareCodeDesc: 'Condividi questo codice con tutti i partecipanti per farli unire al gioco:',
      footer: 'Grazie per aver usato Zava Gift Exchange. Buon scambio di regali!'
    },
    ja: {
      subject: `🎁 Zava ギフト交換ゲーム「${game.name}」が作成されました`,
      greeting: 'こんにちは！',
      gameCreated: 'Zava ギフト交換ゲームが正常に作成されました。',
      gameDetails: 'ゲームの詳細：',
      name: 'イベント名',
      code: 'ゲームコード',
      date: '日付',
      location: '場所',
      amount: 'プレゼント金額',
      participants: '参加者',
      participantLink: '参加者用リンク',
      participantLinkDesc: 'このリンクを全参加者と共有してください：',
      organizerLink: '主催者リンク',
      organizerLinkDesc: 'このリンクを使ってゲームを管理してください（共有しないでください）：',
      organizerToken: '主催者トークン',
      organizerTokenDesc: 'このトークンとゲームコードを使用してゲームを管理してください（共有しないでください）：',
      shareCodeDesc: 'このコードを全参加者と共有してゲームに参加してもらいましょう：',
      footer: 'Zava ギフト交換をご利用いただきありがとうございます。プレゼント交換をお楽しみください！'
    },
    zh: {
      subject: `🎁 您的Zava 礼物交换游戏"${game.name}"已创建`,
      greeting: '您好！',
      gameCreated: '您的Zava 礼物交换游戏已成功创建。',
      gameDetails: '游戏详情：',
      name: '活动名称',
      code: '游戏代码',
      date: '日期',
      location: '地点',
      amount: '礼物金额',
      participants: '参与者',
      participantLink: '参与者链接',
      participantLinkDesc: '与所有参与者分享此链接：',
      organizerLink: '组织者链接',
      organizerLinkDesc: '使用此链接管理游戏（请勿分享）：',
      organizerToken: '组织者令牌',
      organizerTokenDesc: '使用此令牌和游戏代码管理游戏（请勿分享）：',
      shareCodeDesc: '与所有参与者分享此代码以加入游戏：',
      footer: '感谢使用Zava 礼物交换。祝您礼物交换愉快！'
    },
    de: {
      subject: `🎁 Dein Zava Geschenktausch-Spiel "${game.name}" wurde erstellt`,
      greeting: 'Hallo!',
      gameCreated: 'Dein Zava Geschenktausch-Spiel wurde erfolgreich erstellt.',
      gameDetails: 'Spieldetails:',
      name: 'Veranstaltungsname',
      code: 'Spielcode',
      date: 'Datum',
      location: 'Ort',
      amount: 'Geschenkbetrag',
      participants: 'Teilnehmer',
      participantLink: 'Teilnehmer-Link',
      participantLinkDesc: 'Teile diesen Link mit allen Teilnehmern:',
      organizerLink: 'Organisator-Link',
      organizerLinkDesc: 'Verwende diesen Link um das Spiel zu verwalten (nicht teilen!):',
      organizerToken: 'Organisator-Token',
      organizerTokenDesc: 'Verwende dieses Token zusammen mit dem Spielcode um das Spiel zu verwalten (nicht teilen!):',
      shareCodeDesc: 'Teile diesen Code mit allen Teilnehmern, damit sie dem Spiel beitreten können:',
      footer: 'Danke, dass du Zava Geschenktausch verwendest. Viel Spaß beim Geschenkeaustausch!'
    },
    nl: {
      subject: `🎁 Je Zava Gift Exchange spel "${game.name}" is aangemaakt`,
      greeting: 'Hallo!',
      gameCreated: 'Je Zava Gift Exchange spel is succesvol aangemaakt.',
      gameDetails: 'Speldetails:',
      name: 'Evenementnaam',
      code: 'Spelcode',
      date: 'Datum',
      location: 'Locatie',
      amount: 'Cadeaubedrag',
      participants: 'Deelnemers',
      participantLink: 'Link voor deelnemers',
      participantLinkDesc: 'Deel deze link met alle deelnemers:',
      organizerLink: 'Organisator-link',
      organizerLinkDesc: 'Gebruik deze link om het spel te beheren (deel deze niet!):',
      organizerToken: 'Organisator-token',
      organizerTokenDesc: 'Gebruik deze token samen met de spelcode om het spel te beheren (deel deze niet!):',
      shareCodeDesc: 'Deel deze code met alle deelnemers zodat ze kunnen deelnemen aan het spel:',
      footer: 'Bedankt voor het gebruik van Zava Gift Exchange. Veel plezier met het cadeautjes ruilen!'
    }
  }

  const t = getTranslation(translations, language)
  const currencySymbol = getCurrencySymbol(game.currency)

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t.subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">🎁 Zava Gift Exchange</h1>
  </div>
  
  <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px;">${t.greeting}</p>
    <p style="font-size: 16px;">${t.gameCreated}</p>
    
    <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h2 style="margin-top: 0; color: #1e40af; font-size: 18px;">📋 ${t.gameDetails}</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; font-weight: bold; width: 40%;">${t.name}:</td>
          <td style="padding: 8px 0;">${escapeHtml(game.name)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">${t.code}:</td>
          <td style="padding: 8px 0;"><code style="background: #e0e0e0; padding: 4px 8px; border-radius: 4px; font-size: 18px; font-weight: bold;">${game.code}</code></td>
        </tr>
        ${game.date ? `<tr><td style="padding: 8px 0; font-weight: bold;">${t.date}:</td><td style="padding: 8px 0;">${game.date}</td></tr>` : ''}
        ${game.location ? `<tr><td style="padding: 8px 0; font-weight: bold;">${t.location}:</td><td style="padding: 8px 0;">${escapeHtml(game.location)}</td></tr>` : ''}
        ${game.amount ? `<tr><td style="padding: 8px 0; font-weight: bold;">${t.amount}:</td><td style="padding: 8px 0;">${currencySymbol}${escapeHtml(game.amount)}</td></tr>` : ''}
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">${t.participants}:</td>
          <td style="padding: 8px 0;">${game.participants.map(p => escapeHtml(p.name)).join(', ')}</td>
        </tr>
      </table>
    </div>
    
    <div style="background: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #1e40af;">
      <h3 style="margin-top: 0; color: #1e40af;">🔗 ${hasUrl ? t.participantLink : t.code}</h3>
      <p style="margin-bottom: 10px; font-size: 14px;">${hasUrl ? t.participantLinkDesc : t.shareCodeDesc}</p>
      ${hasUrl 
        ? `<a href="${participantLink}" style="display: inline-block; background: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">${participantLink}</a>`
        : `<code style="display: inline-block; background: #1e40af; color: white; padding: 12px 24px; border-radius: 6px; font-size: 24px; font-weight: bold;">${game.code}</code>`
      }
    </div>
    
    <div style="background: #fff3e0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f57c00;">
      <h3 style="margin-top: 0; color: #e65100;">🔐 ${hasUrl ? t.organizerLink : t.organizerToken}</h3>
      <p style="margin-bottom: 10px; font-size: 14px;">${hasUrl ? t.organizerLinkDesc : t.organizerTokenDesc}</p>
      ${hasUrl
        ? `<a href="${organizerLink}" style="display: inline-block; background: #f57c00; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; word-break: break-all;">${organizerLink}</a>`
        : `<code style="display: inline-block; background: #f57c00; color: white; padding: 12px 24px; border-radius: 6px; font-size: 18px; font-weight: bold; word-break: break-all;">${game.organizerToken}</code>`
      }
    </div>
    
    <p style="font-size: 14px; color: #666; margin-top: 30px; text-align: center;">${t.footer}</p>
  </div>
</body>
</html>
`

  const plainText = `
${t.greeting}

${t.gameCreated}

${t.gameDetails}
- ${t.name}: ${game.name}
- ${t.code}: ${game.code}
${game.date ? `- ${t.date}: ${game.date}` : ''}
${game.location ? `- ${t.location}: ${game.location}` : ''}
${game.amount ? `- ${t.amount}: ${currencySymbol}${game.amount}` : ''}
- ${t.participants}: ${game.participants.map(p => p.name).join(', ')}

${hasUrl ? t.participantLink : t.code}
${hasUrl ? t.participantLinkDesc : t.shareCodeDesc}
${hasUrl ? participantLink : game.code}

${hasUrl ? t.organizerLink : t.organizerToken}
${hasUrl ? t.organizerLinkDesc : t.organizerTokenDesc}
${hasUrl ? organizerLink : game.organizerToken}

${t.footer}
`

  return { subject: t.subject, html, plainText }
}

export interface ParticipantEmailTemplateData {
  game: Game
  participant: Participant
  receiver: Participant
  language: Language
}

export function generateParticipantEmailContent(data: ParticipantEmailTemplateData): { subject: string; html: string; plainText: string } {
  const { game, participant, receiver, language } = data
  const baseUrl = getBaseUrl()
  const hasUrl = hasBaseUrl()
  const participantLink = hasUrl ? getParticipantLink(baseUrl, game.code) : ''

  const translations: Partial<Record<Language, {
    subject: string; greeting: string; intro: string; yourAssignment: string; youGiftTo: string;
    theirWish: string; noWish: string; theirDesiredGift: string; noDesiredGift: string;
    gameDetails: string; name: string; date: string; location: string; amount: string;
    notes: string; viewMore: string; link: string; linkDesc: string; gameCode: string;
    gameCodeDesc: string; footer: string; keepSecret: string;
  }>> = {
    es: {
      subject: `🎁 Tu asignación de Zava Gift Exchange para "${game.name}"`,
      greeting: `¡Hola ${participant.name}!`,
      intro: 'Has sido incluido en un juego de Zava Gift Exchange.',
      yourAssignment: '¡Tu asignación está lista!',
      youGiftTo: 'Le regalas a:',
      theirWish: 'Su deseo de regalo:',
      noWish: 'Aún no ha agregado un deseo',
      theirDesiredGift: 'Regalo que desea:',
      noDesiredGift: 'No especificado',
      gameDetails: 'Detalles del evento:',
      name: 'Evento',
      date: 'Fecha',
      location: 'Lugar',
      amount: 'Monto sugerido',
      notes: 'Notas del organizador',
      viewMore: 'Ver más detalles',
      link: 'Enlace del juego',
      linkDesc: 'Visita el siguiente enlace para ver tu asignación y agregar tu deseo de regalo:',
      gameCode: 'Código del juego',
      gameCodeDesc: 'Usa este código para acceder al juego y ver tu asignación:',
      footer: '¡Que disfrutes el intercambio de regalos!',
      keepSecret: '🤫 Recuerda: ¡mantén en secreto a quién le regalas!'
    },
    en: {
      subject: `🎁 Your Zava Gift Exchange assignment for "${game.name}"`,
      greeting: `Hello ${participant.name}!`,
      intro: 'You have been included in a Zava Gift Exchange game.',
      yourAssignment: 'Your assignment is ready!',
      youGiftTo: 'You\'re gifting to:',
      theirWish: 'Their gift wish:',
      noWish: 'Haven\'t added a wish yet',
      theirDesiredGift: 'Desired gift:',
      noDesiredGift: 'Not specified',
      gameDetails: 'Event details:',
      name: 'Event',
      date: 'Date',
      location: 'Location',
      amount: 'Suggested amount',
      notes: 'Organizer notes',
      viewMore: 'View more details',
      link: 'Game link',
      linkDesc: 'Visit the following link to view your assignment and add your gift wish:',
      gameCode: 'Game code',
      gameCodeDesc: 'Use this code to access the game and view your assignment:',
      footer: 'Enjoy the gift exchange!',
      keepSecret: '🤫 Remember: keep your assignment a secret!'
    },
    pt: {
      subject: `🎁 Sua atribuição do Zava Gift Exchange para "${game.name}"`,
      greeting: `Olá ${participant.name}!`,
      intro: 'Você foi incluído em um jogo de Zava Gift Exchange.',
      yourAssignment: 'Sua atribuição está pronta!',
      youGiftTo: 'Você vai presentear:',
      theirWish: 'Desejo de presente:',
      noWish: 'Ainda não adicionou um desejo',
      theirDesiredGift: 'Presente desejado:',
      noDesiredGift: 'Não especificado',
      gameDetails: 'Detalhes do evento:',
      name: 'Evento',
      date: 'Data',
      location: 'Local',
      amount: 'Valor sugerido',
      notes: 'Notas do organizador',
      viewMore: 'Ver mais detalhes',
      link: 'Link do jogo',
      linkDesc: 'Visite o link a seguir para ver sua atribuição e adicionar seu desejo de presente:',
      gameCode: 'Código do jogo',
      gameCodeDesc: 'Use este código para acessar o jogo e ver sua atribuição:',
      footer: 'Aproveite a troca de presentes!',
      keepSecret: '🤫 Lembre-se: mantenha em segredo para quem você vai dar o presente!'
    },
    fr: {
      subject: `🎁 Votre attribution Zava Gift Exchange pour "${game.name}"`,
      greeting: `Bonjour ${participant.name} !`,
      intro: 'Vous avez été inclus dans un jeu Zava Gift Exchange.',
      yourAssignment: 'Votre attribution est prête !',
      youGiftTo: 'Vous offrez à :',
      theirWish: 'Son souhait de cadeau :',
      noWish: 'N\'a pas encore ajouté de souhait',
      theirDesiredGift: 'Cadeau désiré :',
      noDesiredGift: 'Non spécifié',
      gameDetails: 'Détails de l\'événement :',
      name: 'Événement',
      date: 'Date',
      location: 'Lieu',
      amount: 'Montant suggéré',
      notes: 'Notes de l\'organisateur',
      viewMore: 'Voir plus de détails',
      link: 'Lien du jeu',
      linkDesc: 'Visitez le lien suivant pour voir votre attribution et ajouter votre souhait de cadeau :',
      gameCode: 'Code du jeu',
      gameCodeDesc: 'Utilisez ce code pour accéder au jeu et voir votre attribution :',
      footer: 'Profitez de l\'échange de cadeaux !',
      keepSecret: '🤫 N\'oubliez pas : gardez secrète votre attribution !'
    },
    it: {
      subject: `🎁 La tua assegnazione Zava Gift Exchange per "${game.name}"`,
      greeting: `Ciao ${participant.name}!`,
      intro: 'Sei stato incluso in un gioco di Zava Gift Exchange.',
      yourAssignment: 'La tua assegnazione è pronta!',
      youGiftTo: 'Farai un regalo a:',
      theirWish: 'Il suo desiderio regalo:',
      noWish: 'Non ha ancora aggiunto un desiderio',
      theirDesiredGift: 'Regalo desiderato:',
      noDesiredGift: 'Non specificato',
      gameDetails: 'Dettagli dell\'evento:',
      name: 'Evento',
      date: 'Data',
      location: 'Luogo',
      amount: 'Importo suggerito',
      notes: 'Note dell\'organizzatore',
      viewMore: 'Vedi più dettagli',
      link: 'Link del gioco',
      linkDesc: 'Visita il seguente link per vedere la tua assegnazione e aggiungere il tuo desiderio regalo:',
      gameCode: 'Codice del gioco',
      gameCodeDesc: 'Usa questo codice per accedere al gioco e vedere la tua assegnazione:',
      footer: 'Buon scambio di regali!',
      keepSecret: '🤫 Ricorda: mantieni segreta la tua assegnazione!'
    },
    ja: {
      subject: `🎁 「${game.name}」のZava ギフト交換の割り当て`,
      greeting: `こんにちは、${participant.name}さん！`,
      intro: 'Zava ギフト交換ゲームに参加しています。',
      yourAssignment: '割り当てが決まりました！',
      youGiftTo: 'プレゼントを贈る相手：',
      theirWish: '相手のウィッシュリスト：',
      noWish: 'まだウィッシュを追加していません',
      theirDesiredGift: '希望のプレゼント：',
      noDesiredGift: '指定なし',
      gameDetails: 'イベント詳細：',
      name: 'イベント',
      date: '日付',
      location: '場所',
      amount: '推奨金額',
      notes: '主催者からのメモ',
      viewMore: '詳細を見る',
      link: 'ゲームリンク',
      linkDesc: '以下のリンクから割り当てを確認し、ウィッシュリストを追加してください：',
      gameCode: 'ゲームコード',
      gameCodeDesc: 'このコードを使用してゲームにアクセスし、割り当てを確認してください：',
      footer: 'プレゼント交換をお楽しみください！',
      keepSecret: '🤫 忘れずに：誰にプレゼントを贈るかは秘密にしてください！'
    },
    zh: {
      subject: `🎁 您的"${game.name}"Zava 礼物交换分配`,
      greeting: `您好，${participant.name}！`,
      intro: '您已被加入Zava 礼物交换游戏。',
      yourAssignment: '您的分配已准备好！',
      youGiftTo: '您要送礼物给：',
      theirWish: '对方的礼物愿望：',
      noWish: '尚未添加愿望',
      theirDesiredGift: '想要的礼物：',
      noDesiredGift: '未指定',
      gameDetails: '活动详情：',
      name: '活动',
      date: '日期',
      location: '地点',
      amount: '建议金额',
      notes: '组织者备注',
      viewMore: '查看更多详情',
      link: '游戏链接',
      linkDesc: '请访问以下链接查看您的分配并添加您的礼物愿望：',
      gameCode: '游戏代码',
      gameCodeDesc: '使用此代码访问游戏并查看您的分配：',
      footer: '祝您礼物交换愉快！',
      keepSecret: '🤫 记住：请对您的分配对象保密！'
    },
    de: {
      subject: `🎁 Deine Zava Geschenktausch-Zuweisung für "${game.name}"`,
      greeting: `Hallo ${participant.name}!`,
      intro: 'Du wurdest in ein Zava Geschenktausch-Spiel aufgenommen.',
      yourAssignment: 'Deine Zuweisung steht fest!',
      youGiftTo: 'Du beschenkst:',
      theirWish: 'Geschenkwunsch:',
      noWish: 'Hat noch keinen Wunsch hinzugefügt',
      theirDesiredGift: 'Gewünschtes Geschenk:',
      noDesiredGift: 'Nicht angegeben',
      gameDetails: 'Veranstaltungsdetails:',
      name: 'Veranstaltung',
      date: 'Datum',
      location: 'Ort',
      amount: 'Empfohlener Betrag',
      notes: 'Hinweise des Organisators',
      viewMore: 'Mehr Details anzeigen',
      link: 'Spiel-Link',
      linkDesc: 'Besuche den folgenden Link, um deine Zuweisung zu sehen und deinen Geschenkwunsch hinzuzufügen:',
      gameCode: 'Spielcode',
      gameCodeDesc: 'Verwende diesen Code, um auf das Spiel zuzugreifen und deine Zuweisung zu sehen:',
      footer: 'Viel Spaß beim Geschenkeaustausch!',
      keepSecret: '🤫 Denk daran: Halte geheim, wen du beschenkst!'
    },
    nl: {
      subject: `🎁 Jouw Zava Gift Exchange toewijzing voor "${game.name}"`,
      greeting: `Hallo ${participant.name}!`,
      intro: 'Je bent toegevoegd aan een Zava Gift Exchange spel.',
      yourAssignment: 'Je toewijzing is klaar!',
      youGiftTo: 'Je geeft een cadeau aan:',
      theirWish: 'Hun cadeauwens:',
      noWish: 'Heeft nog geen wens toegevoegd',
      theirDesiredGift: 'Gewenst cadeau:',
      noDesiredGift: 'Niet gespecificeerd',
      gameDetails: 'Evenementdetails:',
      name: 'Evenement',
      date: 'Datum',
      location: 'Locatie',
      amount: 'Voorgesteld bedrag',
      notes: 'Opmerkingen organisator',
      viewMore: 'Meer details bekijken',
      link: 'Spellink',
      linkDesc: 'Bezoek de volgende link om je toewijzing te zien en je cadeauwens toe te voegen:',
      gameCode: 'Spelcode',
      gameCodeDesc: 'Gebruik deze code om toegang te krijgen tot het spel en je toewijzing te zien:',
      footer: 'Veel plezier met het cadeautjes ruilen!',
      keepSecret: '🤫 Onthoud: houd je toewijzing geheim!'
    }
  }

  const t = getTranslation(translations, language)
  const currencySymbol = getCurrencySymbol(game.currency)

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t.subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">🎁 Zava Gift Exchange</h1>
  </div>
  
  <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 18px; font-weight: bold;">${t.greeting}</p>
    <p style="font-size: 16px;">${t.intro}</p>
    
    <div style="background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); padding: 25px; border-radius: 12px; margin: 25px 0; text-align: center; color: white;">
      <h2 style="margin: 0 0 15px 0; font-size: 20px;">${t.yourAssignment}</h2>
      <p style="margin: 0; font-size: 14px; opacity: 0.9;">${t.youGiftTo}</p>
      <p style="margin: 10px 0 0 0; font-size: 32px; font-weight: bold;">🎄 ${escapeHtml(receiver.name)} 🎄</p>
      ${receiver.desiredGift ? `<p style="margin: 15px 0 0 0; font-size: 14px;"><strong>${t.theirDesiredGift}</strong> ${escapeHtml(receiver.desiredGift)}</p>` : ''}
      ${receiver.wish ? `<p style="margin: 10px 0 0 0; font-size: 14px;"><strong>${t.theirWish}</strong> ${escapeHtml(receiver.wish)}</p>` : ''}
    </div>
    
    <div style="background: #fff3e0; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center;">
      <p style="margin: 0; font-weight: bold; color: #e65100;">${t.keepSecret}</p>
    </div>
    
    <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="margin-top: 0; color: #1e40af;">📋 ${t.gameDetails}</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 6px 0; font-weight: bold;">${t.name}:</td><td style="padding: 6px 0;">${escapeHtml(game.name)}</td></tr>
        ${game.date ? `<tr><td style="padding: 6px 0; font-weight: bold;">${t.date}:</td><td style="padding: 6px 0;">${game.date}</td></tr>` : ''}
        ${game.location ? `<tr><td style="padding: 6px 0; font-weight: bold;">${t.location}:</td><td style="padding: 6px 0;">${escapeHtml(game.location)}</td></tr>` : ''}
        ${game.amount ? `<tr><td style="padding: 6px 0; font-weight: bold;">${t.amount}:</td><td style="padding: 6px 0;">${currencySymbol}${escapeHtml(game.amount)}</td></tr>` : ''}
      </table>
      ${game.generalNotes ? `<div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e0e0e0;"><strong>${t.notes}:</strong><br>${escapeHtml(game.generalNotes)}</div>` : ''}
    </div>
    
    <div style="background: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
      <p style="margin: 0 0 15px 0; font-size: 14px;">${hasUrl ? t.linkDesc : t.gameCodeDesc}</p>
      ${hasUrl
        ? `<a href="${participantLink}" style="display: inline-block; background: #1e40af; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">${t.viewMore}</a>`
        : `<code style="display: inline-block; background: #1e40af; color: white; padding: 14px 28px; border-radius: 6px; font-size: 24px; font-weight: bold;">${game.code}</code>`
      }
    </div>
    
    <p style="font-size: 14px; color: #666; margin-top: 30px; text-align: center;">${t.footer}</p>
  </div>
</body>
</html>
`

  const plainText = `
${t.greeting}

${t.intro}

${t.yourAssignment}
${t.youGiftTo} ${receiver.name}
${receiver.desiredGift ? `${t.theirDesiredGift} ${receiver.desiredGift}` : ''}
${receiver.wish ? `${t.theirWish} ${receiver.wish}` : t.noWish}

${t.keepSecret}

${t.gameDetails}
- ${t.name}: ${game.name}
${game.date ? `- ${t.date}: ${game.date}` : ''}
${game.location ? `- ${t.location}: ${game.location}` : ''}
${game.amount ? `- ${t.amount}: ${currencySymbol}${game.amount}` : ''}
${game.generalNotes ? `- ${t.notes}: ${game.generalNotes}` : ''}

${hasUrl ? t.link : t.gameCode}
${hasUrl ? t.linkDesc : t.gameCodeDesc}
${hasUrl ? participantLink : game.code}

${t.footer}
`

  return { subject: t.subject, html, plainText }
}

// Helper to get currency symbol
function getCurrencySymbol(currencyCode: string): string {
  const symbols: Record<string, string> = {
    USD: '$',
    CRC: '₡',
    ARS: '$',
    BRL: 'R$',
    CAD: '$',
    CLP: '$',
    COP: '$',
    EUR: '€',
    GBP: '£',
    GTQ: 'Q',
    HNL: 'L',
    MXN: '$',
    NIO: 'C$',
    PAB: 'B/.',
    PEN: 'S/',
    UYU: '$U',
    VES: 'Bs.'
  }
  return symbols[currencyCode] || '$'
}

// Send email to organizer with game details
export async function sendOrganizerEmail(game: Game, language: Language = 'es'): Promise<{ success: boolean; error?: string }> {
  if (!game.organizerEmail) {
    return { success: false, error: 'No organizer email provided' }
  }

  const { subject, html, plainText } = generateOrganizerEmailContent({ game, language })

  return await sendEmail({
    to: [{ address: game.organizerEmail }],
    subject,
    html,
    plainText
  })
}

// Send recovery email to organizer with their management link
// This is used when the organizer requests link recovery via email verification
export async function sendOrganizerRecoveryEmail(game: Game, language: Language = 'es'): Promise<{ success: boolean; error?: string }> {
  if (!game.organizerEmail) {
    return { success: false, error: 'No organizer email provided' }
  }

  const { subject, html, plainText } = generateOrganizerRecoveryEmailContent({ game, language })

  return await sendEmail({
    to: [{ address: game.organizerEmail }],
    subject,
    html,
    plainText
  })
}

// Generate content for organizer recovery email
export interface OrganizerRecoveryEmailData {
  game: Game
  language: Language
}

export function generateOrganizerRecoveryEmailContent(data: OrganizerRecoveryEmailData): { subject: string; html: string; plainText: string } {
  const { game, language } = data
  const baseUrl = getBaseUrl()
  const organizerLink = getOrganizerLink(baseUrl, game.code, game.organizerToken)
  const hasUrl = baseUrl !== ''

  const translations: Partial<Record<Language, {
    subject: string
    greeting: string
    recoveryRequested: string
    recoveryDesc: string
    organizerLink: string
    organizerLinkDesc: string
    organizerToken: string
    organizerTokenDesc: string
    securityNote: string
    notYou: string
    footer: string
    headerTitle: string
  }>> = {
    es: {
      subject: `🔑 Recuperación de enlace - "${game.name}"`,
      greeting: '¡Hola!',
      recoveryRequested: 'Se ha solicitado la recuperación del enlace de organizador para tu juego de Zava Gift Exchange.',
      recoveryDesc: 'Si solicitaste esta recuperación, usa el enlace o token a continuación para acceder a tu panel de organizador.',
      organizerLink: 'Tu enlace de organizador',
      organizerLinkDesc: 'Usa este enlace para acceder al panel de organizador:',
      organizerToken: 'Tu token de organizador',
      organizerTokenDesc: 'Usa este token para acceder:',
      securityNote: 'Si no solicitaste esta recuperación, puedes ignorar este correo. Tu enlace de acceso sigue siendo válido.',
      notYou: '¿No fuiste tú?',
      footer: 'Gracias por usar Zava Gift Exchange.',
      headerTitle: 'Recuperación de Enlace'
    },
    en: {
      subject: `🔑 Link Recovery - "${game.name}"`,
      greeting: 'Hello!',
      recoveryRequested: 'A link recovery has been requested for your Zava Gift Exchange game organizer access.',
      recoveryDesc: 'If you requested this recovery, use the link or token below to access your organizer panel.',
      organizerLink: 'Your organizer link',
      organizerLinkDesc: 'Use this link to access the organizer panel:',
      organizerToken: 'Your organizer token',
      organizerTokenDesc: 'Use this token to access:',
      securityNote: 'If you didn\'t request this recovery, you can ignore this email. Your access link remains valid.',
      notYou: 'Wasn\'t you?',
      footer: 'Thank you for using Zava Gift Exchange.',
      headerTitle: 'Link Recovery'
    },
    pt: {
      subject: `🔑 Recuperação de link - "${game.name}"`,
      greeting: 'Olá!',
      recoveryRequested: 'Foi solicitada a recuperação do link de organizador do seu jogo de Zava Gift Exchange.',
      recoveryDesc: 'Se você solicitou esta recuperação, use o link ou token abaixo para acessar seu painel de organizador.',
      organizerLink: 'Seu link de organizador',
      organizerLinkDesc: 'Use este link para acessar o painel de organizador:',
      organizerToken: 'Seu token de organizador',
      organizerTokenDesc: 'Use este token para acessar:',
      securityNote: 'Se você não solicitou esta recuperação, pode ignorar este email. Seu link de acesso continua válido.',
      notYou: 'Não foi você?',
      footer: 'Obrigado por usar o Zava Gift Exchange.',
      headerTitle: 'Recuperação de Link'
    },
    fr: {
      subject: `🔑 Récupération de lien - "${game.name}"`,
      greeting: 'Bonjour!',
      recoveryRequested: 'Une récupération de lien a été demandée pour l\'accès organisateur de votre jeu Zava Gift Exchange.',
      recoveryDesc: 'Si vous avez demandé cette récupération, utilisez le lien ou le jeton ci-dessous pour accéder à votre panneau d\'organisateur.',
      organizerLink: 'Votre lien d\'organisateur',
      organizerLinkDesc: 'Utilisez ce lien pour accéder au panneau d\'organisateur:',
      organizerToken: 'Votre jeton d\'organisateur',
      organizerTokenDesc: 'Utilisez ce jeton pour accéder:',
      securityNote: 'Si vous n\'avez pas demandé cette récupération, vous pouvez ignorer cet email. Votre lien d\'accès reste valide.',
      notYou: 'Ce n\'était pas vous?',
      footer: 'Merci d\'utiliser Zava Gift Exchange.',
      headerTitle: 'Récupération de Lien'
    },
    it: {
      subject: `🔑 Recupero link - "${game.name}"`,
      greeting: 'Ciao!',
      recoveryRequested: 'È stato richiesto il recupero del link organizzatore per il tuo gioco Zava Gift Exchange.',
      recoveryDesc: 'Se hai richiesto questo recupero, usa il link o il token qui sotto per accedere al tuo pannello organizzatore.',
      organizerLink: 'Il tuo link organizzatore',
      organizerLinkDesc: 'Usa questo link per accedere al pannello organizzatore:',
      organizerToken: 'Il tuo token organizzatore',
      organizerTokenDesc: 'Usa questo token per accedere:',
      securityNote: 'Se non hai richiesto questo recupero, puoi ignorare questa email. Il tuo link di accesso rimane valido.',
      notYou: 'Non sei stato tu?',
      footer: 'Grazie per usare Zava Gift Exchange.',
      headerTitle: 'Recupero Link'
    },
    ja: {
      subject: `🔑 リンク復旧 - "${game.name}"`,
      greeting: 'こんにちは！',
      recoveryRequested: 'Zava Gift Exchangeゲームの主催者リンクの復旧がリクエストされました。',
      recoveryDesc: 'この復旧をリクエストした場合は、以下のリンクまたはトークンを使用して主催者パネルにアクセスしてください。',
      organizerLink: '主催者リンク',
      organizerLinkDesc: 'このリンクを使用して主催者パネルにアクセスしてください:',
      organizerToken: '主催者トークン',
      organizerTokenDesc: 'このトークンを使用してアクセスしてください:',
      securityNote: 'この復旧をリクエストしていない場合は、このメールを無視してください。アクセスリンクは引き続き有効です。',
      notYou: '心当たりがない場合',
      footer: 'Zava Gift Exchangeをご利用いただきありがとうございます。',
      headerTitle: 'リンク復旧'
    },
    zh: {
      subject: `🔑 链接恢复 - "${game.name}"`,
      greeting: '您好！',
      recoveryRequested: '已请求恢复您的Zava Gift Exchange游戏组织者链接。',
      recoveryDesc: '如果您请求了此恢复，请使用下面的链接或令牌访问您的组织者面板。',
      organizerLink: '您的组织者链接',
      organizerLinkDesc: '使用此链接访问组织者面板:',
      organizerToken: '您的组织者令牌',
      organizerTokenDesc: '使用此令牌访问:',
      securityNote: '如果您没有请求此恢复，可以忽略此邮件。您的访问链接仍然有效。',
      notYou: '不是您操作的？',
      footer: '感谢您使用Zava Gift Exchange。',
      headerTitle: '链接恢复'
    },
    de: {
      subject: `🔑 Link-Wiederherstellung - "${game.name}"`,
      greeting: 'Hallo!',
      recoveryRequested: 'Eine Link-Wiederherstellung wurde für Ihren Zava Gift Exchange Organisator-Zugang angefordert.',
      recoveryDesc: 'Wenn Sie diese Wiederherstellung angefordert haben, verwenden Sie den Link oder Token unten, um auf Ihr Organisator-Panel zuzugreifen.',
      organizerLink: 'Ihr Organisator-Link',
      organizerLinkDesc: 'Verwenden Sie diesen Link, um auf das Organisator-Panel zuzugreifen:',
      organizerToken: 'Ihr Organisator-Token',
      organizerTokenDesc: 'Verwenden Sie diesen Token für den Zugang:',
      securityNote: 'Wenn Sie diese Wiederherstellung nicht angefordert haben, können Sie diese E-Mail ignorieren. Ihr Zugangslink bleibt gültig.',
      notYou: 'Waren Sie das nicht?',
      footer: 'Vielen Dank für die Nutzung von Zava Gift Exchange.',
      headerTitle: 'Link-Wiederherstellung'
    },
    nl: {
      subject: `🔑 Link Herstel - "${game.name}"`,
      greeting: 'Hallo!',
      recoveryRequested: 'Er is een linkherstel aangevraagd voor uw Zava Gift Exchange organisatortoegang.',
      recoveryDesc: 'Als u dit herstel heeft aangevraagd, gebruik dan de link of token hieronder om toegang te krijgen tot uw organisatorpaneel.',
      organizerLink: 'Uw organisatorlink',
      organizerLinkDesc: 'Gebruik deze link om toegang te krijgen tot het organisatorpaneel:',
      organizerToken: 'Uw organisatortoken',
      organizerTokenDesc: 'Gebruik deze token voor toegang:',
      securityNote: 'Als u dit herstel niet heeft aangevraagd, kunt u deze e-mail negeren. Uw toegangslink blijft geldig.',
      notYou: 'Was u dit niet?',
      footer: 'Bedankt voor het gebruik van Zava Gift Exchange.',
      headerTitle: 'Link Herstel'
    }
  }

  const t = getTranslation(translations, language)

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t.headerTitle}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 32px; text-align: center;">
              <div style="font-size: 48px; margin-bottom: 16px;">🔑</div>
              <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 600;">${t.headerTitle}</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 16px;">${escapeHtml(game.name)}</p>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">${t.greeting}</p>
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">${t.recoveryRequested}</p>
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">${t.recoveryDesc}</p>
              
              <!-- Organizer Link/Token -->
              <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                <p style="color: #1e40af; font-weight: 600; margin: 0 0 8px 0;">${hasUrl ? t.organizerLink : t.organizerToken}</p>
                <p style="color: #6b7280; font-size: 14px; margin: 0 0 12px 0;">${hasUrl ? t.organizerLinkDesc : t.organizerTokenDesc}</p>
                ${hasUrl 
                  ? `<a href="${organizerLink}" style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">🔗 ${t.organizerLink}</a>`
                  : `<code style="display: block; background-color: #f3f4f6; padding: 12px; border-radius: 6px; font-family: monospace; word-break: break-all; color: #374151;">${game.organizerToken}</code>`
                }
              </div>
              
              <!-- Security Note -->
              <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                <p style="color: #166534; font-size: 14px; margin: 0;">
                  <strong>${t.notYou}</strong> ${t.securityNote}
                </p>
              </div>
              
              <p style="color: #6b7280; font-size: 14px; margin: 0;">${t.footer}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`

  const plainText = `${t.greeting}\n\n${t.recoveryRequested}\n\n${t.recoveryDesc}\n\n${hasUrl ? t.organizerLink : t.organizerToken}\n${hasUrl ? t.organizerLinkDesc : t.organizerTokenDesc}\n${hasUrl ? organizerLink : game.organizerToken}\n\n${t.notYou} ${t.securityNote}\n\n${t.footer}`

  return { subject: t.subject, html, plainText }
}

// Send recovery email to participant with their access link
// This is used when a participant requests link recovery via email verification
export async function sendParticipantRecoveryEmail(game: Game, participant: Participant, language: Language = 'es'): Promise<{ success: boolean; error?: string }> {
  if (!participant.email) {
    return { success: false, error: 'No participant email provided' }
  }

  const { subject, html, plainText } = generateParticipantRecoveryEmailContent({ game, participant, language })

  return await sendEmail({
    to: [{ address: participant.email, displayName: participant.name }],
    subject,
    html,
    plainText
  })
}

// Generate content for participant recovery email
export interface ParticipantRecoveryEmailData {
  game: Game
  participant: Participant
  language: Language
}

export function generateParticipantRecoveryEmailContent(data: ParticipantRecoveryEmailData): { subject: string; html: string; plainText: string } {
  const { game, participant, language } = data
  const baseUrl = getBaseUrl()
  const participantLink = participant.token 
    ? getProtectedParticipantLink(baseUrl, game.code, participant.token)
    : getParticipantLink(baseUrl, game.code)
  const hasUrl = baseUrl !== ''
  const hasToken = !!participant.token

  const translations: Partial<Record<Language, {
    subject: string
    greeting: string
    recoveryRequested: string
    recoveryDesc: string
    participantLink: string
    participantLinkDesc: string
    participantToken: string
    participantTokenDesc: string
    securityNote: string
    notYou: string
    footer: string
    headerTitle: string
    noTokenMessage: string
  }>> = {
    es: {
      subject: `🔑 Recuperación de enlace - "${game.name}"`,
      greeting: `¡Hola ${participant.name}!`,
      recoveryRequested: 'Se ha solicitado la recuperación de tu enlace de participante para el juego de Zava Gift Exchange.',
      recoveryDesc: 'Si solicitaste esta recuperación, usa el enlace o token a continuación para ver tu asignación.',
      participantLink: 'Tu enlace de participante',
      participantLinkDesc: 'Usa este enlace para ver tu asignación:',
      participantToken: 'Tu token de participante',
      participantTokenDesc: 'Usa este token para acceder:',
      securityNote: 'Si no solicitaste esta recuperación, puedes ignorar este correo. Tu enlace de acceso sigue siendo válido.',
      notYou: '¿No fuiste tú?',
      footer: 'Gracias por usar Zava Gift Exchange.',
      headerTitle: 'Recuperación de Enlace',
      noTokenMessage: 'Este juego no está protegido. Usa el código del juego para acceder.'
    },
    en: {
      subject: `🔑 Link Recovery - "${game.name}"`,
      greeting: `Hello ${participant.name}!`,
      recoveryRequested: 'A link recovery has been requested for your Zava Gift Exchange game participation.',
      recoveryDesc: 'If you requested this recovery, use the link or token below to view your assignment.',
      participantLink: 'Your participant link',
      participantLinkDesc: 'Use this link to view your assignment:',
      participantToken: 'Your participant token',
      participantTokenDesc: 'Use this token to access:',
      securityNote: 'If you didn\'t request this recovery, you can ignore this email. Your access link remains valid.',
      notYou: 'Wasn\'t you?',
      footer: 'Thank you for using Zava Gift Exchange.',
      headerTitle: 'Link Recovery',
      noTokenMessage: 'This game is not protected. Use the game code to access.'
    },
    pt: {
      subject: `🔑 Recuperação de link - "${game.name}"`,
      greeting: `Olá ${participant.name}!`,
      recoveryRequested: 'Foi solicitada a recuperação do seu link de participante do jogo de Zava Gift Exchange.',
      recoveryDesc: 'Se você solicitou esta recuperação, use o link ou token abaixo para ver sua atribuição.',
      participantLink: 'Seu link de participante',
      participantLinkDesc: 'Use este link para ver sua atribuição:',
      participantToken: 'Seu token de participante',
      participantTokenDesc: 'Use este token para acessar:',
      securityNote: 'Se você não solicitou esta recuperação, pode ignorar este email. Seu link de acesso continua válido.',
      notYou: 'Não foi você?',
      footer: 'Obrigado por usar o Zava Gift Exchange.',
      headerTitle: 'Recuperação de Link',
      noTokenMessage: 'Este jogo não é protegido. Use o código do jogo para acessar.'
    },
    fr: {
      subject: `🔑 Récupération de lien - "${game.name}"`,
      greeting: `Bonjour ${participant.name}!`,
      recoveryRequested: 'Une récupération de lien a été demandée pour votre participation au Zava Gift Exchange.',
      recoveryDesc: 'Si vous avez demandé cette récupération, utilisez le lien ou le jeton ci-dessous pour voir votre attribution.',
      participantLink: 'Votre lien de participant',
      participantLinkDesc: 'Utilisez ce lien pour voir votre attribution:',
      participantToken: 'Votre jeton de participant',
      participantTokenDesc: 'Utilisez ce jeton pour accéder:',
      securityNote: 'Si vous n\'avez pas demandé cette récupération, vous pouvez ignorer cet email. Votre lien d\'accès reste valide.',
      notYou: 'Ce n\'était pas vous?',
      footer: 'Merci d\'utiliser Zava Gift Exchange.',
      headerTitle: 'Récupération de Lien',
      noTokenMessage: 'Ce jeu n\'est pas protégé. Utilisez le code du jeu pour accéder.'
    },
    it: {
      subject: `🔑 Recupero link - "${game.name}"`,
      greeting: `Ciao ${participant.name}!`,
      recoveryRequested: 'È stato richiesto il recupero del tuo link partecipante per il gioco Zava Gift Exchange.',
      recoveryDesc: 'Se hai richiesto questo recupero, usa il link o il token qui sotto per vedere la tua assegnazione.',
      participantLink: 'Il tuo link partecipante',
      participantLinkDesc: 'Usa questo link per vedere la tua assegnazione:',
      participantToken: 'Il tuo token partecipante',
      participantTokenDesc: 'Usa questo token per accedere:',
      securityNote: 'Se non hai richiesto questo recupero, puoi ignorare questa email. Il tuo link di accesso rimane valido.',
      notYou: 'Non sei stato tu?',
      footer: 'Grazie per usare Zava Gift Exchange.',
      headerTitle: 'Recupero Link',
      noTokenMessage: 'Questo gioco non è protetto. Usa il codice del gioco per accedere.'
    },
    ja: {
      subject: `🔑 リンク復旧 - "${game.name}"`,
      greeting: `こんにちは ${participant.name}さん！`,
      recoveryRequested: 'Zava Gift Exchangeゲームの参加者リンクの復旧がリクエストされました。',
      recoveryDesc: 'この復旧をリクエストした場合は、以下のリンクまたはトークンを使用して割り当てを確認してください。',
      participantLink: '参加者リンク',
      participantLinkDesc: 'このリンクを使用して割り当てを確認してください:',
      participantToken: '参加者トークン',
      participantTokenDesc: 'このトークンを使用してアクセスしてください:',
      securityNote: 'この復旧をリクエストしていない場合は、このメールを無視してください。アクセスリンクは引き続き有効です。',
      notYou: '心当たりがない場合',
      footer: 'Zava Gift Exchangeをご利用いただきありがとうございます。',
      headerTitle: 'リンク復旧',
      noTokenMessage: 'このゲームは保護されていません。ゲームコードを使用してアクセスしてください。'
    },
    zh: {
      subject: `🔑 链接恢复 - "${game.name}"`,
      greeting: `您好 ${participant.name}！`,
      recoveryRequested: '已请求恢复您的Zava Gift Exchange游戏参与者链接。',
      recoveryDesc: '如果您请求了此恢复，请使用下面的链接或令牌查看您的分配。',
      participantLink: '您的参与者链接',
      participantLinkDesc: '使用此链接查看您的分配:',
      participantToken: '您的参与者令牌',
      participantTokenDesc: '使用此令牌访问:',
      securityNote: '如果您没有请求此恢复，可以忽略此邮件。您的访问链接仍然有效。',
      notYou: '不是您操作的？',
      footer: '感谢您使用Zava Gift Exchange。',
      headerTitle: '链接恢复',
      noTokenMessage: '此游戏未受保护。使用游戏代码访问。'
    },
    de: {
      subject: `🔑 Link-Wiederherstellung - "${game.name}"`,
      greeting: `Hallo ${participant.name}!`,
      recoveryRequested: 'Eine Link-Wiederherstellung wurde für Ihre Zava Gift Exchange Teilnahme angefordert.',
      recoveryDesc: 'Wenn Sie diese Wiederherstellung angefordert haben, verwenden Sie den Link oder Token unten, um Ihre Zuweisung anzuzeigen.',
      participantLink: 'Ihr Teilnehmer-Link',
      participantLinkDesc: 'Verwenden Sie diesen Link, um Ihre Zuweisung anzuzeigen:',
      participantToken: 'Ihr Teilnehmer-Token',
      participantTokenDesc: 'Verwenden Sie diesen Token für den Zugang:',
      securityNote: 'Wenn Sie diese Wiederherstellung nicht angefordert haben, können Sie diese E-Mail ignorieren. Ihr Zugangslink bleibt gültig.',
      notYou: 'Waren Sie das nicht?',
      footer: 'Vielen Dank für die Nutzung von Zava Gift Exchange.',
      headerTitle: 'Link-Wiederherstellung',
      noTokenMessage: 'Dieses Spiel ist nicht geschützt. Verwenden Sie den Spielcode für den Zugang.'
    },
    nl: {
      subject: `🔑 Link Herstel - "${game.name}"`,
      greeting: `Hallo ${participant.name}!`,
      recoveryRequested: 'Er is een linkherstel aangevraagd voor uw Zava Gift Exchange deelname.',
      recoveryDesc: 'Als u dit herstel heeft aangevraagd, gebruik dan de link of token hieronder om uw toewijzing te bekijken.',
      participantLink: 'Uw deelnemerslink',
      participantLinkDesc: 'Gebruik deze link om uw toewijzing te bekijken:',
      participantToken: 'Uw deelnemerstoken',
      participantTokenDesc: 'Gebruik deze token voor toegang:',
      securityNote: 'Als u dit herstel niet heeft aangevraagd, kunt u deze e-mail negeren. Uw toegangslink blijft geldig.',
      notYou: 'Was u dit niet?',
      footer: 'Bedankt voor het gebruik van Zava Gift Exchange.',
      headerTitle: 'Link Herstel',
      noTokenMessage: 'Dit spel is niet beveiligd. Gebruik de spelcode voor toegang.'
    }
  }

  const t = getTranslation(translations, language)

  // If game is not protected, participant doesn't have a token
  const showLink = hasUrl && hasToken

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t.headerTitle}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 32px; text-align: center;">
              <div style="font-size: 48px; margin-bottom: 16px;">🔑</div>
              <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 600;">${t.headerTitle}</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 16px;">${escapeHtml(game.name)}</p>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">${t.greeting}</p>
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">${t.recoveryRequested}</p>
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">${t.recoveryDesc}</p>
              
              ${hasToken ? `
              <!-- Participant Link/Token -->
              <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                <p style="color: #065f46; font-weight: 600; margin: 0 0 8px 0;">${showLink ? t.participantLink : t.participantToken}</p>
                <p style="color: #6b7280; font-size: 14px; margin: 0 0 12px 0;">${showLink ? t.participantLinkDesc : t.participantTokenDesc}</p>
                ${showLink 
                  ? `<a href="${participantLink}" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">🔗 ${t.participantLink}</a>`
                  : `<code style="display: block; background-color: #f3f4f6; padding: 12px; border-radius: 6px; font-family: monospace; word-break: break-all; color: #374151;">${participant.token}</code>`
                }
              </div>
              ` : `
              <!-- No token message -->
              <div style="background-color: #fef3c7; border: 1px solid #fcd34d; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                <p style="color: #92400e; font-size: 14px; margin: 0;">${t.noTokenMessage}</p>
                <p style="color: #92400e; font-weight: 600; margin: 8px 0 0 0;">Code: ${game.code}</p>
              </div>
              `}
              
              <!-- Security Note -->
              <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                <p style="color: #166534; font-size: 14px; margin: 0;">
                  <strong>${t.notYou}</strong> ${t.securityNote}
                </p>
              </div>
              
              <p style="color: #6b7280; font-size: 14px; margin: 0;">${t.footer}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`

  const plainText = hasToken 
    ? `${t.greeting}\n\n${t.recoveryRequested}\n\n${t.recoveryDesc}\n\n${showLink ? t.participantLink : t.participantToken}\n${showLink ? t.participantLinkDesc : t.participantTokenDesc}\n${showLink ? participantLink : participant.token}\n\n${t.notYou} ${t.securityNote}\n\n${t.footer}`
    : `${t.greeting}\n\n${t.recoveryRequested}\n\n${t.noTokenMessage}\nCode: ${game.code}\n\n${t.notYou} ${t.securityNote}\n\n${t.footer}`

  return { subject: t.subject, html, plainText }
}

// Send email to a participant with their assignment
export async function sendParticipantAssignmentEmail(
  game: Game,
  participant: Participant,
  language: Language = 'es'
): Promise<{ success: boolean; error?: string }> {
  if (!participant.email) {
    return { success: false, error: 'No participant email provided' }
  }

  // Find the assignment for this participant
  const assignment = game.assignments.find(a => a.giverId === participant.id)
  if (!assignment) {
    return { success: false, error: 'No assignment found for participant' }
  }

  const receiver = game.participants.find(p => p.id === assignment.receiverId)
  if (!receiver) {
    return { success: false, error: 'Receiver not found' }
  }

  const { subject, html, plainText } = generateParticipantEmailContent({
    game,
    participant,
    receiver,
    language
  })

  return await sendEmail({
    to: [{ address: participant.email, displayName: participant.name }],
    subject,
    html,
    plainText
  })
}

// Send emails to all participants with emails
export async function sendAllParticipantEmails(
  game: Game,
  language: Language = 'es'
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const results = {
    sent: 0,
    failed: 0,
    errors: [] as string[]
  }

  const participantsWithEmail = game.participants.filter(p => p.email)
  
  for (const participant of participantsWithEmail) {
    const result = await sendParticipantAssignmentEmail(game, participant, language)
    if (result.success) {
      results.sent++
    } else {
      results.failed++
      results.errors.push(`${participant.name}: ${result.error}`)
    }
  }

  return results
}

// ============================================
// PARTICIPANT CONFIRMED EMAIL (to Organizer)
// ============================================
export interface ParticipantConfirmedEmailData {
  game: Game
  participant: Participant
  language: Language
}

export function generateParticipantConfirmedEmailContent(data: ParticipantConfirmedEmailData): { subject: string; html: string; plainText: string } {
  const { game, participant, language } = data
  const baseUrl = getBaseUrl()
  const organizerLink = getOrganizerLink(baseUrl, game.code, game.organizerToken)

  const translations: Partial<Record<Language, {
    subject: string; greeting: string; confirmed: string; participantName: string;
    confirmedAt: string; viewPanel: string; totalConfirmed: string; footer: string;
    confirmationReceived: string;
  }>> = {
    es: {
      subject: `✅ ${participant.name} ha confirmado su asignación en "${game.name}"`,
      greeting: '¡Hola Organizador!',
      confirmed: 'Un participante ha confirmado que recibió su asignación.',
      participantName: 'Participante',
      confirmedAt: 'Confirmado',
      viewPanel: 'Ver panel del organizador',
      totalConfirmed: 'Total confirmados',
      footer: 'Gracias por usar Zava Gift Exchange.',
      confirmationReceived: 'Confirmación Recibida'
    },
    en: {
      subject: `✅ ${participant.name} confirmed their assignment in "${game.name}"`,
      greeting: 'Hello Organizer!',
      confirmed: 'A participant has confirmed they received their assignment.',
      participantName: 'Participant',
      confirmedAt: 'Confirmed',
      viewPanel: 'View organizer panel',
      totalConfirmed: 'Total confirmed',
      footer: 'Thank you for using Zava Gift Exchange.',
      confirmationReceived: 'Confirmation Received'
    },
    pt: {
      subject: `✅ ${participant.name} confirmou sua atribuição em "${game.name}"`,
      greeting: 'Olá Organizador!',
      confirmed: 'Um participante confirmou que recebeu sua atribuição.',
      participantName: 'Participante',
      confirmedAt: 'Confirmado',
      viewPanel: 'Ver painel do organizador',
      totalConfirmed: 'Total confirmados',
      footer: 'Obrigado por usar o Zava Gift Exchange.',
      confirmationReceived: 'Confirmação Recebida'
    },
    fr: {
      subject: `✅ ${participant.name} a confirmé son attribution dans "${game.name}"`,
      greeting: 'Bonjour Organisateur !',
      confirmed: 'Un participant a confirmé avoir reçu son attribution.',
      participantName: 'Participant',
      confirmedAt: 'Confirmé',
      viewPanel: 'Voir le panneau organisateur',
      totalConfirmed: 'Total confirmés',
      footer: 'Merci d\'utiliser Zava Gift Exchange.',
      confirmationReceived: 'Confirmation Reçue'
    },
    it: {
      subject: `✅ ${participant.name} ha confermato la sua assegnazione in "${game.name}"`,
      greeting: 'Ciao Organizzatore!',
      confirmed: 'Un partecipante ha confermato di aver ricevuto la sua assegnazione.',
      participantName: 'Partecipante',
      confirmedAt: 'Confermato',
      viewPanel: 'Vedi pannello organizzatore',
      totalConfirmed: 'Totale confermati',
      footer: 'Grazie per aver usato Zava Gift Exchange.',
      confirmationReceived: 'Conferma Ricevuta'
    },
    ja: {
      subject: `✅ ${participant.name}さんが「${game.name}」の割り当てを確認しました`,
      greeting: 'こんにちは、主催者さん！',
      confirmed: '参加者が割り当てを確認しました。',
      participantName: '参加者',
      confirmedAt: '確認済み',
      viewPanel: '主催者パネルを見る',
      totalConfirmed: '確認済み合計',
      footer: 'Zava ギフト交換をご利用いただきありがとうございます。',
      confirmationReceived: '確認を受信'
    },
    zh: {
      subject: `✅ ${participant.name}已确认"${game.name}"中的分配`,
      greeting: '您好，组织者！',
      confirmed: '一位参与者已确认收到了他们的分配。',
      participantName: '参与者',
      confirmedAt: '已确认',
      viewPanel: '查看组织者面板',
      totalConfirmed: '已确认总数',
      footer: '感谢使用Zava 礼物交换。',
      confirmationReceived: '已收到确认'
    },
    de: {
      subject: `✅ ${participant.name} hat die Zuweisung in "${game.name}" bestätigt`,
      greeting: 'Hallo Organisator!',
      confirmed: 'Ein Teilnehmer hat bestätigt, dass er seine Zuweisung erhalten hat.',
      participantName: 'Teilnehmer',
      confirmedAt: 'Bestätigt',
      viewPanel: 'Organisator-Panel anzeigen',
      totalConfirmed: 'Gesamt bestätigt',
      footer: 'Danke, dass du Zava Geschenktausch verwendest.',
      confirmationReceived: 'Bestätigung erhalten'
    },
    nl: {
      subject: `✅ ${participant.name} heeft de toewijzing bevestigd in "${game.name}"`,
      greeting: 'Hallo Organisator!',
      confirmed: 'Een deelnemer heeft bevestigd dat ze hun toewijzing hebben ontvangen.',
      participantName: 'Deelnemer',
      confirmedAt: 'Bevestigd',
      viewPanel: 'Organisator-paneel bekijken',
      totalConfirmed: 'Totaal bevestigd',
      footer: 'Bedankt voor het gebruik van Zava Gift Exchange.',
      confirmationReceived: 'Bevestiging Ontvangen'
    }
  }

  const t = getTranslation(translations, language)
  const confirmedCount = game.participants.filter(p => p.hasConfirmedAssignment).length
  const totalCount = game.participants.length

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">✅ ${t.confirmationReceived}</h1>
  </div>
  
  <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px;">${t.greeting}</p>
    <p style="font-size: 16px;">${t.confirmed}</p>
    
    <div style="background: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #1e40af;">
      <p style="margin: 0;"><strong>${t.participantName}:</strong> ${escapeHtml(participant.name)}</p>
      <p style="margin: 10px 0 0 0;"><strong>${t.totalConfirmed}:</strong> ${confirmedCount}/${totalCount}</p>
    </div>
    
    <div style="text-align: center; margin: 25px 0;">
      <a href="${organizerLink}" style="display: inline-block; background: #1e40af; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold;">${t.viewPanel}</a>
    </div>
    
    <p style="font-size: 14px; color: #666; margin-top: 30px; text-align: center;">${t.footer}</p>
  </div>
</body>
</html>
`

  const plainText = `${t.greeting}\n\n${t.confirmed}\n\n${t.participantName}: ${participant.name}\n${t.totalConfirmed}: ${confirmedCount}/${totalCount}\n\n${t.viewPanel}: ${organizerLink}\n\n${t.footer}`

  return { subject: t.subject, html, plainText }
}

export async function sendParticipantConfirmedEmail(
  game: Game,
  participant: Participant,
  language: Language = 'es'
): Promise<{ success: boolean; error?: string }> {
  if (!game.organizerEmail) {
    return { success: false, error: 'No organizer email provided' }
  }

  const { subject, html, plainText } = generateParticipantConfirmedEmailContent({ game, participant, language })

  return await sendEmail({
    to: [{ address: game.organizerEmail }],
    subject,
    html,
    plainText
  })
}

// ============================================
// REASSIGNMENT REQUESTED EMAIL (to Organizer)
// ============================================
export interface ReassignmentRequestedEmailData {
  game: Game
  participant: Participant
  language: Language
}

export function generateReassignmentRequestedEmailContent(data: ReassignmentRequestedEmailData): { subject: string; html: string; plainText: string } {
  const { game, participant, language } = data
  const baseUrl = getBaseUrl()
  const organizerLink = getOrganizerLink(baseUrl, game.code, game.organizerToken)

  const translations: Partial<Record<Language, {
    subject: string; greeting: string; requested: string; participantName: string;
    pendingRequests: string; action: string; viewPanel: string; footer: string; newRequest: string;
  }>> = {
    es: {
      subject: `🔄 ${participant.name} solicita una nueva asignación en "${game.name}"`,
      greeting: '¡Hola Organizador!',
      requested: 'Un participante ha solicitado una nueva asignación.',
      participantName: 'Participante',
      pendingRequests: 'Solicitudes pendientes',
      action: 'Puedes aprobar o rechazar esta solicitud desde el panel del organizador.',
      viewPanel: 'Ver panel del organizador',
      footer: 'Gracias por usar Zava Gift Exchange.',
      newRequest: 'Nueva Solicitud'
    },
    en: {
      subject: `🔄 ${participant.name} requests a new assignment in "${game.name}"`,
      greeting: 'Hello Organizer!',
      requested: 'A participant has requested a new assignment.',
      participantName: 'Participant',
      pendingRequests: 'Pending requests',
      action: 'You can approve or reject this request from the organizer panel.',
      viewPanel: 'View organizer panel',
      footer: 'Thank you for using Zava Gift Exchange.',
      newRequest: 'New Request'
    },
    pt: {
      subject: `🔄 ${participant.name} solicita uma nova atribuição em "${game.name}"`,
      greeting: 'Olá Organizador!',
      requested: 'Um participante solicitou uma nova atribuição.',
      participantName: 'Participante',
      pendingRequests: 'Solicitações pendentes',
      action: 'Você pode aprovar ou rejeitar esta solicitação no painel do organizador.',
      viewPanel: 'Ver painel do organizador',
      footer: 'Obrigado por usar o Zava Gift Exchange.',
      newRequest: 'Nova Solicitação'
    },
    fr: {
      subject: `🔄 ${participant.name} demande une nouvelle attribution dans "${game.name}"`,
      greeting: 'Bonjour Organisateur !',
      requested: 'Un participant a demandé une nouvelle attribution.',
      participantName: 'Participant',
      pendingRequests: 'Demandes en attente',
      action: 'Vous pouvez approuver ou rejeter cette demande depuis le panneau organisateur.',
      viewPanel: 'Voir le panneau organisateur',
      footer: 'Merci d\'utiliser Zava Gift Exchange.',
      newRequest: 'Nouvelle Demande'
    },
    it: {
      subject: `🔄 ${participant.name} richiede una nuova assegnazione in "${game.name}"`,
      greeting: 'Ciao Organizzatore!',
      requested: 'Un partecipante ha richiesto una nuova assegnazione.',
      participantName: 'Partecipante',
      pendingRequests: 'Richieste in sospeso',
      action: 'Puoi approvare o rifiutare questa richiesta dal pannello organizzatore.',
      viewPanel: 'Vedi pannello organizzatore',
      footer: 'Grazie per aver usato Zava Gift Exchange.',
      newRequest: 'Nuova Richiesta'
    },
    ja: {
      subject: `🔄 ${participant.name}さんが「${game.name}」で新しい割り当てをリクエストしました`,
      greeting: 'こんにちは、主催者さん！',
      requested: '参加者が新しい割り当てをリクエストしました。',
      participantName: '参加者',
      pendingRequests: '保留中のリクエスト',
      action: '主催者パネルからこのリクエストを承認または拒否できます。',
      viewPanel: '主催者パネルを見る',
      footer: 'Zava ギフト交換をご利用いただきありがとうございます。',
      newRequest: '新しいリクエスト'
    },
    zh: {
      subject: `🔄 ${participant.name}在"${game.name}"中请求新的分配`,
      greeting: '您好，组织者！',
      requested: '一位参与者请求了新的分配。',
      participantName: '参与者',
      pendingRequests: '待处理请求',
      action: '您可以从组织者面板批准或拒绝此请求。',
      viewPanel: '查看组织者面板',
      footer: '感谢使用Zava 礼物交换。',
      newRequest: '新请求'
    },
    de: {
      subject: `🔄 ${participant.name} bittet um eine neue Zuweisung in "${game.name}"`,
      greeting: 'Hallo Organisator!',
      requested: 'Ein Teilnehmer hat eine neue Zuweisung angefordert.',
      participantName: 'Teilnehmer',
      pendingRequests: 'Ausstehende Anfragen',
      action: 'Du kannst diese Anfrage im Organisator-Panel genehmigen oder ablehnen.',
      viewPanel: 'Organisator-Panel anzeigen',
      footer: 'Danke, dass du Zava Geschenktausch verwendest.',
      newRequest: 'Neue Anfrage'
    },
    nl: {
      subject: `🔄 ${participant.name} vraagt een nieuwe toewijzing aan in "${game.name}"`,
      greeting: 'Hallo Organisator!',
      requested: 'Een deelnemer heeft een nieuwe toewijzing aangevraagd.',
      participantName: 'Deelnemer',
      pendingRequests: 'Openstaande verzoeken',
      action: 'Je kunt dit verzoek goedkeuren of afwijzen via het organisator-paneel.',
      viewPanel: 'Organisator-paneel bekijken',
      footer: 'Bedankt voor het gebruik van Zava Gift Exchange.',
      newRequest: 'Nieuw Verzoek'
    }
  }

  const t = getTranslation(translations, language)
  const pendingCount = game.reassignmentRequests?.length || 0

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #f57c00 0%, #e65100 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">🔄 ${t.newRequest}</h1>
  </div>
  
  <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px;">${t.greeting}</p>
    <p style="font-size: 16px;">${t.requested}</p>
    
    <div style="background: #fff3e0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f57c00;">
      <p style="margin: 0;"><strong>${t.participantName}:</strong> ${escapeHtml(participant.name)}</p>
      <p style="margin: 10px 0 0 0;"><strong>${t.pendingRequests}:</strong> ${pendingCount}</p>
    </div>
    
    <p style="font-size: 14px; color: #666;">${t.action}</p>
    
    <div style="text-align: center; margin: 25px 0;">
      <a href="${organizerLink}" style="display: inline-block; background: #f57c00; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold;">${t.viewPanel}</a>
    </div>
    
    <p style="font-size: 14px; color: #666; margin-top: 30px; text-align: center;">${t.footer}</p>
  </div>
</body>
</html>
`

  const plainText = `${t.greeting}\n\n${t.requested}\n\n${t.participantName}: ${participant.name}\n${t.pendingRequests}: ${pendingCount}\n\n${t.action}\n\n${t.viewPanel}: ${organizerLink}\n\n${t.footer}`

  return { subject: t.subject, html, plainText }
}

export async function sendReassignmentRequestedEmail(
  game: Game,
  participant: Participant,
  language: Language = 'es'
): Promise<{ success: boolean; error?: string }> {
  if (!game.organizerEmail) {
    return { success: false, error: 'No organizer email provided' }
  }

  const { subject, html, plainText } = generateReassignmentRequestedEmailContent({ game, participant, language })

  return await sendEmail({
    to: [{ address: game.organizerEmail }],
    subject,
    html,
    plainText
  })
}

// ============================================
// REASSIGNMENT APPROVED/REJECTED EMAIL (to Participant)
// ============================================
export interface ReassignmentResultEmailData {
  game: Game
  participant: Participant
  approved: boolean
  newReceiver?: Participant // Only provided if approved
  language: Language
}

export function generateReassignmentResultEmailContent(data: ReassignmentResultEmailData): { subject: string; html: string; plainText: string } {
  const { game, participant, approved, newReceiver, language } = data

  const translations: Partial<Record<Language, {
    subjectApproved: string; subjectRejected: string; greeting: string; approved: string;
    rejected: string; newAssignment: string; youGiftTo: string; contactOrganizer: string; footer: string;
  }>> = {
    es: {
      subjectApproved: `✅ Tu solicitud de reasignación fue aprobada - "${game.name}"`,
      subjectRejected: `❌ Tu solicitud de reasignación fue rechazada - "${game.name}"`,
      greeting: `¡Hola ${participant.name}!`,
      approved: '¡Tu solicitud de nueva asignación ha sido aprobada!',
      rejected: 'Tu solicitud de nueva asignación ha sido rechazada por el organizador.',
      newAssignment: 'Tu nueva asignación',
      youGiftTo: 'Ahora le regalas a:',
      contactOrganizer: 'Si tienes preguntas, contacta al organizador del evento.',
      footer: 'Gracias por usar Zava Gift Exchange.'
    },
    en: {
      subjectApproved: `✅ Your reassignment request was approved - "${game.name}"`,
      subjectRejected: `❌ Your reassignment request was rejected - "${game.name}"`,
      greeting: `Hello ${participant.name}!`,
      approved: 'Your request for a new assignment has been approved!',
      rejected: 'Your request for a new assignment has been rejected by the organizer.',
      newAssignment: 'Your new assignment',
      youGiftTo: 'You\'re now gifting to:',
      contactOrganizer: 'If you have questions, contact the event organizer.',
      footer: 'Thank you for using Zava Gift Exchange.'
    },
    pt: {
      subjectApproved: `✅ Sua solicitação de reatribuição foi aprovada - "${game.name}"`,
      subjectRejected: `❌ Sua solicitação de reatribuição foi rejeitada - "${game.name}"`,
      greeting: `Olá ${participant.name}!`,
      approved: 'Sua solicitação de nova atribuição foi aprovada!',
      rejected: 'Sua solicitação de nova atribuição foi rejeitada pelo organizador.',
      newAssignment: 'Sua nova atribuição',
      youGiftTo: 'Agora você presenteia:',
      contactOrganizer: 'Se tiver dúvidas, entre em contato com o organizador do evento.',
      footer: 'Obrigado por usar o Zava Gift Exchange.'
    },
    fr: {
      subjectApproved: `✅ Votre demande de réattribution a été approuvée - "${game.name}"`,
      subjectRejected: `❌ Votre demande de réattribution a été refusée - "${game.name}"`,
      greeting: `Bonjour ${participant.name} !`,
      approved: 'Votre demande de nouvelle attribution a été approuvée !',
      rejected: 'Votre demande de nouvelle attribution a été refusée par l\'organisateur.',
      newAssignment: 'Votre nouvelle attribution',
      youGiftTo: 'Vous offrez maintenant à :',
      contactOrganizer: 'Si vous avez des questions, contactez l\'organisateur de l\'événement.',
      footer: 'Merci d\'utiliser Zava Gift Exchange.'
    },
    it: {
      subjectApproved: `✅ La tua richiesta di riassegnazione è stata approvata - "${game.name}"`,
      subjectRejected: `❌ La tua richiesta di riassegnazione è stata rifiutata - "${game.name}"`,
      greeting: `Ciao ${participant.name}!`,
      approved: 'La tua richiesta di nuova assegnazione è stata approvata!',
      rejected: 'La tua richiesta di nuova assegnazione è stata rifiutata dall\'organizzatore.',
      newAssignment: 'La tua nuova assegnazione',
      youGiftTo: 'Ora regali a:',
      contactOrganizer: 'Se hai domande, contatta l\'organizzatore dell\'evento.',
      footer: 'Grazie per aver usato Zava Gift Exchange.'
    },
    ja: {
      subjectApproved: `✅ 再割り当てリクエストが承認されました - 「${game.name}」`,
      subjectRejected: `❌ 再割り当てリクエストが拒否されました - 「${game.name}」`,
      greeting: `こんにちは、${participant.name}さん！`,
      approved: '新しい割り当てのリクエストが承認されました！',
      rejected: '新しい割り当てのリクエストは主催者により拒否されました。',
      newAssignment: '新しい割り当て',
      youGiftTo: 'プレゼントを贈る相手：',
      contactOrganizer: 'ご質問がある場合は、イベント主催者にお問い合わせください。',
      footer: 'Zava ギフト交換をご利用いただきありがとうございます。'
    },
    zh: {
      subjectApproved: `✅ 您的重新分配请求已获批准 - "${game.name}"`,
      subjectRejected: `❌ 您的重新分配请求被拒绝 - "${game.name}"`,
      greeting: `您好，${participant.name}！`,
      approved: '您的新分配请求已获批准！',
      rejected: '您的新分配请求已被组织者拒绝。',
      newAssignment: '您的新分配',
      youGiftTo: '您现在要送礼物给：',
      contactOrganizer: '如有疑问，请联系活动组织者。',
      footer: '感谢使用Zava 礼物交换。'
    },
    de: {
      subjectApproved: `✅ Deine Neuzuweisungsanfrage wurde genehmigt - "${game.name}"`,
      subjectRejected: `❌ Deine Neuzuweisungsanfrage wurde abgelehnt - "${game.name}"`,
      greeting: `Hallo ${participant.name}!`,
      approved: 'Deine Anfrage für eine neue Zuweisung wurde genehmigt!',
      rejected: 'Deine Anfrage für eine neue Zuweisung wurde vom Organisator abgelehnt.',
      newAssignment: 'Deine neue Zuweisung',
      youGiftTo: 'Du beschenkst jetzt:',
      contactOrganizer: 'Bei Fragen wende dich an den Veranstalter.',
      footer: 'Danke, dass du Zava Geschenktausch verwendest.'
    },
    nl: {
      subjectApproved: `✅ Je hertoewijzingsverzoek is goedgekeurd - "${game.name}"`,
      subjectRejected: `❌ Je hertoewijzingsverzoek is afgewezen - "${game.name}"`,
      greeting: `Hallo ${participant.name}!`,
      approved: 'Je verzoek voor een nieuwe toewijzing is goedgekeurd!',
      rejected: 'Je verzoek voor een nieuwe toewijzing is afgewezen door de organisator.',
      newAssignment: 'Je nieuwe toewijzing',
      youGiftTo: 'Je geeft nu een cadeau aan:',
      contactOrganizer: 'Als je vragen hebt, neem contact op met de organisator van het evenement.',
      footer: 'Bedankt voor het gebruik van Zava Gift Exchange.'
    }
  }

  const t = getTranslation(translations, language)
  const subject = approved ? t.subjectApproved : t.subjectRejected

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: ${approved ? 'linear-gradient(135deg, #1e40af 0%, #2e7d32 100%)' : 'linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 100%)'}; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">${approved ? '✅' : '❌'} ${escapeHtml(game.name)}</h1>
  </div>
  
  <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px;">${t.greeting}</p>
    <p style="font-size: 16px;">${approved ? t.approved : t.rejected}</p>
    
    ${approved && newReceiver ? `
    <div style="background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); padding: 25px; border-radius: 12px; margin: 25px 0; text-align: center; color: white;">
      <h2 style="margin: 0 0 15px 0; font-size: 20px;">${t.newAssignment}</h2>
      <p style="margin: 0; font-size: 14px; opacity: 0.9;">${t.youGiftTo}</p>
      <p style="margin: 10px 0 0 0; font-size: 32px; font-weight: bold;">🎄 ${escapeHtml(newReceiver.name)} 🎄</p>
    </div>
    ` : ''}
    
    ${!approved ? `<p style="font-size: 14px; color: #666;">${t.contactOrganizer}</p>` : ''}
    
    <p style="font-size: 14px; color: #666; margin-top: 30px; text-align: center;">${t.footer}</p>
  </div>
</body>
</html>
`

  const plainText = `${t.greeting}\n\n${approved ? t.approved : t.rejected}\n\n${approved && newReceiver ? `${t.youGiftTo} ${newReceiver.name}\n\n` : ''}${!approved ? `${t.contactOrganizer}\n\n` : ''}${t.footer}`

  return { subject, html, plainText }
}

export async function sendReassignmentResultEmail(
  game: Game,
  participant: Participant,
  approved: boolean,
  language: Language = 'es'
): Promise<{ success: boolean; error?: string }> {
  if (!participant.email) {
    return { success: false, error: 'No participant email provided' }
  }

  // Find the new receiver if approved
  let newReceiver: Participant | undefined
  if (approved) {
    const assignment = game.assignments.find(a => a.giverId === participant.id)
    if (assignment) {
      newReceiver = game.participants.find(p => p.id === assignment.receiverId)
    }
  }

  const { subject, html, plainText } = generateReassignmentResultEmailContent({ game, participant, approved, newReceiver, language })

  return await sendEmail({
    to: [{ address: participant.email, displayName: participant.name }],
    subject,
    html,
    plainText
  })
}

// ============================================
// WISH UPDATED EMAIL (to the giver)
// ============================================
export interface WishUpdatedEmailData {
  game: Game
  giver: Participant      // The person who is gifting (receiver of email)
  receiver: Participant   // The person who updated their wish
  language: Language
}

export function generateWishUpdatedEmailContent(data: WishUpdatedEmailData): { subject: string; html: string; plainText: string } {
  const { game, giver, receiver, language } = data

  const translations: Partial<Record<Language, {
    subject: string; greeting: string; updated: string; theirWish: string; theirDesiredGift: string;
    headerTitle: string; footer: string;
  }>> = {
    es: {
      subject: `💡 ${receiver.name} actualizó su lista de deseos - "${game.name}"`,
      greeting: `¡Hola ${giver.name}!`,
      updated: 'La persona a quien le regalas ha actualizado su lista de deseos.',
      theirWish: 'Su nuevo deseo',
      theirDesiredGift: 'Regalo que desea',
      headerTitle: 'Actualización de Deseo',
      footer: 'Gracias por usar Zava Gift Exchange.'
    },
    en: {
      subject: `💡 ${receiver.name} updated their wish list - "${game.name}"`,
      greeting: `Hello ${giver.name}!`,
      updated: 'The person you\'re gifting to has updated their wish list.',
      theirWish: 'Their new wish',
      theirDesiredGift: 'Desired gift',
      headerTitle: 'Wish Updated',
      footer: 'Thank you for using Zava Gift Exchange.'
    },
    pt: {
      subject: `💡 ${receiver.name} atualizou sua lista de desejos - "${game.name}"`,
      greeting: `Olá ${giver.name}!`,
      updated: 'A pessoa para quem você vai dar o presente atualizou sua lista de desejos.',
      theirWish: 'Seu novo desejo',
      theirDesiredGift: 'Presente desejado',
      headerTitle: 'Desejo Atualizado',
      footer: 'Obrigado por usar o Zava Gift Exchange.'
    },
    fr: {
      subject: `💡 ${receiver.name} a mis à jour sa liste de souhaits - "${game.name}"`,
      greeting: `Bonjour ${giver.name} !`,
      updated: 'La personne à qui vous offrez a mis à jour sa liste de souhaits.',
      theirWish: 'Son nouveau souhait',
      theirDesiredGift: 'Cadeau souhaité',
      headerTitle: 'Souhait Mis à Jour',
      footer: 'Merci d\'utiliser Zava Gift Exchange.'
    },
    it: {
      subject: `💡 ${receiver.name} ha aggiornato la sua lista dei desideri - "${game.name}"`,
      greeting: `Ciao ${giver.name}!`,
      updated: 'La persona a cui stai regalando ha aggiornato la sua lista dei desideri.',
      theirWish: 'Il suo nuovo desiderio',
      theirDesiredGift: 'Regalo desiderato',
      headerTitle: 'Desiderio Aggiornato',
      footer: 'Grazie per aver usato Zava Gift Exchange.'
    },
    ja: {
      subject: `💡 ${receiver.name}さんがウィッシュリストを更新しました - 「${game.name}」`,
      greeting: `こんにちは、${giver.name}さん！`,
      updated: 'あなたがプレゼントを贈る相手がウィッシュリストを更新しました。',
      theirWish: '新しいウィッシュ',
      theirDesiredGift: '希望のプレゼント',
      headerTitle: 'ウィッシュ更新',
      footer: 'Zava ギフト交換をご利用いただきありがとうございます。'
    },
    zh: {
      subject: `💡 ${receiver.name}更新了愿望清单 - "${game.name}"`,
      greeting: `您好，${giver.name}！`,
      updated: '您要送礼物的人更新了他们的愿望清单。',
      theirWish: '新的愿望',
      theirDesiredGift: '想要的礼物',
      headerTitle: '愿望已更新',
      footer: '感谢使用Zava 礼物交换。'
    },
    de: {
      subject: `💡 ${receiver.name} hat die Wunschliste aktualisiert - "${game.name}"`,
      greeting: `Hallo ${giver.name}!`,
      updated: 'Die Person, die du beschenkst, hat ihre Wunschliste aktualisiert.',
      theirWish: 'Neuer Wunsch',
      theirDesiredGift: 'Gewünschtes Geschenk',
      headerTitle: 'Wunsch Aktualisiert',
      footer: 'Danke, dass du Zava Geschenktausch verwendest.'
    },
    nl: {
      subject: `💡 ${receiver.name} heeft de verlanglijst bijgewerkt - "${game.name}"`,
      greeting: `Hallo ${giver.name}!`,
      updated: 'De persoon voor wie je een cadeau koopt heeft de verlanglijst bijgewerkt.',
      theirWish: 'Nieuwe wens',
      theirDesiredGift: 'Gewenst cadeau',
      headerTitle: 'Wens Bijgewerkt',
      footer: 'Bedankt voor het gebruik van Zava Gift Exchange.'
    }
  }

  const t = getTranslation(translations, language)

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #9c27b0 0%, #673ab7 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">💡 ${t.headerTitle}</h1>
  </div>
  
  <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px;">${t.greeting}</p>
    <p style="font-size: 16px;">${t.updated}</p>
    
    <div style="background: #f3e5f5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #9c27b0;">
      <p style="margin: 0; font-size: 18px; font-weight: bold;">🎁 ${escapeHtml(receiver.name)}</p>
      ${receiver.wish ? `<p style="margin: 15px 0 0 0;"><strong>${t.theirWish}:</strong> ${escapeHtml(receiver.wish)}</p>` : ''}
      ${receiver.desiredGift ? `<p style="margin: 10px 0 0 0;"><strong>${t.theirDesiredGift}:</strong> ${escapeHtml(receiver.desiredGift)}</p>` : ''}
    </div>
    
    <p style="font-size: 14px; color: #666; margin-top: 30px; text-align: center;">${t.footer}</p>
  </div>
</body>
</html>
`

  const plainText = `${t.greeting}\n\n${t.updated}\n\n🎁 ${receiver.name}\n${receiver.wish ? `${t.theirWish}: ${receiver.wish}\n` : ''}${receiver.desiredGift ? `${t.theirDesiredGift}: ${receiver.desiredGift}\n` : ''}\n\n${t.footer}`

  return { subject: t.subject, html, plainText }
}

export async function sendWishUpdatedEmail(
  game: Game,
  receiver: Participant, // The participant who updated their wish
  language: Language = 'es'
): Promise<{ success: boolean; error?: string }> {
  // Find who is gifting to this receiver
  const assignment = game.assignments.find(a => a.receiverId === receiver.id)
  if (!assignment) {
    return { success: false, error: 'No assignment found' }
  }

  const giver = game.participants.find(p => p.id === assignment.giverId)
  if (!giver || !giver.email) {
    return { success: false, error: 'Giver not found or has no email' }
  }

  const { subject, html, plainText } = generateWishUpdatedEmailContent({ game, giver, receiver, language })

  return await sendEmail({
    to: [{ address: giver.email, displayName: giver.name }],
    subject,
    html,
    plainText
  })
}

// ============================================
// EVENT DETAILS CHANGED EMAIL (to all participants + organizer)
// ============================================
export interface EventDetailsChangedEmailData {
  game: Game
  changes: EventChanges
  language: Language
}

export function generateEventDetailsChangedEmailContent(data: EventDetailsChangedEmailData, recipientName?: string): { subject: string; html: string; plainText: string } {
  const { game, changes, language } = data
  const baseUrl = getBaseUrl()
  const participantLink = getParticipantLink(baseUrl, game.code)

  const translations: Partial<Record<Language, {
    subject: string; greeting: string; changed: string; whatChanged: string; date: string;
    time: string; location: string; notes: string; from: string; to: string;
    currentDetails: string; viewEvent: string; footer: string;
  }>> = {
    es: {
      subject: `📝 Los detalles del evento han cambiado - "${game.name}"`,
      greeting: recipientName ? `¡Hola ${recipientName}!` : '¡Hola!',
      changed: 'Los detalles del evento de Zava Gift Exchange han sido actualizados.',
      whatChanged: '¿Qué cambió?',
      date: 'Fecha',
      time: 'Hora',
      location: 'Lugar',
      notes: 'Notas',
      from: 'Antes',
      to: 'Ahora',
      currentDetails: 'Detalles actuales del evento',
      viewEvent: 'Ver evento',
      footer: 'Gracias por usar Zava Gift Exchange.'
    },
    en: {
      subject: `📝 Event details have changed - "${game.name}"`,
      greeting: recipientName ? `Hello ${recipientName}!` : 'Hello!',
      changed: 'The Zava Gift Exchange event details have been updated.',
      whatChanged: 'What changed?',
      date: 'Date',
      time: 'Time',
      location: 'Location',
      notes: 'Notes',
      from: 'Before',
      to: 'Now',
      currentDetails: 'Current event details',
      viewEvent: 'View event',
      footer: 'Thank you for using Zava Gift Exchange.'
    },
    pt: {
      subject: `📝 Os detalhes do evento mudaram - "${game.name}"`,
      greeting: recipientName ? `Olá ${recipientName}!` : 'Olá!',
      changed: 'Os detalhes do evento Zava Gift Exchange foram atualizados.',
      whatChanged: 'O que mudou?',
      date: 'Data',
      time: 'Hora',
      location: 'Local',
      notes: 'Notas',
      from: 'Antes',
      to: 'Agora',
      currentDetails: 'Detalhes atuais do evento',
      viewEvent: 'Ver evento',
      footer: 'Obrigado por usar o Zava Gift Exchange.'
    },
    fr: {
      subject: `📝 Les détails de l'événement ont changé - "${game.name}"`,
      greeting: recipientName ? `Bonjour ${recipientName} !` : 'Bonjour !',
      changed: 'Les détails de l\'événement Zava Gift Exchange ont été mis à jour.',
      whatChanged: 'Qu\'est-ce qui a changé ?',
      date: 'Date',
      time: 'Heure',
      location: 'Lieu',
      notes: 'Notes',
      from: 'Avant',
      to: 'Maintenant',
      currentDetails: 'Détails actuels de l\'événement',
      viewEvent: 'Voir l\'événement',
      footer: 'Merci d\'utiliser Zava Gift Exchange.'
    },
    it: {
      subject: `📝 I dettagli dell'evento sono cambiati - "${game.name}"`,
      greeting: recipientName ? `Ciao ${recipientName}!` : 'Ciao!',
      changed: 'I dettagli dell\'evento Zava Gift Exchange sono stati aggiornati.',
      whatChanged: 'Cosa è cambiato?',
      date: 'Data',
      time: 'Ora',
      location: 'Luogo',
      notes: 'Note',
      from: 'Prima',
      to: 'Adesso',
      currentDetails: 'Dettagli attuali dell\'evento',
      viewEvent: 'Visualizza evento',
      footer: 'Grazie per aver usato Zava Gift Exchange.'
    },
    ja: {
      subject: `📝 イベントの詳細が変更されました - 「${game.name}」`,
      greeting: recipientName ? `こんにちは、${recipientName}さん！` : 'こんにちは！',
      changed: 'Zava ギフト交換イベントの詳細が更新されました。',
      whatChanged: '変更内容',
      date: '日付',
      time: '時間',
      location: '場所',
      notes: 'メモ',
      from: '変更前',
      to: '変更後',
      currentDetails: '現在のイベント詳細',
      viewEvent: 'イベントを見る',
      footer: 'Zava ギフト交換をご利用いただきありがとうございます。'
    },
    zh: {
      subject: `📝 活动详情已更改 - "${game.name}"`,
      greeting: recipientName ? `您好，${recipientName}！` : '您好！',
      changed: 'Zava 礼物交换活动详情已更新。',
      whatChanged: '有什么变化？',
      date: '日期',
      time: '时间',
      location: '地点',
      notes: '备注',
      from: '之前',
      to: '现在',
      currentDetails: '当前活动详情',
      viewEvent: '查看活动',
      footer: '感谢使用Zava 礼物交换。'
    },
    de: {
      subject: `📝 Die Veranstaltungsdetails haben sich geändert - "${game.name}"`,
      greeting: recipientName ? `Hallo ${recipientName}!` : 'Hallo!',
      changed: 'Die Details der Zava Geschenktausch-Veranstaltung wurden aktualisiert.',
      whatChanged: 'Was hat sich geändert?',
      date: 'Datum',
      time: 'Uhrzeit',
      location: 'Ort',
      notes: 'Notizen',
      from: 'Vorher',
      to: 'Jetzt',
      currentDetails: 'Aktuelle Veranstaltungsdetails',
      viewEvent: 'Veranstaltung anzeigen',
      footer: 'Danke, dass du Zava Geschenktausch verwendest.'
    },
    nl: {
      subject: `📝 Evenementdetails zijn gewijzigd - "${game.name}"`,
      greeting: recipientName ? `Hallo ${recipientName}!` : 'Hallo!',
      changed: 'De details van het Zava Gift Exchange-evenement zijn bijgewerkt.',
      whatChanged: 'Wat is er veranderd?',
      date: 'Datum',
      time: 'Tijd',
      location: 'Locatie',
      notes: 'Opmerkingen',
      from: 'Voorheen',
      to: 'Nu',
      currentDetails: 'Huidige evenementdetails',
      viewEvent: 'Bekijk evenement',
      footer: 'Bedankt voor het gebruik van Zava Gift Exchange.'
    }
  }

  const t = getTranslation(translations, language)

  let changesHtml = ''
  let changesText = ''

  if (changes.date) {
    changesHtml += `<tr><td style="padding: 8px; font-weight: bold;">${t.date}</td><td style="padding: 8px; text-decoration: line-through; color: #999;">${changes.date.old || '-'}</td><td style="padding: 8px; color: #1e40af; font-weight: bold;">${changes.date.new}</td></tr>`
    changesText += `${t.date}: ${changes.date.old || '-'} → ${changes.date.new}\n`
  }
  if (changes.time) {
    changesHtml += `<tr><td style="padding: 8px; font-weight: bold;">${t.time}</td><td style="padding: 8px; text-decoration: line-through; color: #999;">${changes.time.old || '-'}</td><td style="padding: 8px; color: #1e40af; font-weight: bold;">${changes.time.new || '-'}</td></tr>`
    changesText += `${t.time}: ${changes.time.old || '-'} → ${changes.time.new || '-'}\n`
  }
  if (changes.location) {
    changesHtml += `<tr><td style="padding: 8px; font-weight: bold;">${t.location}</td><td style="padding: 8px; text-decoration: line-through; color: #999;">${escapeHtml(changes.location.old) || '-'}</td><td style="padding: 8px; color: #1e40af; font-weight: bold;">${escapeHtml(changes.location.new) || '-'}</td></tr>`
    changesText += `${t.location}: ${changes.location.old || '-'} → ${changes.location.new}\n`
  }
  if (changes.generalNotes) {
    changesHtml += `<tr><td style="padding: 8px; font-weight: bold;">${t.notes}</td><td style="padding: 8px; text-decoration: line-through; color: #999;">${escapeHtml(changes.generalNotes.old) || '-'}</td><td style="padding: 8px; color: #1e40af; font-weight: bold;">${escapeHtml(changes.generalNotes.new) || '-'}</td></tr>`
    changesText += `${t.notes}: ${changes.generalNotes.old || '-'} → ${changes.generalNotes.new}\n`
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1976d2 0%, #2196f3 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">📝 ${escapeHtml(game.name)}</h1>
  </div>
  
  <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px;">${t.greeting}</p>
    <p style="font-size: 16px;">${t.changed}</p>
    
    <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="margin-top: 0; color: #1976d2;">${t.whatChanged}</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr style="background: #bbdefb;"><th style="padding: 8px; text-align: left;"></th><th style="padding: 8px; text-align: left;">${t.from}</th><th style="padding: 8px; text-align: left;">${t.to}</th></tr>
        ${changesHtml}
      </table>
    </div>
    
    <div style="text-align: center; margin: 25px 0;">
      <a href="${participantLink}" style="display: inline-block; background: #1976d2; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold;">${t.viewEvent}</a>
    </div>
    
    <p style="font-size: 14px; color: #666; margin-top: 30px; text-align: center;">${t.footer}</p>
  </div>
</body>
</html>
`

  const plainText = `${t.greeting}\n\n${t.changed}\n\n${t.whatChanged}:\n${changesText}\n${t.viewEvent}: ${participantLink}\n\n${t.footer}`

  return { subject: t.subject, html, plainText }
}

export async function sendEventDetailsChangedEmails(
  game: Game,
  changes: EventChanges,
  language: Language = 'es'
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const results = {
    sent: 0,
    failed: 0,
    errors: [] as string[]
  }

  // Collect all recipients (organizer + participants with email)
  const recipients: Array<{ email: string; name?: string }> = []
  
  if (game.organizerEmail) {
    recipients.push({ email: game.organizerEmail, name: undefined })
  }
  
  for (const participant of game.participants) {
    if (participant.email && participant.email !== game.organizerEmail) {
      recipients.push({ email: participant.email, name: participant.name })
    }
  }

  for (const recipient of recipients) {
    const { subject, html, plainText } = generateEventDetailsChangedEmailContent({ game, changes, language }, recipient.name)
    const result = await sendEmail({
      to: [{ address: recipient.email, displayName: recipient.name }],
      subject,
      html,
      plainText
    })
    
    if (result.success) {
      results.sent++
    } else {
      results.failed++
      results.errors.push(`${recipient.name || recipient.email}: ${result.error}`)
    }
  }

  return results
}

// ============================================
// REMINDER EMAIL (to specific participant(s))
// ============================================
export interface ReminderEmailData {
  game: Game
  participant?: Participant // If provided, send to specific participant
  customMessage?: string
  language: Language
}

export function generateReminderEmailContent(data: ReminderEmailData, recipientName: string): { subject: string; html: string; plainText: string } {
  const { game, customMessage, language } = data
  const baseUrl = getBaseUrl()
  const participantLink = getParticipantLink(baseUrl, game.code)
  const currencySymbol = getCurrencySymbol(game.currency)

  const translations: Partial<Record<Language, {
    subject: string; greeting: string; reminder: string; customMessageLabel: string;
    eventDetails: string; name: string; date: string; time: string; location: string;
    amount: string; notes: string; confirmReminder: string; viewEvent: string;
    headerTitle: string; footer: string;
  }>> = {
    es: {
      subject: `🔔 Recordatorio: Zava Gift Exchange "${game.name}"`,
      greeting: `¡Hola ${recipientName}!`,
      reminder: 'Este es un recordatorio sobre el evento de Zava Gift Exchange.',
      customMessageLabel: 'Mensaje del organizador',
      eventDetails: 'Detalles del evento',
      name: 'Evento',
      date: 'Fecha',
      time: 'Hora',
      location: 'Lugar',
      amount: 'Monto sugerido',
      notes: 'Notas',
      confirmReminder: 'Por favor confirma tu participación si aún no lo has hecho.',
      viewEvent: 'Ver evento',
      headerTitle: 'Recordatorio',
      footer: 'Gracias por usar Zava Gift Exchange.'
    },
    en: {
      subject: `🔔 Reminder: Zava Gift Exchange "${game.name}"`,
      greeting: `Hello ${recipientName}!`,
      reminder: 'This is a reminder about the Zava Gift Exchange event.',
      customMessageLabel: 'Message from organizer',
      eventDetails: 'Event details',
      name: 'Event',
      date: 'Date',
      time: 'Time',
      location: 'Location',
      amount: 'Suggested amount',
      notes: 'Notes',
      confirmReminder: 'Please confirm your participation if you haven\'t already.',
      viewEvent: 'View event',
      headerTitle: 'Reminder',
      footer: 'Thank you for using Zava Gift Exchange.'
    },
    pt: {
      subject: `🔔 Lembrete: Zava Gift Exchange "${game.name}"`,
      greeting: `Olá ${recipientName}!`,
      reminder: 'Este é um lembrete sobre o evento Zava Gift Exchange.',
      customMessageLabel: 'Mensagem do organizador',
      eventDetails: 'Detalhes do evento',
      name: 'Evento',
      date: 'Data',
      time: 'Hora',
      location: 'Local',
      amount: 'Valor sugerido',
      notes: 'Notas',
      confirmReminder: 'Por favor, confirme sua participação se ainda não o fez.',
      viewEvent: 'Ver evento',
      headerTitle: 'Lembrete',
      footer: 'Obrigado por usar o Zava Gift Exchange.'
    },
    fr: {
      subject: `🔔 Rappel : Zava Gift Exchange "${game.name}"`,
      greeting: `Bonjour ${recipientName} !`,
      reminder: 'Ceci est un rappel concernant l\'événement Zava Gift Exchange.',
      customMessageLabel: 'Message de l\'organisateur',
      eventDetails: 'Détails de l\'événement',
      name: 'Événement',
      date: 'Date',
      time: 'Heure',
      location: 'Lieu',
      amount: 'Montant suggéré',
      notes: 'Notes',
      confirmReminder: 'Veuillez confirmer votre participation si vous ne l\'avez pas encore fait.',
      viewEvent: 'Voir l\'événement',
      headerTitle: 'Rappel',
      footer: 'Merci d\'utiliser Zava Gift Exchange.'
    },
    it: {
      subject: `🔔 Promemoria: Zava Gift Exchange "${game.name}"`,
      greeting: `Ciao ${recipientName}!`,
      reminder: 'Questo è un promemoria sull\'evento Zava Gift Exchange.',
      customMessageLabel: 'Messaggio dall\'organizzatore',
      eventDetails: 'Dettagli dell\'evento',
      name: 'Evento',
      date: 'Data',
      time: 'Ora',
      location: 'Luogo',
      amount: 'Importo suggerito',
      notes: 'Note',
      confirmReminder: 'Per favore conferma la tua partecipazione se non l\'hai ancora fatto.',
      viewEvent: 'Visualizza evento',
      headerTitle: 'Promemoria',
      footer: 'Grazie per aver usato Zava Gift Exchange.'
    },
    ja: {
      subject: `🔔 リマインダー：Zava ギフト交換「${game.name}」`,
      greeting: `こんにちは、${recipientName}さん！`,
      reminder: 'Zava ギフト交換イベントのリマインダーです。',
      customMessageLabel: '主催者からのメッセージ',
      eventDetails: 'イベント詳細',
      name: 'イベント',
      date: '日付',
      time: '時間',
      location: '場所',
      amount: '推奨金額',
      notes: 'メモ',
      confirmReminder: 'まだの場合は、参加を確認してください。',
      viewEvent: 'イベントを見る',
      headerTitle: 'リマインダー',
      footer: 'Zava ギフト交換をご利用いただきありがとうございます。'
    },
    zh: {
      subject: `🔔 提醒：Zava 礼物交换"${game.name}"`,
      greeting: `您好，${recipientName}！`,
      reminder: '这是关于Zava 礼物交换活动的提醒。',
      customMessageLabel: '组织者的消息',
      eventDetails: '活动详情',
      name: '活动',
      date: '日期',
      time: '时间',
      location: '地点',
      amount: '建议金额',
      notes: '备注',
      confirmReminder: '如果您还没有确认，请确认您的参与。',
      viewEvent: '查看活动',
      headerTitle: '提醒',
      footer: '感谢使用Zava 礼物交换。'
    },
    de: {
      subject: `🔔 Erinnerung: Zava Geschenktausch "${game.name}"`,
      greeting: `Hallo ${recipientName}!`,
      reminder: 'Dies ist eine Erinnerung an die Zava Geschenktausch-Veranstaltung.',
      customMessageLabel: 'Nachricht vom Organisator',
      eventDetails: 'Veranstaltungsdetails',
      name: 'Veranstaltung',
      date: 'Datum',
      time: 'Uhrzeit',
      location: 'Ort',
      amount: 'Empfohlener Betrag',
      notes: 'Notizen',
      confirmReminder: 'Bitte bestätige deine Teilnahme, falls du es noch nicht getan hast.',
      viewEvent: 'Veranstaltung anzeigen',
      headerTitle: 'Erinnerung',
      footer: 'Danke, dass du Zava Geschenktausch verwendest.'
    },
    nl: {
      subject: `🔔 Herinnering: Zava Gift Exchange "${game.name}"`,
      greeting: `Hallo ${recipientName}!`,
      reminder: 'Dit is een herinnering over het Zava Gift Exchange-evenement.',
      customMessageLabel: 'Bericht van de organisator',
      eventDetails: 'Evenementdetails',
      name: 'Evenement',
      date: 'Datum',
      time: 'Tijd',
      location: 'Locatie',
      amount: 'Voorgesteld bedrag',
      notes: 'Opmerkingen',
      confirmReminder: 'Bevestig je deelname als je dat nog niet hebt gedaan.',
      viewEvent: 'Bekijk evenement',
      headerTitle: 'Herinnering',
      footer: 'Bedankt voor het gebruik van Zava Gift Exchange.'
    }
  }

  const t = getTranslation(translations, language)

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">🔔 ${t.headerTitle}</h1>
  </div>
  
  <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px;">${t.greeting}</p>
    <p style="font-size: 16px;">${t.reminder}</p>
    
    ${customMessage ? `
    <div style="background: #fff3e0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f57c00;">
      <h3 style="margin-top: 0; color: #e65100;">💬 ${t.customMessageLabel}</h3>
      <p style="margin: 0;">${escapeHtml(customMessage)}</p>
    </div>
    ` : ''}
    
    <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="margin-top: 0; color: #1e40af;">📋 ${t.eventDetails}</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 6px 0; font-weight: bold;">${t.name}:</td><td style="padding: 6px 0;">${escapeHtml(game.name)}</td></tr>
        ${game.date ? `<tr><td style="padding: 6px 0; font-weight: bold;">${t.date}:</td><td style="padding: 6px 0;">${game.date}</td></tr>` : ''}
        ${game.time ? `<tr><td style="padding: 6px 0; font-weight: bold;">${t.time}:</td><td style="padding: 6px 0;">${game.time}</td></tr>` : ''}
        ${game.location ? `<tr><td style="padding: 6px 0; font-weight: bold;">${t.location}:</td><td style="padding: 6px 0;">${escapeHtml(game.location)}</td></tr>` : ''}
        ${game.amount ? `<tr><td style="padding: 6px 0; font-weight: bold;">${t.amount}:</td><td style="padding: 6px 0;">${currencySymbol}${escapeHtml(game.amount)}</td></tr>` : ''}
      </table>
      ${game.generalNotes ? `<div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e0e0e0;"><strong>${t.notes}:</strong><br>${escapeHtml(game.generalNotes)}</div>` : ''}
    </div>
    
    <p style="font-size: 14px; color: #666; text-align: center;">${t.confirmReminder}</p>
    
    <div style="text-align: center; margin: 25px 0;">
      <a href="${participantLink}" style="display: inline-block; background: #1e40af; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold;">${t.viewEvent}</a>
    </div>
    
    <p style="font-size: 14px; color: #666; margin-top: 30px; text-align: center;">${t.footer}</p>
  </div>
</body>
</html>
`

  const plainText = `${t.greeting}\n\n${t.reminder}\n\n${customMessage ? `${t.customMessageLabel}:\n${customMessage}\n\n` : ''}${t.eventDetails}:\n- ${t.name}: ${game.name}\n${game.date ? `- ${t.date}: ${game.date}\n` : ''}${game.time ? `- ${t.time}: ${game.time}\n` : ''}${game.location ? `- ${t.location}: ${game.location}\n` : ''}${game.amount ? `- ${t.amount}: ${currencySymbol}${game.amount}\n` : ''}${game.generalNotes ? `- ${t.notes}: ${game.generalNotes}\n` : ''}\n${t.confirmReminder}\n\n${t.viewEvent}: ${participantLink}\n\n${t.footer}`

  return { subject: t.subject, html, plainText }
}

export async function sendReminderEmail(
  game: Game,
  participant: Participant,
  customMessage?: string,
  language: Language = 'es'
): Promise<{ success: boolean; error?: string }> {
  if (!participant.email) {
    return { success: false, error: 'No participant email provided' }
  }

  const { subject, html, plainText } = generateReminderEmailContent({ game, customMessage, language }, participant.name)

  return await sendEmail({
    to: [{ address: participant.email, displayName: participant.name }],
    subject,
    html,
    plainText
  })
}

export async function sendReminderToAllParticipants(
  game: Game,
  customMessage?: string,
  language: Language = 'es'
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const results = {
    sent: 0,
    failed: 0,
    errors: [] as string[]
  }

  const participantsWithEmail = game.participants.filter(p => p.email)
  
  for (const participant of participantsWithEmail) {
    const result = await sendReminderEmail(game, participant, customMessage, language)
    if (result.success) {
      results.sent++
    } else {
      results.failed++
      results.errors.push(`${participant.name}: ${result.error}`)
    }
  }

  return results
}

// ============================================
// PARTICIPANT INVITATION EMAIL (when added to existing game)
// ============================================
export interface ParticipantInvitationEmailData {
  game: Game
  participant: Participant
  language: Language
}

export function generateParticipantInvitationEmailContent(data: ParticipantInvitationEmailData): { subject: string; html: string; plainText: string } {
  const { game, participant, language } = data
  const baseUrl = getBaseUrl()
  const participantLink = getParticipantLink(baseUrl, game.code)
  const currencySymbol = getCurrencySymbol(game.currency)

  const translations: Partial<Record<Language, {
    subject: string; greeting: string; invited: string; eventDetails: string; name: string;
    date: string; time: string; location: string; amount: string; notes: string;
    action: string; viewEvent: string; footer: string;
  }>> = {
    es: {
      subject: `🎁 Has sido invitado al Zava Gift Exchange "${game.name}"`,
      greeting: `¡Hola ${participant.name}!`,
      invited: 'Has sido agregado a un juego de Zava Gift Exchange.',
      eventDetails: 'Detalles del evento',
      name: 'Evento',
      date: 'Fecha',
      time: 'Hora',
      location: 'Lugar',
      amount: 'Monto sugerido',
      notes: 'Notas del organizador',
      action: 'Visita el enlace para ver tu asignación y agregar tu lista de deseos.',
      viewEvent: 'Ver mi asignación',
      footer: '¡Que disfrutes el intercambio de regalos!'
    },
    en: {
      subject: `🎁 You've been invited to Zava Gift Exchange "${game.name}"`,
      greeting: `Hello ${participant.name}!`,
      invited: 'You have been added to a Zava Gift Exchange game.',
      eventDetails: 'Event details',
      name: 'Event',
      date: 'Date',
      time: 'Time',
      location: 'Location',
      amount: 'Suggested amount',
      notes: 'Organizer notes',
      action: 'Visit the link to see your assignment and add your wish list.',
      viewEvent: 'View my assignment',
      footer: 'Enjoy the gift exchange!'
    },
    pt: {
      subject: `🎁 Você foi convidado para o Zava Gift Exchange "${game.name}"`,
      greeting: `Olá ${participant.name}!`,
      invited: 'Você foi adicionado a um jogo de Zava Gift Exchange.',
      eventDetails: 'Detalhes do evento',
      name: 'Evento',
      date: 'Data',
      time: 'Hora',
      location: 'Local',
      amount: 'Valor sugerido',
      notes: 'Notas do organizador',
      action: 'Visite o link para ver sua atribuição e adicionar sua lista de desejos.',
      viewEvent: 'Ver minha atribuição',
      footer: 'Aproveite a troca de presentes!'
    },
    fr: {
      subject: `🎁 Vous avez été invité au Zava Gift Exchange "${game.name}"`,
      greeting: `Bonjour ${participant.name} !`,
      invited: 'Vous avez été ajouté à un jeu Zava Gift Exchange.',
      eventDetails: 'Détails de l\'événement',
      name: 'Événement',
      date: 'Date',
      time: 'Heure',
      location: 'Lieu',
      amount: 'Montant suggéré',
      notes: 'Notes de l\'organisateur',
      action: 'Visitez le lien pour voir votre attribution et ajouter votre liste de souhaits.',
      viewEvent: 'Voir mon attribution',
      footer: 'Profitez de l\'échange de cadeaux !'
    },
    it: {
      subject: `🎁 Sei stato invitato al Zava Gift Exchange "${game.name}"`,
      greeting: `Ciao ${participant.name}!`,
      invited: 'Sei stato aggiunto a un gioco di Zava Gift Exchange.',
      eventDetails: 'Dettagli dell\'evento',
      name: 'Evento',
      date: 'Data',
      time: 'Ora',
      location: 'Luogo',
      amount: 'Importo suggerito',
      notes: 'Note dell\'organizzatore',
      action: 'Visita il link per vedere la tua assegnazione e aggiungere la tua lista dei desideri.',
      viewEvent: 'Vedi la mia assegnazione',
      footer: 'Goditi lo scambio di regali!'
    },
    ja: {
      subject: `🎁 Zava ギフト交換「${game.name}」に招待されました`,
      greeting: `こんにちは、${participant.name}さん！`,
      invited: 'Zava ギフト交換ゲームに追加されました。',
      eventDetails: 'イベント詳細',
      name: 'イベント',
      date: '日付',
      time: '時間',
      location: '場所',
      amount: '推奨金額',
      notes: '主催者からのメモ',
      action: 'リンクにアクセスして、割り当てを確認し、ウィッシュリストを追加してください。',
      viewEvent: '割り当てを見る',
      footer: 'プレゼント交換をお楽しみください！'
    },
    zh: {
      subject: `🎁 您已被邀请参加Zava 礼物交换"${game.name}"`,
      greeting: `您好，${participant.name}！`,
      invited: '您已被添加到Zava 礼物交换游戏中。',
      eventDetails: '活动详情',
      name: '活动',
      date: '日期',
      time: '时间',
      location: '地点',
      amount: '建议金额',
      notes: '组织者备注',
      action: '访问链接查看您的分配并添加您的愿望清单。',
      viewEvent: '查看我的分配',
      footer: '祝您礼物交换愉快！'
    },
    de: {
      subject: `🎁 Du wurdest zum Zava Geschenktausch "${game.name}" eingeladen`,
      greeting: `Hallo ${participant.name}!`,
      invited: 'Du wurdest zu einem Zava Geschenktausch-Spiel hinzugefügt.',
      eventDetails: 'Veranstaltungsdetails',
      name: 'Veranstaltung',
      date: 'Datum',
      time: 'Uhrzeit',
      location: 'Ort',
      amount: 'Empfohlener Betrag',
      notes: 'Notizen des Organisators',
      action: 'Besuche den Link, um deine Zuweisung zu sehen und deine Wunschliste hinzuzufügen.',
      viewEvent: 'Meine Zuweisung ansehen',
      footer: 'Viel Spaß beim Geschenkaustausch!'
    },
    nl: {
      subject: `🎁 Je bent uitgenodigd voor Zava Gift Exchange "${game.name}"`,
      greeting: `Hallo ${participant.name}!`,
      invited: 'Je bent toegevoegd aan een Zava Gift Exchange-spel.',
      eventDetails: 'Evenementdetails',
      name: 'Evenement',
      date: 'Datum',
      time: 'Tijd',
      location: 'Locatie',
      amount: 'Voorgesteld bedrag',
      notes: 'Opmerkingen van de organisator',
      action: 'Bezoek de link om je toewijzing te zien en je verlanglijst toe te voegen.',
      viewEvent: 'Bekijk mijn toewijzing',
      footer: 'Veel plezier met de cadeauuitwisseling!'
    }
  }

  const t = getTranslation(translations, language)

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">🎁 Zava Gift Exchange</h1>
  </div>
  
  <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 18px; font-weight: bold;">${t.greeting}</p>
    <p style="font-size: 16px;">${t.invited}</p>
    
    <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="margin-top: 0; color: #1e40af;">📋 ${t.eventDetails}</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 6px 0; font-weight: bold;">${t.name}:</td><td style="padding: 6px 0;">${escapeHtml(game.name)}</td></tr>
        ${game.date ? `<tr><td style="padding: 6px 0; font-weight: bold;">${t.date}:</td><td style="padding: 6px 0;">${game.date}</td></tr>` : ''}
        ${game.time ? `<tr><td style="padding: 6px 0; font-weight: bold;">${t.time}:</td><td style="padding: 6px 0;">${game.time}</td></tr>` : ''}
        ${game.location ? `<tr><td style="padding: 6px 0; font-weight: bold;">${t.location}:</td><td style="padding: 6px 0;">${escapeHtml(game.location)}</td></tr>` : ''}
        ${game.amount ? `<tr><td style="padding: 6px 0; font-weight: bold;">${t.amount}:</td><td style="padding: 6px 0;">${currencySymbol}${escapeHtml(game.amount)}</td></tr>` : ''}
      </table>
      ${game.generalNotes ? `<div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e0e0e0;"><strong>${t.notes}:</strong><br>${escapeHtml(game.generalNotes)}</div>` : ''}
    </div>
    
    <p style="font-size: 14px; color: #666; text-align: center;">${t.action}</p>
    
    <div style="text-align: center; margin: 25px 0;">
      <a href="${participantLink}" style="display: inline-block; background: #1e40af; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">${t.viewEvent}</a>
    </div>
    
    <p style="font-size: 14px; color: #666; margin-top: 30px; text-align: center;">${t.footer}</p>
  </div>
</body>
</html>
`

  const plainText = `${t.greeting}\n\n${t.invited}\n\n${t.eventDetails}:\n- ${t.name}: ${game.name}\n${game.date ? `- ${t.date}: ${game.date}\n` : ''}${game.time ? `- ${t.time}: ${game.time}\n` : ''}${game.location ? `- ${t.location}: ${game.location}\n` : ''}${game.amount ? `- ${t.amount}: ${currencySymbol}${game.amount}\n` : ''}${game.generalNotes ? `- ${t.notes}: ${game.generalNotes}\n` : ''}\n${t.action}\n\n${t.viewEvent}: ${participantLink}\n\n${t.footer}`

  return { subject: t.subject, html, plainText }
}

export async function sendParticipantInvitationEmail(
  game: Game,
  participant: Participant,
  language: Language = 'es'
): Promise<{ success: boolean; error?: string }> {
  if (!participant.email) {
    return { success: false, error: 'No participant email provided' }
  }

  const { subject, html, plainText } = generateParticipantInvitationEmailContent({ game, participant, language })

  return await sendEmail({
    to: [{ address: participant.email, displayName: participant.name }],
    subject,
    html,
    plainText
  })
}

// ============================================
// FULL REASSIGNMENT EMAIL (to confirmed participants)
// ============================================
export interface FullReassignmentEmailData {
  game: Game
  participant: Participant
  newReceiver: Participant
  language: Language
}

export function generateFullReassignmentEmailContent(data: FullReassignmentEmailData): { subject: string; html: string; plainText: string } {
  const { game, participant, newReceiver, language } = data
  const baseUrl = getBaseUrl()
  const hasUrl = hasBaseUrl()
  const participantLink = hasUrl ? getParticipantLink(baseUrl, game.code) : ''

  const translations: Partial<Record<Language, {
    subject: string; greeting: string; intro: string; newAssignment: string; youGiftTo: string;
    theirWish: string; noWish: string; confirmAgain: string; viewEvent: string; gameCode: string;
    gameCodeDesc: string; footer: string; keepSecret: string; headerTitle: string;
  }>> = {
    es: {
      subject: `🔄 Nueva asignación en "${game.name}" - Reasignación del organizador`,
      greeting: `¡Hola ${participant.name}!`,
      intro: 'El organizador ha realizado una reasignación completa del juego de Zava Gift Exchange.',
      newAssignment: '¡Tu nueva asignación está lista!',
      youGiftTo: 'Ahora le regalas a:',
      theirWish: 'Su deseo de regalo:',
      noWish: 'Aún no ha agregado un deseo',
      confirmAgain: 'Por favor revisa y confirma tu nueva asignación.',
      viewEvent: 'Ver mi nueva asignación',
      gameCode: 'Código del juego',
      gameCodeDesc: 'Usa este código para acceder al juego:',
      footer: '¡Que disfrutes el intercambio de regalos!',
      keepSecret: '🤫 Recuerda: ¡mantén en secreto a quién le regalas!',
      headerTitle: 'Nueva Asignación'
    },
    en: {
      subject: `🔄 New assignment in "${game.name}" - Organizer reassignment`,
      greeting: `Hello ${participant.name}!`,
      intro: 'The organizer has performed a full reassignment of the Zava Gift Exchange game.',
      newAssignment: 'Your new assignment is ready!',
      youGiftTo: 'You\'re now gifting to:',
      theirWish: 'Their gift wish:',
      noWish: 'Haven\'t added a wish yet',
      confirmAgain: 'Please review and confirm your new assignment.',
      viewEvent: 'View my new assignment',
      gameCode: 'Game code',
      gameCodeDesc: 'Use this code to access the game:',
      footer: 'Enjoy the gift exchange!',
      keepSecret: '🤫 Remember: keep your assignment a secret!',
      headerTitle: 'New Assignment'
    },
    pt: {
      subject: `🔄 Nova atribuição em "${game.name}" - Reatribuição do organizador`,
      greeting: `Olá ${participant.name}!`,
      intro: 'O organizador realizou uma reatribuição completa do jogo Zava Gift Exchange.',
      newAssignment: 'Sua nova atribuição está pronta!',
      youGiftTo: 'Agora você presenteia:',
      theirWish: 'Desejo de presente:',
      noWish: 'Ainda não adicionou um desejo',
      confirmAgain: 'Por favor, revise e confirme sua nova atribuição.',
      viewEvent: 'Ver minha nova atribuição',
      gameCode: 'Código do jogo',
      gameCodeDesc: 'Use este código para acessar o jogo:',
      footer: 'Aproveite a troca de presentes!',
      keepSecret: '🤫 Lembre-se: mantenha em segredo para quem você vai dar o presente!',
      headerTitle: 'Nova Atribuição'
    },
    fr: {
      subject: `🔄 Nouvelle attribution dans "${game.name}" - Réattribution par l'organisateur`,
      greeting: `Bonjour ${participant.name} !`,
      intro: 'L\'organisateur a effectué une réattribution complète du jeu Zava Gift Exchange.',
      newAssignment: 'Votre nouvelle attribution est prête !',
      youGiftTo: 'Vous offrez maintenant à :',
      theirWish: 'Son souhait de cadeau :',
      noWish: 'N\'a pas encore ajouté de souhait',
      confirmAgain: 'Veuillez vérifier et confirmer votre nouvelle attribution.',
      viewEvent: 'Voir ma nouvelle attribution',
      gameCode: 'Code du jeu',
      gameCodeDesc: 'Utilisez ce code pour accéder au jeu :',
      footer: 'Profitez de l\'échange de cadeaux !',
      keepSecret: '🤫 N\'oubliez pas : gardez secret à qui vous offrez !',
      headerTitle: 'Nouvelle Attribution'
    },
    it: {
      subject: `🔄 Nuova assegnazione in "${game.name}" - Riassegnazione dell'organizzatore`,
      greeting: `Ciao ${participant.name}!`,
      intro: 'L\'organizzatore ha effettuato una riassegnazione completa del gioco Zava Gift Exchange.',
      newAssignment: 'La tua nuova assegnazione è pronta!',
      youGiftTo: 'Ora regali a:',
      theirWish: 'Il suo desiderio:',
      noWish: 'Non ha ancora aggiunto un desiderio',
      confirmAgain: 'Per favore rivedi e conferma la tua nuova assegnazione.',
      viewEvent: 'Vedi la mia nuova assegnazione',
      gameCode: 'Codice del gioco',
      gameCodeDesc: 'Usa questo codice per accedere al gioco:',
      footer: 'Goditi lo scambio di regali!',
      keepSecret: '🤫 Ricorda: mantieni segreto a chi regali!',
      headerTitle: 'Nuova Assegnazione'
    },
    ja: {
      subject: `🔄 「${game.name}」の新しい割り当て - 主催者による再割り当て`,
      greeting: `こんにちは、${participant.name}さん！`,
      intro: '主催者がZava ギフト交換ゲームの完全な再割り当てを行いました。',
      newAssignment: '新しい割り当てが準備できました！',
      youGiftTo: 'プレゼントを贈る相手：',
      theirWish: 'プレゼントの希望：',
      noWish: 'まだ希望を追加していません',
      confirmAgain: '新しい割り当てを確認してください。',
      viewEvent: '新しい割り当てを見る',
      gameCode: 'ゲームコード',
      gameCodeDesc: 'このコードでゲームにアクセス：',
      footer: 'プレゼント交換をお楽しみください！',
      keepSecret: '🤫 忘れずに：誰に贈るかは秘密にしてください！',
      headerTitle: '新しい割り当て'
    },
    zh: {
      subject: `🔄 "${game.name}"中的新分配 - 组织者重新分配`,
      greeting: `您好，${participant.name}！`,
      intro: '组织者已对Zava 礼物交换游戏进行了完全重新分配。',
      newAssignment: '您的新分配已准备就绪！',
      youGiftTo: '您现在要送礼物给：',
      theirWish: '他们的礼物愿望：',
      noWish: '尚未添加愿望',
      confirmAgain: '请查看并确认您的新分配。',
      viewEvent: '查看我的新分配',
      gameCode: '游戏代码',
      gameCodeDesc: '使用此代码访问游戏：',
      footer: '祝您礼物交换愉快！',
      keepSecret: '🤫 记住：保密您要送礼物给谁！',
      headerTitle: '新分配'
    },
    de: {
      subject: `🔄 Neue Zuweisung in "${game.name}" - Neuzuweisung durch den Organisator`,
      greeting: `Hallo ${participant.name}!`,
      intro: 'Der Organisator hat eine vollständige Neuzuweisung des Zava Geschenktausch-Spiels durchgeführt.',
      newAssignment: 'Deine neue Zuweisung ist bereit!',
      youGiftTo: 'Du beschenkst jetzt:',
      theirWish: 'Geschenkwunsch:',
      noWish: 'Hat noch keinen Wunsch hinzugefügt',
      confirmAgain: 'Bitte überprüfe und bestätige deine neue Zuweisung.',
      viewEvent: 'Meine neue Zuweisung ansehen',
      gameCode: 'Spielcode',
      gameCodeDesc: 'Verwende diesen Code, um auf das Spiel zuzugreifen:',
      footer: 'Viel Spaß beim Geschenkaustausch!',
      keepSecret: '🤫 Denk daran: Behalte für dich, wen du beschenkst!',
      headerTitle: 'Neue Zuweisung'
    },
    nl: {
      subject: `🔄 Nieuwe toewijzing in "${game.name}" - Hertoewijzing door organisator`,
      greeting: `Hallo ${participant.name}!`,
      intro: 'De organisator heeft een volledige hertoewijzing van het Zava Gift Exchange-spel uitgevoerd.',
      newAssignment: 'Je nieuwe toewijzing is klaar!',
      youGiftTo: 'Je geeft nu een cadeau aan:',
      theirWish: 'Hun cadeauwens:',
      noWish: 'Heeft nog geen wens toegevoegd',
      confirmAgain: 'Bekijk en bevestig je nieuwe toewijzing.',
      viewEvent: 'Bekijk mijn nieuwe toewijzing',
      gameCode: 'Spelcode',
      gameCodeDesc: 'Gebruik deze code om toegang te krijgen tot het spel:',
      footer: 'Veel plezier met de cadeauuitwisseling!',
      keepSecret: '🤫 Onthoud: houd geheim aan wie je een cadeau geeft!',
      headerTitle: 'Nieuwe Toewijzing'
    }
  }

  const t = getTranslation(translations, language)

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t.subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #f57c00 0%, #e65100 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">🔄 ${t.headerTitle}</h1>
  </div>
  
  <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 18px; font-weight: bold;">${t.greeting}</p>
    <p style="font-size: 16px;">${t.intro}</p>
    
    <div style="background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); padding: 25px; border-radius: 12px; margin: 25px 0; text-align: center; color: white;">
      <h2 style="margin: 0 0 15px 0; font-size: 20px;">${t.newAssignment}</h2>
      <p style="margin: 0; font-size: 14px; opacity: 0.9;">${t.youGiftTo}</p>
      <p style="margin: 10px 0 0 0; font-size: 32px; font-weight: bold;">🎄 ${newReceiver.name} 🎄</p>
      ${newReceiver.wish ? `<p style="margin: 15px 0 0 0; font-size: 14px;"><strong>${t.theirWish}</strong> ${escapeHtml(newReceiver.wish)}</p>` : `<p style="margin: 15px 0 0 0; font-size: 14px; opacity: 0.8;">${t.noWish}</p>`}
    </div>
    
    <div style="background: #fff3e0; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center;">
      <p style="margin: 0; font-weight: bold; color: #e65100;">${t.keepSecret}</p>
    </div>
    
    <p style="font-size: 14px; color: #666; text-align: center;">${t.confirmAgain}</p>
    
    <div style="background: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
      ${hasUrl
        ? `<a href="${participantLink}" style="display: inline-block; background: #1e40af; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">${t.viewEvent}</a>`
        : `<p style="margin: 0 0 10px 0; font-size: 14px;">${t.gameCodeDesc}</p><code style="display: inline-block; background: #1e40af; color: white; padding: 14px 28px; border-radius: 6px; font-size: 24px; font-weight: bold;">${game.code}</code>`
      }
    </div>
    
    <p style="font-size: 14px; color: #666; margin-top: 30px; text-align: center;">${t.footer}</p>
  </div>
</body>
</html>
`

  const plainText = `
${t.greeting}

${t.intro}

${t.newAssignment}
${t.youGiftTo} ${newReceiver.name}
${newReceiver.wish ? `${t.theirWish} ${newReceiver.wish}` : t.noWish}

${t.keepSecret}

${t.confirmAgain}

${hasUrl ? `${t.viewEvent}: ${participantLink}` : `${t.gameCode}: ${game.code}`}

${t.footer}
`

  return { subject: t.subject, html, plainText }
}

export async function sendFullReassignmentEmail(
  game: Game,
  participant: Participant,
  language: Language = 'es'
): Promise<{ success: boolean; error?: string }> {
  if (!participant.email) {
    return { success: false, error: 'No participant email provided' }
  }

  // Find the new assignment for this participant
  const assignment = game.assignments.find(a => a.giverId === participant.id)
  if (!assignment) {
    return { success: false, error: 'No assignment found for participant' }
  }

  const newReceiver = game.participants.find(p => p.id === assignment.receiverId)
  if (!newReceiver) {
    return { success: false, error: 'Receiver not found' }
  }

  const { subject, html, plainText } = generateFullReassignmentEmailContent({
    game,
    participant,
    newReceiver,
    language
  })

  return await sendEmail({
    to: [{ address: participant.email, displayName: participant.name }],
    subject,
    html,
    plainText
  })
}

export async function sendFullReassignmentEmails(
  game: Game,
  confirmedParticipants: Participant[],
  language: Language = 'es'
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const results = {
    sent: 0,
    failed: 0,
    errors: [] as string[]
  }

  for (const participant of confirmedParticipants) {
    if (participant.email) {
      const result = await sendFullReassignmentEmail(game, participant, language)
      if (result.success) {
        results.sent++
      } else {
        results.failed++
        results.errors.push(`${participant.name}: ${result.error}`)
      }
    }
  }

  return results
}

// ============================================
// PARTICIPANT REMOVED EMAIL (to the removed participant)
// ============================================
export interface ParticipantRemovedEmailData {
  gameName: string
  participantName: string
  organizerName?: string
  language: Language
}

export function generateParticipantRemovedEmailContent(data: ParticipantRemovedEmailData): { subject: string; html: string; plainText: string } {
  const { gameName, participantName, organizerName, language } = data

  const translations: Partial<Record<Language, {
    subject: string
    greeting: string
    removed: string
    removedByOrganizer: string
    sorry: string
    contact: string
    headerTitle: string
    footer: string
  }>> = {
    es: {
      subject: `🎄 Has sido eliminado del juego "${gameName}"`,
      greeting: `Hola ${participantName},`,
      removed: `Te informamos que has sido eliminado del intercambio de regalos "${gameName}".`,
      removedByOrganizer: organizerName ? `El organizador ${organizerName} ha actualizado la lista de participantes.` : 'El organizador ha actualizado la lista de participantes.',
      sorry: 'Lamentamos cualquier inconveniente que esto pueda causar.',
      contact: 'Si tienes alguna pregunta, por favor contacta al organizador del evento.',
      headerTitle: 'Actualización del Evento',
      footer: 'Gracias por usar Zava Gift Exchange.'
    },
    en: {
      subject: `🎄 You have been removed from "${gameName}"`,
      greeting: `Hello ${participantName},`,
      removed: `We're writing to let you know that you have been removed from the gift exchange "${gameName}".`,
      removedByOrganizer: organizerName ? `The organizer ${organizerName} has updated the participant list.` : 'The organizer has updated the participant list.',
      sorry: 'We apologize for any inconvenience this may cause.',
      contact: 'If you have any questions, please contact the event organizer.',
      headerTitle: 'Event Update',
      footer: 'Thank you for using Zava Gift Exchange.'
    },
    pt: {
      subject: `🎄 Você foi removido do jogo "${gameName}"`,
      greeting: `Olá ${participantName},`,
      removed: `Informamos que você foi removido da troca de presentes "${gameName}".`,
      removedByOrganizer: organizerName ? `O organizador ${organizerName} atualizou a lista de participantes.` : 'O organizador atualizou a lista de participantes.',
      sorry: 'Pedimos desculpas por qualquer inconveniente que isso possa causar.',
      contact: 'Se você tiver alguma dúvida, entre em contato com o organizador do evento.',
      headerTitle: 'Atualização do Evento',
      footer: 'Obrigado por usar o Zava Gift Exchange.'
    },
    fr: {
      subject: `🎄 Vous avez été retiré de "${gameName}"`,
      greeting: `Bonjour ${participantName},`,
      removed: `Nous vous informons que vous avez été retiré de l'échange de cadeaux "${gameName}".`,
      removedByOrganizer: organizerName ? `L'organisateur ${organizerName} a mis à jour la liste des participants.` : 'L\'organisateur a mis à jour la liste des participants.',
      sorry: 'Nous nous excusons pour tout inconvénient que cela pourrait causer.',
      contact: 'Si vous avez des questions, veuillez contacter l\'organisateur de l\'événement.',
      headerTitle: 'Mise à Jour de l\'Événement',
      footer: 'Merci d\'utiliser Zava Gift Exchange.'
    },
    it: {
      subject: `🎄 Sei stato rimosso da "${gameName}"`,
      greeting: `Ciao ${participantName},`,
      removed: `Ti informiamo che sei stato rimosso dallo scambio di regali "${gameName}".`,
      removedByOrganizer: organizerName ? `L'organizzatore ${organizerName} ha aggiornato la lista dei partecipanti.` : 'L\'organizzatore ha aggiornato la lista dei partecipanti.',
      sorry: 'Ci scusiamo per eventuali inconvenienti che questo possa causare.',
      contact: 'Se hai domande, contatta l\'organizzatore dell\'evento.',
      headerTitle: 'Aggiornamento Evento',
      footer: 'Grazie per aver usato Zava Gift Exchange.'
    },
    ja: {
      subject: `🎄 「${gameName}」から削除されました`,
      greeting: `${participantName}さん、こんにちは。`,
      removed: `ギフト交換「${gameName}」から削除されたことをお知らせします。`,
      removedByOrganizer: organizerName ? `主催者${organizerName}が参加者リストを更新しました。` : '主催者が参加者リストを更新しました。',
      sorry: 'ご不便をおかけして申し訳ございません。',
      contact: 'ご質問がある場合は、イベント主催者にお問い合わせください。',
      headerTitle: 'イベント更新',
      footer: 'Zava ギフト交換をご利用いただきありがとうございます。'
    },
    zh: {
      subject: `🎄 您已从"${gameName}"中移除`,
      greeting: `${participantName}，您好，`,
      removed: `我们通知您，您已被从礼物交换"${gameName}"中移除。`,
      removedByOrganizer: organizerName ? `组织者${organizerName}已更新参与者名单。` : '组织者已更新参与者名单。',
      sorry: '对于由此造成的任何不便，我们深表歉意。',
      contact: '如有任何问题，请联系活动组织者。',
      headerTitle: '活动更新',
      footer: '感谢使用Zava 礼物交换。'
    },
    de: {
      subject: `🎄 Du wurdest aus "${gameName}" entfernt`,
      greeting: `Hallo ${participantName},`,
      removed: `Wir möchten dich informieren, dass du aus dem Geschenkaustausch "${gameName}" entfernt wurdest.`,
      removedByOrganizer: organizerName ? `Der Organisator ${organizerName} hat die Teilnehmerliste aktualisiert.` : 'Der Organisator hat die Teilnehmerliste aktualisiert.',
      sorry: 'Wir entschuldigen uns für eventuelle Unannehmlichkeiten.',
      contact: 'Bei Fragen wende dich bitte an den Veranstalter.',
      headerTitle: 'Event-Aktualisierung',
      footer: 'Danke, dass du Zava Geschenktausch verwendest.'
    },
    nl: {
      subject: `🎄 Je bent verwijderd uit "${gameName}"`,
      greeting: `Hallo ${participantName},`,
      removed: `We laten je weten dat je bent verwijderd uit de cadeauuitwisseling "${gameName}".`,
      removedByOrganizer: organizerName ? `De organisator ${organizerName} heeft de deelnemerslijst bijgewerkt.` : 'De organisator heeft de deelnemerslijst bijgewerkt.',
      sorry: 'Onze excuses voor het ongemak dat dit kan veroorzaken.',
      contact: 'Als je vragen hebt, neem dan contact op met de organisator.',
      headerTitle: 'Evenement Update',
      footer: 'Bedankt voor het gebruik van Zava Gift Exchange.'
    }
  }

  const t = getTranslation(translations, language)

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); padding: 30px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px;">🎄 ${t.headerTitle}</h1>
    </div>
    
    <div style="padding: 30px;">
      <p style="font-size: 16px; color: #333; margin-bottom: 20px;">${t.greeting}</p>
      
      <p style="font-size: 16px; color: #333; margin-bottom: 15px;">${t.removed}</p>
      
      <p style="font-size: 14px; color: #666; margin-bottom: 15px;">${t.removedByOrganizer}</p>
      
      <p style="font-size: 14px; color: #666; margin-bottom: 15px;">${t.sorry}</p>
      
      <p style="font-size: 14px; color: #666; margin-bottom: 15px;">${t.contact}</p>
    </div>
    
    <div style="padding: 20px; background-color: #f9fafb; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="font-size: 12px; color: #9ca3af; margin: 0;">${t.footer}</p>
    </div>
  </div>
</body>
</html>
`

  const plainText = `${t.greeting}\n\n${t.removed}\n\n${t.removedByOrganizer}\n\n${t.sorry}\n\n${t.contact}\n\n${t.footer}`

  return { subject: t.subject, html, plainText }
}

export async function sendParticipantRemovedEmail(
  participantEmail: string,
  participantName: string,
  gameName: string,
  organizerName?: string,
  language: Language = 'en'
): Promise<{ success: boolean; error?: string }> {
  const { subject, html, plainText } = generateParticipantRemovedEmailContent({
    gameName,
    participantName,
    organizerName,
    language
  })

  return await sendEmail({
    to: [{ address: participantEmail, displayName: participantName }],
    subject,
    html,
    plainText
  })
}

// ============================================
// GAME DELETED EMAIL (to all participants)
// ============================================
export interface GameDeletedEmailData {
  gameName: string
  participantName: string
  eventDate?: string
  organizerName?: string
  language: Language
}

export function generateGameDeletedEmailContent(data: GameDeletedEmailData): { subject: string; html: string; plainText: string } {
  const { gameName, participantName, eventDate, organizerName, language } = data

  const translations: Partial<Record<Language, {
    subject: string
    greeting: string
    cancelled: string
    cancelledByOrganizer: string
    eventWas: string
    sorry: string
    questions: string
    headerTitle: string
    footer: string
  }>> = {
    es: {
      subject: `❌ El intercambio "${gameName}" ha sido cancelado`,
      greeting: `Hola ${participantName},`,
      cancelled: `Te informamos que el intercambio de regalos "${gameName}" ha sido cancelado.`,
      cancelledByOrganizer: organizerName ? `El organizador ${organizerName} ha decidido cancelar el evento.` : 'El organizador ha decidido cancelar el evento.',
      eventWas: 'El evento estaba programado para',
      sorry: 'Lamentamos cualquier inconveniente que esto pueda causar.',
      questions: 'Si tienes alguna pregunta, por favor contacta al organizador del evento.',
      headerTitle: 'Evento Cancelado',
      footer: 'Gracias por usar Zava Gift Exchange.'
    },
    en: {
      subject: `❌ The gift exchange "${gameName}" has been cancelled`,
      greeting: `Hello ${participantName},`,
      cancelled: `We're writing to let you know that the gift exchange "${gameName}" has been cancelled.`,
      cancelledByOrganizer: organizerName ? `The organizer ${organizerName} has decided to cancel the event.` : 'The organizer has decided to cancel the event.',
      eventWas: 'The event was scheduled for',
      sorry: 'We apologize for any inconvenience this may cause.',
      questions: 'If you have any questions, please contact the event organizer.',
      headerTitle: 'Event Cancelled',
      footer: 'Thank you for using Zava Gift Exchange.'
    },
    pt: {
      subject: `❌ A troca de presentes "${gameName}" foi cancelada`,
      greeting: `Olá ${participantName},`,
      cancelled: `Informamos que a troca de presentes "${gameName}" foi cancelada.`,
      cancelledByOrganizer: organizerName ? `O organizador ${organizerName} decidiu cancelar o evento.` : 'O organizador decidiu cancelar o evento.',
      eventWas: 'O evento estava agendado para',
      sorry: 'Pedimos desculpas por qualquer inconveniente que isso possa causar.',
      questions: 'Se você tiver alguma dúvida, entre em contato com o organizador do evento.',
      headerTitle: 'Evento Cancelado',
      footer: 'Obrigado por usar o Zava Gift Exchange.'
    },
    fr: {
      subject: `❌ L'échange de cadeaux "${gameName}" a été annulé`,
      greeting: `Bonjour ${participantName},`,
      cancelled: `Nous vous informons que l'échange de cadeaux "${gameName}" a été annulé.`,
      cancelledByOrganizer: organizerName ? `L'organisateur ${organizerName} a décidé d'annuler l'événement.` : 'L\'organisateur a décidé d\'annuler l\'événement.',
      eventWas: 'L\'événement était prévu pour le',
      sorry: 'Nous nous excusons pour tout inconvénient que cela pourrait causer.',
      questions: 'Si vous avez des questions, veuillez contacter l\'organisateur de l\'événement.',
      headerTitle: 'Événement Annulé',
      footer: 'Merci d\'utiliser Zava Gift Exchange.'
    },
    it: {
      subject: `❌ Lo scambio di regali "${gameName}" è stato annullato`,
      greeting: `Ciao ${participantName},`,
      cancelled: `Ti informiamo che lo scambio di regali "${gameName}" è stato annullato.`,
      cancelledByOrganizer: organizerName ? `L'organizzatore ${organizerName} ha deciso di annullare l'evento.` : 'L\'organizzatore ha deciso di annullare l\'evento.',
      eventWas: 'L\'evento era previsto per il',
      sorry: 'Ci scusiamo per eventuali inconvenienti che questo possa causare.',
      questions: 'Se hai domande, contatta l\'organizzatore dell\'evento.',
      headerTitle: 'Evento Annullato',
      footer: 'Grazie per aver usato Zava Gift Exchange.'
    },
    ja: {
      subject: `❌ ギフト交換「${gameName}」がキャンセルされました`,
      greeting: `${participantName}さん、こんにちは。`,
      cancelled: `ギフト交換「${gameName}」がキャンセルされたことをお知らせします。`,
      cancelledByOrganizer: organizerName ? `主催者${organizerName}がイベントのキャンセルを決定しました。` : '主催者がイベントのキャンセルを決定しました。',
      eventWas: 'イベントの予定日',
      sorry: 'ご不便をおかけして申し訳ございません。',
      questions: 'ご質問がある場合は、イベント主催者にお問い合わせください。',
      headerTitle: 'イベントキャンセル',
      footer: 'Zava ギフト交換をご利用いただきありがとうございます。'
    },
    zh: {
      subject: `❌ 礼物交换"${gameName}"已取消`,
      greeting: `${participantName}，您好，`,
      cancelled: `我们通知您，礼物交换"${gameName}"已被取消。`,
      cancelledByOrganizer: organizerName ? `组织者${organizerName}已决定取消此活动。` : '组织者已决定取消此活动。',
      eventWas: '活动原定于',
      sorry: '对于由此造成的任何不便，我们深表歉意。',
      questions: '如有任何问题，请联系活动组织者。',
      headerTitle: '活动已取消',
      footer: '感谢使用Zava 礼物交换。'
    },
    de: {
      subject: `❌ Der Geschenkaustausch "${gameName}" wurde abgesagt`,
      greeting: `Hallo ${participantName},`,
      cancelled: `Wir möchten dich informieren, dass der Geschenkaustausch "${gameName}" abgesagt wurde.`,
      cancelledByOrganizer: organizerName ? `Der Organisator ${organizerName} hat beschlossen, das Event abzusagen.` : 'Der Organisator hat beschlossen, das Event abzusagen.',
      eventWas: 'Das Event war geplant für den',
      sorry: 'Wir entschuldigen uns für eventuelle Unannehmlichkeiten.',
      questions: 'Bei Fragen wende dich bitte an den Veranstalter.',
      headerTitle: 'Event Abgesagt',
      footer: 'Danke, dass du Zava Geschenktausch verwendest.'
    },
    nl: {
      subject: `❌ De cadeauuitwisseling "${gameName}" is geannuleerd`,
      greeting: `Hallo ${participantName},`,
      cancelled: `We laten je weten dat de cadeauuitwisseling "${gameName}" is geannuleerd.`,
      cancelledByOrganizer: organizerName ? `De organisator ${organizerName} heeft besloten het evenement te annuleren.` : 'De organisator heeft besloten het evenement te annuleren.',
      eventWas: 'Het evenement was gepland voor',
      sorry: 'Onze excuses voor het ongemak dat dit kan veroorzaken.',
      questions: 'Als je vragen hebt, neem dan contact op met de organisator.',
      headerTitle: 'Evenement Geannuleerd',
      footer: 'Bedankt voor het gebruik van Zava Gift Exchange.'
    }
  }

  const t = getTranslation(translations, language)

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); padding: 30px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px;">❌ ${t.headerTitle}</h1>
    </div>
    
    <div style="padding: 30px;">
      <p style="font-size: 16px; color: #333; margin-bottom: 20px;">${t.greeting}</p>
      
      <p style="font-size: 16px; color: #333; margin-bottom: 15px;">${t.cancelled}</p>
      
      <p style="font-size: 14px; color: #666; margin-bottom: 15px;">${t.cancelledByOrganizer}</p>
      
      ${eventDate ? `
      <div style="background: #eff6ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
        <p style="font-size: 14px; color: #991b1b; margin: 0;"><strong>${t.eventWas}:</strong> ${eventDate}</p>
      </div>
      ` : ''}
      
      <p style="font-size: 14px; color: #666; margin-bottom: 15px;">${t.sorry}</p>
      
      <p style="font-size: 14px; color: #666; margin-bottom: 15px;">${t.questions}</p>
    </div>
    
    <div style="padding: 20px; background-color: #f9fafb; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="font-size: 12px; color: #9ca3af; margin: 0;">${t.footer}</p>
    </div>
  </div>
</body>
</html>
`

  const plainText = `${t.greeting}\n\n${t.cancelled}\n\n${t.cancelledByOrganizer}\n\n${eventDate ? `${t.eventWas}: ${eventDate}\n\n` : ''}${t.sorry}\n\n${t.questions}\n\n${t.footer}`

  return { subject: t.subject, html, plainText }
}

export async function sendGameDeletedEmail(
  participantEmail: string,
  participantName: string,
  gameName: string,
  eventDate?: string,
  organizerName?: string,
  language: Language = 'en'
): Promise<{ success: boolean; error?: string }> {
  const { subject, html, plainText } = generateGameDeletedEmailContent({
    gameName,
    participantName,
    eventDate,
    organizerName,
    language
  })

  return await sendEmail({
    to: [{ address: participantEmail, displayName: participantName }],
    subject,
    html,
    plainText
  })
}

export async function sendGameDeletedEmails(
  participants: Array<{ email: string; name: string; preferredLanguage?: Language }>,
  gameName: string,
  eventDate?: string,
  organizerName?: string,
  defaultLanguage: Language = 'en'
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const results = {
    sent: 0,
    failed: 0,
    errors: [] as string[]
  }

  for (const participant of participants) {
    if (participant.email) {
      const language = participant.preferredLanguage || defaultLanguage
      const result = await sendGameDeletedEmail(
        participant.email,
        participant.name,
        gameName,
        eventDate,
        organizerName,
        language
      )
      if (result.success) {
        results.sent++
      } else {
        results.failed++
        results.errors.push(`${participant.name}: ${result.error}`)
      }
    }
  }

  return results
}

// ============================================
// EVENT UPCOMING EMAIL (automated reminder 1 day before)
// ============================================
export interface EventUpcomingEmailData {
  game: Game
  participant: Participant
  language: Language
}

export function generateEventUpcomingEmailContent(data: EventUpcomingEmailData): { subject: string; html: string; plainText: string } {
  const { game, participant, language } = data
  const baseUrl = getBaseUrl()
  const hasUrl = hasBaseUrl()
  const participantLink = hasUrl ? getParticipantLink(baseUrl, game.code) : ''

  // Find participant's assignment
  const assignment = game.assignments.find(a => a.giverId === participant.id)
  const receiver = assignment ? game.participants.find(p => p.id === assignment.receiverId) : null

  const translations: Partial<Record<Language, {
    subject: string
    greeting: string
    reminder: string
    eventTomorrow: string
    eventDetails: string
    date: string
    time: string
    location: string
    yourAssignment: string
    youGiftTo: string
    theirWish: string
    noWish: string
    viewGame: string
    dontForget: string
    headerTitle: string
    footer: string
  }>> = {
    es: {
      subject: `⏰ ¡Recordatorio! "${game.name}" es mañana`,
      greeting: `¡Hola ${participant.name}!`,
      reminder: '¡Este es un recordatorio amistoso de que el intercambio de regalos es mañana!',
      eventTomorrow: 'El evento está programado para mañana',
      eventDetails: 'Detalles del evento',
      date: 'Fecha',
      time: 'Hora',
      location: 'Lugar',
      yourAssignment: 'Tu asignación',
      youGiftTo: 'Le regalas a',
      theirWish: 'Su deseo',
      noWish: 'No ha especificado ningún deseo todavía',
      viewGame: 'Ver juego',
      dontForget: '¡No olvides traer tu regalo!',
      headerTitle: 'Recordatorio del Evento',
      footer: 'Gracias por usar Zava Gift Exchange. ¡Que disfruten el intercambio!'
    },
    en: {
      subject: `⏰ Reminder! "${game.name}" is tomorrow`,
      greeting: `Hello ${participant.name}!`,
      reminder: 'This is a friendly reminder that the gift exchange is tomorrow!',
      eventTomorrow: 'The event is scheduled for tomorrow',
      eventDetails: 'Event details',
      date: 'Date',
      time: 'Time',
      location: 'Location',
      yourAssignment: 'Your assignment',
      youGiftTo: 'You\'re gifting to',
      theirWish: 'Their wish',
      noWish: 'They haven\'t specified a wish yet',
      viewGame: 'View game',
      dontForget: 'Don\'t forget to bring your gift!',
      headerTitle: 'Event Reminder',
      footer: 'Thank you for using Zava Gift Exchange. Enjoy the exchange!'
    },
    pt: {
      subject: `⏰ Lembrete! "${game.name}" é amanhã`,
      greeting: `Olá ${participant.name}!`,
      reminder: 'Este é um lembrete amigável de que a troca de presentes é amanhã!',
      eventTomorrow: 'O evento está agendado para amanhã',
      eventDetails: 'Detalhes do evento',
      date: 'Data',
      time: 'Hora',
      location: 'Local',
      yourAssignment: 'Sua atribuição',
      youGiftTo: 'Você presenteia',
      theirWish: 'Desejo dele(a)',
      noWish: 'Ainda não especificou um desejo',
      viewGame: 'Ver jogo',
      dontForget: 'Não esqueça de trazer seu presente!',
      headerTitle: 'Lembrete do Evento',
      footer: 'Obrigado por usar o Zava Gift Exchange. Aproveite a troca!'
    },
    fr: {
      subject: `⏰ Rappel ! "${game.name}" c'est demain`,
      greeting: `Bonjour ${participant.name} !`,
      reminder: 'Ceci est un rappel amical que l\'échange de cadeaux c\'est demain !',
      eventTomorrow: 'L\'événement est prévu pour demain',
      eventDetails: 'Détails de l\'événement',
      date: 'Date',
      time: 'Heure',
      location: 'Lieu',
      yourAssignment: 'Votre attribution',
      youGiftTo: 'Vous offrez à',
      theirWish: 'Son souhait',
      noWish: 'N\'a pas encore spécifié de souhait',
      viewGame: 'Voir le jeu',
      dontForget: 'N\'oubliez pas d\'apporter votre cadeau !',
      headerTitle: 'Rappel de l\'Événement',
      footer: 'Merci d\'utiliser Zava Gift Exchange. Profitez de l\'échange !'
    },
    it: {
      subject: `⏰ Promemoria! "${game.name}" è domani`,
      greeting: `Ciao ${participant.name}!`,
      reminder: 'Questo è un promemoria amichevole che lo scambio di regali è domani!',
      eventTomorrow: 'L\'evento è previsto per domani',
      eventDetails: 'Dettagli dell\'evento',
      date: 'Data',
      time: 'Ora',
      location: 'Luogo',
      yourAssignment: 'La tua assegnazione',
      youGiftTo: 'Regali a',
      theirWish: 'Il suo desiderio',
      noWish: 'Non ha ancora specificato un desiderio',
      viewGame: 'Vedi gioco',
      dontForget: 'Non dimenticare di portare il tuo regalo!',
      headerTitle: 'Promemoria Evento',
      footer: 'Grazie per aver usato Zava Gift Exchange. Buon scambio!'
    },
    ja: {
      subject: `⏰ リマインダー！「${game.name}」は明日です`,
      greeting: `こんにちは、${participant.name}さん！`,
      reminder: 'ギフト交換は明日です！このリマインダーをお届けします。',
      eventTomorrow: 'イベントは明日開催予定です',
      eventDetails: 'イベント詳細',
      date: '日付',
      time: '時間',
      location: '場所',
      yourAssignment: 'あなたの担当',
      youGiftTo: 'プレゼントを贈る相手',
      theirWish: '相手のウィッシュ',
      noWish: 'まだウィッシュが指定されていません',
      viewGame: 'ゲームを見る',
      dontForget: 'プレゼントを忘れずに！',
      headerTitle: 'イベントリマインダー',
      footer: 'Zava ギフト交換をご利用いただきありがとうございます。交換を楽しんでください！'
    },
    zh: {
      subject: `⏰ 提醒！"${game.name}"是明天`,
      greeting: `${participant.name}，您好！`,
      reminder: '这是一个友好的提醒，礼物交换是明天！',
      eventTomorrow: '活动定于明天举行',
      eventDetails: '活动详情',
      date: '日期',
      time: '时间',
      location: '地点',
      yourAssignment: '您的分配',
      youGiftTo: '您送礼给',
      theirWish: '他们的愿望',
      noWish: '尚未指定愿望',
      viewGame: '查看游戏',
      dontForget: '别忘了带上您的礼物！',
      headerTitle: '活动提醒',
      footer: '感谢使用Zava 礼物交换。享受交换乐趣！'
    },
    de: {
      subject: `⏰ Erinnerung! "${game.name}" ist morgen`,
      greeting: `Hallo ${participant.name}!`,
      reminder: 'Dies ist eine freundliche Erinnerung, dass der Geschenkaustausch morgen ist!',
      eventTomorrow: 'Das Event ist für morgen geplant',
      eventDetails: 'Event-Details',
      date: 'Datum',
      time: 'Zeit',
      location: 'Ort',
      yourAssignment: 'Deine Zuweisung',
      youGiftTo: 'Du beschenkst',
      theirWish: 'Ihr Wunsch',
      noWish: 'Hat noch keinen Wunsch angegeben',
      viewGame: 'Spiel ansehen',
      dontForget: 'Vergiss nicht, dein Geschenk mitzubringen!',
      headerTitle: 'Event-Erinnerung',
      footer: 'Danke, dass du Zava Geschenktausch verwendest. Viel Spaß beim Austausch!'
    },
    nl: {
      subject: `⏰ Herinnering! "${game.name}" is morgen`,
      greeting: `Hallo ${participant.name}!`,
      reminder: 'Dit is een vriendelijke herinnering dat de cadeauuitwisseling morgen is!',
      eventTomorrow: 'Het evenement staat gepland voor morgen',
      eventDetails: 'Evenement details',
      date: 'Datum',
      time: 'Tijd',
      location: 'Locatie',
      yourAssignment: 'Jouw toewijzing',
      youGiftTo: 'Je geeft een cadeau aan',
      theirWish: 'Hun wens',
      noWish: 'Heeft nog geen wens opgegeven',
      viewGame: 'Bekijk spel',
      dontForget: 'Vergeet niet je cadeau mee te nemen!',
      headerTitle: 'Evenement Herinnering',
      footer: 'Bedankt voor het gebruik van Zava Gift Exchange. Geniet van de uitwisseling!'
    }
  }

  const t = getTranslation(translations, language)

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px;">⏰ ${t.headerTitle}</h1>
    </div>
    
    <div style="padding: 30px;">
      <p style="font-size: 16px; color: #333; margin-bottom: 20px;">${t.greeting}</p>
      
      <p style="font-size: 16px; color: #333; margin-bottom: 15px;">${t.reminder}</p>
      
      <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
        <h3 style="margin-top: 0; color: #92400e;">📅 ${t.eventDetails}</h3>
        <p style="margin: 5px 0; color: #78350f;"><strong>${t.date}:</strong> ${game.date || 'N/A'}</p>
        ${game.time ? `<p style="margin: 5px 0; color: #78350f;"><strong>${t.time}:</strong> ${game.time}</p>` : ''}
        ${game.location ? `<p style="margin: 5px 0; color: #78350f;"><strong>${t.location}:</strong> ${game.location}</p>` : ''}
      </div>
      
      ${receiver ? `
      <div style="background: #ecfdf5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
        <h3 style="margin-top: 0; color: #065f46;">🎁 ${t.yourAssignment}</h3>
        <p style="margin: 5px 0; color: #047857;"><strong>${t.youGiftTo}:</strong> ${receiver.name}</p>
        <p style="margin: 5px 0; color: #047857;"><strong>${t.theirWish}:</strong> ${receiver.wish || t.noWish}</p>
      </div>
      ` : ''}
      
      <p style="font-size: 16px; color: #333; margin: 20px 0; text-align: center; font-weight: bold;">${t.dontForget}</p>
      
      ${hasUrl ? `
      <div style="text-align: center; margin-top: 20px;">
        <a href="${participantLink}" style="display: inline-block; background: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">${t.viewGame}</a>
      </div>
      ` : ''}
    </div>
    
    <div style="padding: 20px; background-color: #f9fafb; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="font-size: 12px; color: #9ca3af; margin: 0;">${t.footer}</p>
    </div>
  </div>
</body>
</html>
`

  const plainText = `${t.greeting}\n\n${t.reminder}\n\n${t.eventDetails}:\n- ${t.date}: ${game.date || 'N/A'}\n${game.time ? `- ${t.time}: ${game.time}\n` : ''}${game.location ? `- ${t.location}: ${game.location}\n` : ''}\n${receiver ? `${t.yourAssignment}:\n- ${t.youGiftTo}: ${receiver.name}\n- ${t.theirWish}: ${receiver.wish || t.noWish}\n\n` : ''}${t.dontForget}\n\n${hasUrl ? `${t.viewGame}: ${participantLink}\n\n` : ''}${t.footer}`

  return { subject: t.subject, html, plainText }
}

export async function sendEventUpcomingEmail(
  game: Game,
  participant: Participant,
  language: Language = 'en'
): Promise<{ success: boolean; error?: string }> {
  if (!participant.email) {
    return { success: false, error: 'No participant email provided' }
  }

  const { subject, html, plainText } = generateEventUpcomingEmailContent({
    game,
    participant,
    language
  })

  return await sendEmail({
    to: [{ address: participant.email, displayName: participant.name }],
    subject,
    html,
    plainText
  })
}

export async function sendEventUpcomingEmails(
  game: Game,
  defaultLanguage: Language = 'en'
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const results = {
    sent: 0,
    failed: 0,
    errors: [] as string[]
  }

  for (const participant of game.participants) {
    if (participant.email) {
      const language = participant.preferredLanguage || defaultLanguage
      const result = await sendEventUpcomingEmail(game, participant, language)
      if (result.success) {
        results.sent++
      } else {
        results.failed++
        results.errors.push(`${participant.name}: ${result.error}`)
      }
    }
  }

  return results
}

// ============================================
// ALL CONFIRMED EMAIL (to organizer when all participants confirmed)
// ============================================
export interface AllConfirmedEmailData {
  game: Game
  language: Language
}

export function generateAllConfirmedEmailContent(data: AllConfirmedEmailData): { subject: string; html: string; plainText: string } {
  const { game, language } = data
  const baseUrl = getBaseUrl()
  const hasUrl = hasBaseUrl()
  const organizerLink = hasUrl ? getOrganizerLink(baseUrl, game.code, game.organizerToken) : ''

  const confirmedCount = game.participants.filter(p => p.hasConfirmedAssignment).length

  const translations: Partial<Record<Language, {
    subject: string
    greeting: string
    allConfirmed: string
    everyoneReady: string
    summary: string
    totalParticipants: string
    confirmed: string
    eventDate: string
    participants: string
    manageGame: string
    headerTitle: string
    footer: string
  }>> = {
    es: {
      subject: `✅ ¡Todos confirmados! "${game.name}" está listo`,
      greeting: '¡Hola Organizador!',
      allConfirmed: '¡Excelentes noticias! Todos los participantes han confirmado su asignación.',
      everyoneReady: 'Tu intercambio de regalos está listo para comenzar.',
      summary: 'Resumen',
      totalParticipants: 'Total de participantes',
      confirmed: 'Confirmados',
      eventDate: 'Fecha del evento',
      participants: 'Lista de participantes',
      manageGame: 'Administrar juego',
      headerTitle: '¡Todos Confirmados!',
      footer: 'Gracias por usar Zava Gift Exchange.'
    },
    en: {
      subject: `✅ All confirmed! "${game.name}" is ready`,
      greeting: 'Hello Organizer!',
      allConfirmed: 'Great news! All participants have confirmed their assignment.',
      everyoneReady: 'Your gift exchange is ready to go.',
      summary: 'Summary',
      totalParticipants: 'Total participants',
      confirmed: 'Confirmed',
      eventDate: 'Event date',
      participants: 'Participant list',
      manageGame: 'Manage game',
      headerTitle: 'All Confirmed!',
      footer: 'Thank you for using Zava Gift Exchange.'
    },
    pt: {
      subject: `✅ Todos confirmados! "${game.name}" está pronto`,
      greeting: 'Olá Organizador!',
      allConfirmed: 'Ótimas notícias! Todos os participantes confirmaram sua atribuição.',
      everyoneReady: 'Sua troca de presentes está pronta para começar.',
      summary: 'Resumo',
      totalParticipants: 'Total de participantes',
      confirmed: 'Confirmados',
      eventDate: 'Data do evento',
      participants: 'Lista de participantes',
      manageGame: 'Gerenciar jogo',
      headerTitle: 'Todos Confirmados!',
      footer: 'Obrigado por usar o Zava Gift Exchange.'
    },
    fr: {
      subject: `✅ Tous confirmés ! "${game.name}" est prêt`,
      greeting: 'Bonjour Organisateur !',
      allConfirmed: 'Excellente nouvelle ! Tous les participants ont confirmé leur attribution.',
      everyoneReady: 'Votre échange de cadeaux est prêt à commencer.',
      summary: 'Résumé',
      totalParticipants: 'Total des participants',
      confirmed: 'Confirmés',
      eventDate: 'Date de l\'événement',
      participants: 'Liste des participants',
      manageGame: 'Gérer le jeu',
      headerTitle: 'Tous Confirmés !',
      footer: 'Merci d\'utiliser Zava Gift Exchange.'
    },
    it: {
      subject: `✅ Tutti confermati! "${game.name}" è pronto`,
      greeting: 'Ciao Organizzatore!',
      allConfirmed: 'Ottime notizie! Tutti i partecipanti hanno confermato la loro assegnazione.',
      everyoneReady: 'Il tuo scambio di regali è pronto per iniziare.',
      summary: 'Riepilogo',
      totalParticipants: 'Totale partecipanti',
      confirmed: 'Confermati',
      eventDate: 'Data dell\'evento',
      participants: 'Lista partecipanti',
      manageGame: 'Gestisci gioco',
      headerTitle: 'Tutti Confermati!',
      footer: 'Grazie per aver usato Zava Gift Exchange.'
    },
    ja: {
      subject: `✅ 全員確認完了！「${game.name}」準備完了`,
      greeting: '主催者さん、こんにちは！',
      allConfirmed: '素晴らしいニュースです！全参加者が担当を確認しました。',
      everyoneReady: 'ギフト交換の準備が整いました。',
      summary: '概要',
      totalParticipants: '参加者総数',
      confirmed: '確認済み',
      eventDate: 'イベント日',
      participants: '参加者リスト',
      manageGame: 'ゲームを管理',
      headerTitle: '全員確認完了！',
      footer: 'Zava ギフト交換をご利用いただきありがとうございます。'
    },
    zh: {
      subject: `✅ 全部确认！"${game.name}"已准备就绪`,
      greeting: '您好，组织者！',
      allConfirmed: '好消息！所有参与者都已确认他们的分配。',
      everyoneReady: '您的礼物交换已准备就绪。',
      summary: '摘要',
      totalParticipants: '参与者总数',
      confirmed: '已确认',
      eventDate: '活动日期',
      participants: '参与者列表',
      manageGame: '管理游戏',
      headerTitle: '全部确认！',
      footer: '感谢使用Zava 礼物交换。'
    },
    de: {
      subject: `✅ Alle bestätigt! "${game.name}" ist bereit`,
      greeting: 'Hallo Organisator!',
      allConfirmed: 'Tolle Neuigkeiten! Alle Teilnehmer haben ihre Zuweisung bestätigt.',
      everyoneReady: 'Dein Geschenkaustausch ist startklar.',
      summary: 'Zusammenfassung',
      totalParticipants: 'Gesamtteilnehmer',
      confirmed: 'Bestätigt',
      eventDate: 'Event-Datum',
      participants: 'Teilnehmerliste',
      manageGame: 'Spiel verwalten',
      headerTitle: 'Alle Bestätigt!',
      footer: 'Danke, dass du Zava Geschenktausch verwendest.'
    },
    nl: {
      subject: `✅ Allemaal bevestigd! "${game.name}" is klaar`,
      greeting: 'Hallo Organisator!',
      allConfirmed: 'Geweldig nieuws! Alle deelnemers hebben hun toewijzing bevestigd.',
      everyoneReady: 'Je cadeauuitwisseling is klaar om te beginnen.',
      summary: 'Samenvatting',
      totalParticipants: 'Totaal deelnemers',
      confirmed: 'Bevestigd',
      eventDate: 'Evenement datum',
      participants: 'Deelnemerslijst',
      manageGame: 'Spel beheren',
      headerTitle: 'Allemaal Bevestigd!',
      footer: 'Bedankt voor het gebruik van Zava Gift Exchange.'
    }
  }

  const t = getTranslation(translations, language)

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px;">✅ ${t.headerTitle}</h1>
    </div>
    
    <div style="padding: 30px;">
      <p style="font-size: 16px; color: #333; margin-bottom: 20px;">${t.greeting}</p>
      
      <p style="font-size: 16px; color: #333; margin-bottom: 15px;">${t.allConfirmed}</p>
      
      <p style="font-size: 16px; color: #333; margin-bottom: 20px;">${t.everyoneReady}</p>
      
      <div style="background: #ecfdf5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
        <h3 style="margin-top: 0; color: #065f46;">📊 ${t.summary}</h3>
        <p style="margin: 5px 0; color: #047857;"><strong>${t.totalParticipants}:</strong> ${game.participants.length}</p>
        <p style="margin: 5px 0; color: #047857;"><strong>${t.confirmed}:</strong> ${confirmedCount}/${game.participants.length}</p>
        ${game.date ? `<p style="margin: 5px 0; color: #047857;"><strong>${t.eventDate}:</strong> ${game.date}</p>` : ''}
      </div>
      
      <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #374151;">👥 ${t.participants}</h3>
        <ul style="margin: 0; padding-left: 20px; color: #4b5563;">
          ${game.participants.map(p => `<li>${p.name}</li>`).join('')}
        </ul>
      </div>
      
      ${hasUrl ? `
      <div style="text-align: center; margin-top: 20px;">
        <a href="${organizerLink}" style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">${t.manageGame}</a>
      </div>
      ` : ''}
    </div>
    
    <div style="padding: 20px; background-color: #f9fafb; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="font-size: 12px; color: #9ca3af; margin: 0;">${t.footer}</p>
    </div>
  </div>
</body>
</html>
`

  const plainText = `${t.greeting}\n\n${t.allConfirmed}\n\n${t.everyoneReady}\n\n${t.summary}:\n- ${t.totalParticipants}: ${game.participants.length}\n- ${t.confirmed}: ${confirmedCount}/${game.participants.length}\n${game.date ? `- ${t.eventDate}: ${game.date}\n` : ''}\n${t.participants}:\n${game.participants.map(p => `- ${p.name}`).join('\n')}\n\n${hasUrl ? `${t.manageGame}: ${organizerLink}\n\n` : ''}${t.footer}`

  return { subject: t.subject, html, plainText }
}

export async function sendAllConfirmedEmail(
  game: Game,
  organizerEmail: string,
  language: Language = 'en'
): Promise<{ success: boolean; error?: string }> {
  const { subject, html, plainText } = generateAllConfirmedEmailContent({
    game,
    language
  })

  return await sendEmail({
    to: [{ address: organizerEmail }],
    subject,
    html,
    plainText
  })
}

// ============================================
// EMAIL UPDATED EMAIL (to participant when their email is changed)
// ============================================
export interface EmailUpdatedEmailData {
  gameName: string
  participantName: string
  oldEmail: string
  newEmail: string
  language: Language
}

// ============================================
// NEW ORGANIZER LINK EMAIL (when token is regenerated)
// ============================================
export interface NewOrganizerLinkEmailData {
  game: Game
  language: Language
}

export function generateNewOrganizerLinkEmailContent(data: NewOrganizerLinkEmailData): { subject: string; html: string; plainText: string } {
  const { game, language } = data
  const baseUrl = getBaseUrl()
  const hasUrl = hasBaseUrl()
  const organizerLink = hasUrl ? getOrganizerLink(baseUrl, game.code, game.organizerToken) : ''

  const translations: Partial<Record<Language, {
    subject: string
    greeting: string
    tokenRegenerated: string
    newLinkDesc: string
    oldLinkWarning: string
    organizerLink: string
    organizerLinkDesc: string
    organizerToken: string
    organizerTokenDesc: string
    securityNote: string
    headerTitle: string
    footer: string
  }>> = {
    es: {
      subject: `🔐 Nuevo enlace de organizador - "${game.name}"`,
      greeting: '¡Hola Organizador!',
      tokenRegenerated: 'Se ha generado un nuevo enlace de acceso para tu evento de Zava Gift Exchange.',
      newLinkDesc: 'El enlace anterior ya no funcionará. Usa el nuevo enlace a continuación para acceder al panel de organizador.',
      oldLinkWarning: '⚠️ El enlace anterior ha sido desactivado por seguridad.',
      organizerLink: 'Nuevo enlace del organizador',
      organizerLinkDesc: 'Usa este enlace para administrar el juego (¡no lo compartas!):',
      organizerToken: 'Nuevo token del organizador',
      organizerTokenDesc: 'Usa este token junto con el código del juego para administrar el juego (¡no lo compartas!):',
      securityNote: 'Si no solicitaste este cambio, alguien con acceso a tu panel de organizador regeneró el token.',
      headerTitle: 'Nuevo Enlace de Acceso',
      footer: 'Gracias por usar Zava Gift Exchange.'
    },
    en: {
      subject: `🔐 New organizer link - "${game.name}"`,
      greeting: 'Hello Organizer!',
      tokenRegenerated: 'A new access link has been generated for your Zava Gift Exchange event.',
      newLinkDesc: 'The previous link will no longer work. Use the new link below to access the organizer panel.',
      oldLinkWarning: '⚠️ The previous link has been deactivated for security.',
      organizerLink: 'New organizer link',
      organizerLinkDesc: 'Use this link to manage the game (don\'t share it!):',
      organizerToken: 'New organizer token',
      organizerTokenDesc: 'Use this token along with the game code to manage the game (don\'t share it!):',
      securityNote: 'If you didn\'t request this change, someone with access to your organizer panel regenerated the token.',
      headerTitle: 'New Access Link',
      footer: 'Thank you for using Zava Gift Exchange.'
    },
    pt: {
      subject: `🔐 Novo link do organizador - "${game.name}"`,
      greeting: 'Olá Organizador!',
      tokenRegenerated: 'Um novo link de acesso foi gerado para seu evento de Zava Gift Exchange.',
      newLinkDesc: 'O link anterior não funcionará mais. Use o novo link abaixo para acessar o painel do organizador.',
      oldLinkWarning: '⚠️ O link anterior foi desativado por segurança.',
      organizerLink: 'Novo link do organizador',
      organizerLinkDesc: 'Use este link para gerenciar o jogo (não compartilhe!):',
      organizerToken: 'Novo token do organizador',
      organizerTokenDesc: 'Use este token junto com o código do jogo para gerenciá-lo (não compartilhe!):',
      securityNote: 'Se você não solicitou essa alteração, alguém com acesso ao seu painel de organizador regenerou o token.',
      headerTitle: 'Novo Link de Acesso',
      footer: 'Obrigado por usar o Zava Gift Exchange.'
    },
    fr: {
      subject: `🔐 Nouveau lien organisateur - "${game.name}"`,
      greeting: 'Bonjour Organisateur !',
      tokenRegenerated: 'Un nouveau lien d\'accès a été généré pour votre événement Zava Gift Exchange.',
      newLinkDesc: 'L\'ancien lien ne fonctionnera plus. Utilisez le nouveau lien ci-dessous pour accéder au panneau organisateur.',
      oldLinkWarning: '⚠️ L\'ancien lien a été désactivé pour des raisons de sécurité.',
      organizerLink: 'Nouveau lien organisateur',
      organizerLinkDesc: 'Utilisez ce lien pour gérer le jeu (ne le partagez pas !) :',
      organizerToken: 'Nouveau token organisateur',
      organizerTokenDesc: 'Utilisez ce token avec le code du jeu pour le gérer (ne le partagez pas !) :',
      securityNote: 'Si vous n\'avez pas demandé ce changement, quelqu\'un ayant accès à votre panneau organisateur a régénéré le token.',
      headerTitle: 'Nouveau Lien d\'Accès',
      footer: 'Merci d\'utiliser Zava Gift Exchange.'
    },
    it: {
      subject: `🔐 Nuovo link organizzatore - "${game.name}"`,
      greeting: 'Ciao Organizzatore!',
      tokenRegenerated: 'È stato generato un nuovo link di accesso per il tuo evento Zava Gift Exchange.',
      newLinkDesc: 'Il link precedente non funzionerà più. Usa il nuovo link qui sotto per accedere al pannello organizzatore.',
      oldLinkWarning: '⚠️ Il link precedente è stato disattivato per sicurezza.',
      organizerLink: 'Nuovo link dell\'organizzatore',
      organizerLinkDesc: 'Usa questo link per gestire il gioco (non condividerlo!):',
      organizerToken: 'Nuovo token dell\'organizzatore',
      organizerTokenDesc: 'Usa questo token insieme al codice del gioco per gestirlo (non condividerlo!):',
      securityNote: 'Se non hai richiesto questa modifica, qualcuno con accesso al tuo pannello organizzatore ha rigenerato il token.',
      headerTitle: 'Nuovo Link di Accesso',
      footer: 'Grazie per aver usato Zava Gift Exchange.'
    },
    ja: {
      subject: `🔐 新しい主催者リンク - 「${game.name}」`,
      greeting: 'こんにちは、主催者さん！',
      tokenRegenerated: 'Zava ギフト交換イベントの新しいアクセスリンクが生成されました。',
      newLinkDesc: '以前のリンクは使用できなくなりました。以下の新しいリンクを使用して主催者パネルにアクセスしてください。',
      oldLinkWarning: '⚠️ セキュリティのため、以前のリンクは無効になりました。',
      organizerLink: '新しい主催者リンク',
      organizerLinkDesc: 'このリンクを使ってゲームを管理してください（共有しないでください）：',
      organizerToken: '新しい主催者トークン',
      organizerTokenDesc: 'このトークンとゲームコードを使用してゲームを管理してください（共有しないでください）：',
      securityNote: 'この変更をリクエストしていない場合、主催者パネルにアクセスできる誰かがトークンを再生成しました。',
      headerTitle: '新しいアクセスリンク',
      footer: 'Zava ギフト交換をご利用いただきありがとうございます。'
    },
    zh: {
      subject: `🔐 新的组织者链接 - "${game.name}"`,
      greeting: '您好，组织者！',
      tokenRegenerated: '已为您的Zava 礼物交换活动生成了新的访问链接。',
      newLinkDesc: '之前的链接将不再有效。请使用下面的新链接访问组织者面板。',
      oldLinkWarning: '⚠️ 出于安全考虑，之前的链接已被停用。',
      organizerLink: '新的组织者链接',
      organizerLinkDesc: '使用此链接管理游戏（请勿分享）：',
      organizerToken: '新的组织者令牌',
      organizerTokenDesc: '使用此令牌和游戏代码管理游戏（请勿分享）：',
      securityNote: '如果您没有请求此更改，则有权访问您的组织者面板的人重新生成了令牌。',
      headerTitle: '新的访问链接',
      footer: '感谢使用Zava 礼物交换。'
    },
    de: {
      subject: `🔐 Neuer Organisator-Link - "${game.name}"`,
      greeting: 'Hallo Organisator!',
      tokenRegenerated: 'Ein neuer Zugriffslink wurde für dein Zava Geschenktausch-Event generiert.',
      newLinkDesc: 'Der vorherige Link funktioniert nicht mehr. Verwende den neuen Link unten, um auf das Organisator-Panel zuzugreifen.',
      oldLinkWarning: '⚠️ Der vorherige Link wurde aus Sicherheitsgründen deaktiviert.',
      organizerLink: 'Neuer Organisator-Link',
      organizerLinkDesc: 'Verwende diesen Link um das Spiel zu verwalten (nicht teilen!):',
      organizerToken: 'Neues Organisator-Token',
      organizerTokenDesc: 'Verwende dieses Token zusammen mit dem Spielcode um das Spiel zu verwalten (nicht teilen!):',
      securityNote: 'Wenn du diese Änderung nicht angefordert hast, hat jemand mit Zugriff auf dein Organisator-Panel das Token neu generiert.',
      headerTitle: 'Neuer Zugriffslink',
      footer: 'Danke, dass du Zava Geschenktausch verwendest.'
    },
    nl: {
      subject: `🔐 Nieuwe organisator-link - "${game.name}"`,
      greeting: 'Hallo Organisator!',
      tokenRegenerated: 'Er is een nieuwe toegangslink gegenereerd voor je Zava Gift Exchange-evenement.',
      newLinkDesc: 'De vorige link werkt niet meer. Gebruik de nieuwe link hieronder om toegang te krijgen tot het organisator-paneel.',
      oldLinkWarning: '⚠️ De vorige link is uit veiligheidsoverwegingen gedeactiveerd.',
      organizerLink: 'Nieuwe organisator-link',
      organizerLinkDesc: 'Gebruik deze link om het spel te beheren (deel deze niet!):',
      organizerToken: 'Nieuwe organisator-token',
      organizerTokenDesc: 'Gebruik deze token samen met de spelcode om het spel te beheren (deel deze niet!):',
      securityNote: 'Als je deze wijziging niet hebt aangevraagd, heeft iemand met toegang tot je organisator-paneel de token opnieuw gegenereerd.',
      headerTitle: 'Nieuwe Toegangslink',
      footer: 'Bedankt voor het gebruik van Zava Gift Exchange.'
    }
  }

  const t = getTranslation(translations, language)

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%); padding: 30px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px;">🔐 ${t.headerTitle}</h1>
    </div>
    
    <div style="padding: 30px;">
      <p style="font-size: 16px; color: #333; margin-bottom: 20px;">${t.greeting}</p>
      
      <p style="font-size: 16px; color: #333; margin-bottom: 15px;">${t.tokenRegenerated}</p>
      
      <p style="font-size: 14px; color: #666; margin-bottom: 20px;">${t.newLinkDesc}</p>
      
      <div style="background: #eff6ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
        <p style="margin: 0; color: #991b1b; font-weight: bold;">${t.oldLinkWarning}</p>
      </div>
      
      <div style="background: #f3e8ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #7c3aed;">
        <h3 style="margin-top: 0; color: #5b21b6;">🔐 ${hasUrl ? t.organizerLink : t.organizerToken}</h3>
        <p style="margin-bottom: 15px; font-size: 14px; color: #6b21a8;">${hasUrl ? t.organizerLinkDesc : t.organizerTokenDesc}</p>
        ${hasUrl
          ? `<a href="${organizerLink}" style="display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; word-break: break-all;">${organizerLink}</a>`
          : `<code style="display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; border-radius: 6px; font-size: 18px; font-weight: bold; word-break: break-all;">${game.organizerToken}</code>`
        }
      </div>
      
      <p style="font-size: 12px; color: #9ca3af; margin-top: 20px;">${t.securityNote}</p>
    </div>
    
    <div style="padding: 20px; background-color: #f9fafb; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="font-size: 12px; color: #9ca3af; margin: 0;">${t.footer}</p>
    </div>
  </div>
</body>
</html>
`

  const plainText = `${t.greeting}\n\n${t.tokenRegenerated}\n\n${t.newLinkDesc}\n\n${t.oldLinkWarning}\n\n${hasUrl ? t.organizerLink : t.organizerToken}\n${hasUrl ? t.organizerLinkDesc : t.organizerTokenDesc}\n${hasUrl ? organizerLink : game.organizerToken}\n\n${t.securityNote}\n\n${t.footer}`

  return { subject: t.subject, html, plainText }
}

export async function sendNewOrganizerLinkEmail(
  game: Game,
  language: Language = 'es'
): Promise<{ success: boolean; error?: string }> {
  if (!game.organizerEmail) {
    return { success: false, error: 'No organizer email provided' }
  }

  const { subject, html, plainText } = generateNewOrganizerLinkEmailContent({ game, language })

  return await sendEmail({
    to: [{ address: game.organizerEmail }],
    subject,
    html,
    plainText
  })
}

export function generateEmailUpdatedEmailContent(data: EmailUpdatedEmailData): { subject: string; html: string; plainText: string } {
  const { gameName, participantName, oldEmail, newEmail, language } = data

  const translations: Partial<Record<Language, {
    subject: string
    greeting: string
    emailChanged: string
    forSecurity: string
    previousEmail: string
    newEmailLabel: string
    notYou: string
    contact: string
    headerTitle: string
    footer: string
  }>> = {
    es: {
      subject: `🔔 Tu email ha sido actualizado - "${gameName}"`,
      greeting: `Hola ${participantName},`,
      emailChanged: 'Te informamos que tu dirección de correo electrónico ha sido actualizada en el juego de Zava Gift Exchange.',
      forSecurity: 'Por seguridad, te enviamos esta notificación a tu nueva dirección de correo.',
      previousEmail: 'Email anterior',
      newEmailLabel: 'Nuevo email',
      notYou: '¿No fuiste tú?',
      contact: 'Si no realizaste este cambio, por favor contacta al organizador del evento inmediatamente.',
      headerTitle: 'Email Actualizado',
      footer: 'Gracias por usar Zava Gift Exchange.'
    },
    en: {
      subject: `🔔 Your email has been updated - "${gameName}"`,
      greeting: `Hello ${participantName},`,
      emailChanged: 'We\'re writing to let you know that your email address has been updated in the Zava Gift Exchange game.',
      forSecurity: 'For security purposes, we\'re sending this notification to your new email address.',
      previousEmail: 'Previous email',
      newEmailLabel: 'New email',
      notYou: 'Wasn\'t you?',
      contact: 'If you didn\'t make this change, please contact the event organizer immediately.',
      headerTitle: 'Email Updated',
      footer: 'Thank you for using Zava Gift Exchange.'
    },
    pt: {
      subject: `🔔 Seu email foi atualizado - "${gameName}"`,
      greeting: `Olá ${participantName},`,
      emailChanged: 'Informamos que seu endereço de email foi atualizado no jogo de Zava Gift Exchange.',
      forSecurity: 'Por segurança, estamos enviando esta notificação para seu novo endereço de email.',
      previousEmail: 'Email anterior',
      newEmailLabel: 'Novo email',
      notYou: 'Não foi você?',
      contact: 'Se você não fez esta alteração, entre em contato com o organizador do evento imediatamente.',
      headerTitle: 'Email Atualizado',
      footer: 'Obrigado por usar o Zava Gift Exchange.'
    },
    fr: {
      subject: `🔔 Votre email a été mis à jour - "${gameName}"`,
      greeting: `Bonjour ${participantName},`,
      emailChanged: 'Nous vous informons que votre adresse email a été mise à jour dans le jeu Zava Gift Exchange.',
      forSecurity: 'Pour des raisons de sécurité, nous envoyons cette notification à votre nouvelle adresse email.',
      previousEmail: 'Email précédent',
      newEmailLabel: 'Nouvel email',
      notYou: 'Ce n\'était pas vous ?',
      contact: 'Si vous n\'avez pas effectué ce changement, veuillez contacter l\'organisateur de l\'événement immédiatement.',
      headerTitle: 'Email Mis à Jour',
      footer: 'Merci d\'utiliser Zava Gift Exchange.'
    },
    it: {
      subject: `🔔 La tua email è stata aggiornata - "${gameName}"`,
      greeting: `Ciao ${participantName},`,
      emailChanged: 'Ti informiamo che il tuo indirizzo email è stato aggiornato nel gioco Zava Gift Exchange.',
      forSecurity: 'Per sicurezza, stiamo inviando questa notifica al tuo nuovo indirizzo email.',
      previousEmail: 'Email precedente',
      newEmailLabel: 'Nuova email',
      notYou: 'Non sei stato tu?',
      contact: 'Se non hai effettuato questa modifica, contatta immediatamente l\'organizzatore dell\'evento.',
      headerTitle: 'Email Aggiornata',
      footer: 'Grazie per aver usato Zava Gift Exchange.'
    },
    ja: {
      subject: `🔔 メールアドレスが更新されました - 「${gameName}」`,
      greeting: `${participantName}さん、こんにちは。`,
      emailChanged: 'Zava ギフト交換ゲームでメールアドレスが更新されたことをお知らせします。',
      forSecurity: 'セキュリティのため、この通知を新しいメールアドレスに送信しています。',
      previousEmail: '以前のメール',
      newEmailLabel: '新しいメール',
      notYou: 'あなたではありませんか？',
      contact: 'この変更を行っていない場合は、すぐにイベント主催者に連絡してください。',
      headerTitle: 'メール更新',
      footer: 'Zava ギフト交換をご利用いただきありがとうございます。'
    },
    zh: {
      subject: `🔔 您的邮箱已更新 - "${gameName}"`,
      greeting: `${participantName}，您好，`,
      emailChanged: '我们通知您，您在Zava 礼物交换游戏中的电子邮箱地址已更新。',
      forSecurity: '出于安全考虑，我们将此通知发送到您的新电子邮箱地址。',
      previousEmail: '之前的邮箱',
      newEmailLabel: '新邮箱',
      notYou: '不是您本人操作？',
      contact: '如果您没有进行此更改，请立即联系活动组织者。',
      headerTitle: '邮箱已更新',
      footer: '感谢使用Zava 礼物交换。'
    },
    de: {
      subject: `🔔 Deine E-Mail wurde aktualisiert - "${gameName}"`,
      greeting: `Hallo ${participantName},`,
      emailChanged: 'Wir möchten dich informieren, dass deine E-Mail-Adresse im Zava Geschenktausch-Spiel aktualisiert wurde.',
      forSecurity: 'Aus Sicherheitsgründen senden wir diese Benachrichtigung an deine neue E-Mail-Adresse.',
      previousEmail: 'Vorherige E-Mail',
      newEmailLabel: 'Neue E-Mail',
      notYou: 'Warst du das nicht?',
      contact: 'Wenn du diese Änderung nicht vorgenommen hast, kontaktiere bitte sofort den Veranstalter.',
      headerTitle: 'E-Mail Aktualisiert',
      footer: 'Danke, dass du Zava Geschenktausch verwendest.'
    },
    nl: {
      subject: `🔔 Je e-mail is bijgewerkt - "${gameName}"`,
      greeting: `Hallo ${participantName},`,
      emailChanged: 'We laten je weten dat je e-mailadres is bijgewerkt in het Zava Gift Exchange spel.',
      forSecurity: 'Om veiligheidsredenen sturen we deze melding naar je nieuwe e-mailadres.',
      previousEmail: 'Vorige e-mail',
      newEmailLabel: 'Nieuwe e-mail',
      notYou: 'Was jij dit niet?',
      contact: 'Als je deze wijziging niet hebt aangebracht, neem dan onmiddellijk contact op met de organisator.',
      headerTitle: 'E-mail Bijgewerkt',
      footer: 'Bedankt voor het gebruik van Zava Gift Exchange.'
    }
  }

  const t = getTranslation(translations, language)

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 30px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px;">🔔 ${t.headerTitle}</h1>
    </div>
    
    <div style="padding: 30px;">
      <p style="font-size: 16px; color: #333; margin-bottom: 20px;">${t.greeting}</p>
      
      <p style="font-size: 16px; color: #333; margin-bottom: 15px;">${t.emailChanged}</p>
      
      <p style="font-size: 14px; color: #666; margin-bottom: 20px;">${t.forSecurity}</p>
      
      <div style="background: #eff6ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
        <p style="margin: 5px 0; color: #1e40af;"><strong>${t.previousEmail}:</strong> ${oldEmail}</p>
        <p style="margin: 5px 0; color: #1e40af;"><strong>${t.newEmailLabel}:</strong> ${newEmail}</p>
      </div>
      
      <div style="background: #eff6ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
        <p style="margin: 0; color: #991b1b; font-weight: bold;">${t.notYou}</p>
        <p style="margin: 5px 0 0 0; color: #991b1b; font-size: 14px;">${t.contact}</p>
      </div>
    </div>
    
    <div style="padding: 20px; background-color: #f9fafb; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="font-size: 12px; color: #9ca3af; margin: 0;">${t.footer}</p>
    </div>
  </div>
</body>
</html>
`

  const plainText = `${t.greeting}\n\n${t.emailChanged}\n\n${t.forSecurity}\n\n${t.previousEmail}: ${oldEmail}\n${t.newEmailLabel}: ${newEmail}\n\n${t.notYou}\n${t.contact}\n\n${t.footer}`

  return { subject: t.subject, html, plainText }
}

export async function sendEmailUpdatedNotification(
  newEmail: string,
  participantName: string,
  gameName: string,
  oldEmail: string,
  language: Language = 'en'
): Promise<{ success: boolean; error?: string }> {
  const { subject, html, plainText } = generateEmailUpdatedEmailContent({
    gameName,
    participantName,
    oldEmail,
    newEmail,
    language
  })

  return await sendEmail({
    to: [{ address: newEmail, displayName: participantName }],
    subject,
    html,
    plainText
  })
}