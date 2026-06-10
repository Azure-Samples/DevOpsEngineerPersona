import { getEmailServiceStatus, initializeEmailService, escapeHtml, generateOrganizerEmailContent } from '../shared/email-service'

// Mock the EmailClient
jest.mock('@azure/communication-email', () => ({
  EmailClient: jest.fn().mockImplementation(() => ({
    beginSend: jest.fn()
  })),
  KnownEmailSendStatus: {
    Succeeded: 'Succeeded',
    Failed: 'Failed',
    Running: 'Running'
  }
}))

describe('Email Service', () => {
  const originalEnv = process.env

  beforeEach(() => {
    // Clear environment variables
    delete process.env.ACS_CONNECTION_STRING
    delete process.env.ACS_SENDER_ADDRESS
  })

  afterAll(() => {
    process.env = originalEnv
  })

  describe('getEmailServiceStatus', () => {
    it('should return not configured when env vars are not set and service not initialized', async () => {
      // Initialize without env vars
      await initializeEmailService()
      
      const status = getEmailServiceStatus()
      
      expect(status.configured).toBe(false)
      // Error message should indicate configuration issue
      expect(status.error).toBeTruthy()
    })

    it('should return configured when both env vars are set and initialized', async () => {
      process.env.ACS_CONNECTION_STRING = 'endpoint=https://test.communication.azure.com/;accesskey=testkey'
      process.env.ACS_SENDER_ADDRESS = 'DoNotReply@test.azurecomm.net'
      
      // Re-import to pick up new env vars
      jest.isolateModules(async () => {
        const { initializeEmailService: init, getEmailServiceStatus: getStatus } = require('../shared/email-service')
        await init()
        const status = getStatus()
        
        expect(status.configured).toBe(true)
        expect(status.error).toBeNull()
      })
    })
  })

  describe('initializeEmailService', () => {
    it('should handle EmailClient constructor throwing', async () => {
      process.env.ACS_CONNECTION_STRING = 'invalid-connection-string'
      process.env.ACS_SENDER_ADDRESS = 'test@test.com'

      const EmailClientMock = jest.requireMock('@azure/communication-email').EmailClient
      EmailClientMock.mockImplementationOnce(() => {
        throw new Error('Invalid connection string format')
      })

      await initializeEmailService()

      const status = getEmailServiceStatus()
      expect(status.configured).toBe(false)
      expect(status.error).toBe('Invalid connection string format')
    })
  })

  describe('escapeHtml', () => {
    it('should escape ampersands', () => {
      expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry')
    })

    it('should escape less-than signs', () => {
      expect(escapeHtml('<script>')).toBe('&lt;script&gt;')
    })

    it('should escape double quotes', () => {
      expect(escapeHtml('"Hello"')).toBe('&quot;Hello&quot;')
    })

    it('should escape single quotes', () => {
      expect(escapeHtml("It's fine")).toBe('It&#039;s fine')
    })

    it('should escape multiple special characters', () => {
      const input = '<a href="test">Tom & Jerry\'s</a>'
      const result = escapeHtml(input)
      expect(result).not.toContain('<')
      expect(result).not.toContain('>')
      expect(result).not.toContain('"')
      expect(result).not.toContain("'")
      expect(result).toContain('&amp;')
      expect(result).toContain('&lt;')
      expect(result).toContain('&gt;')
    })

    it('should return plain text unchanged', () => {
      expect(escapeHtml('Hello World')).toBe('Hello World')
    })

    it('should handle empty string', () => {
      expect(escapeHtml('')).toBe('')
    })
  })

  describe('Vietnamese language support', () => {
    it('should gracefully fallback to English email copy for unsupported Vietnamese templates', () => {
      const game = {
        code: '123456',
        name: 'Holiday Exchange',
        date: '2026-12-24',
        location: 'Main Office',
        amount: '20',
        organizerToken: 'org-token',
        participants: [{ id: '1' }, { id: '2' }, { id: '3' }]
      } as any

      const content = generateOrganizerEmailContent({ game, language: 'vi' })
      expect(content.subject).toContain('Holiday Exchange')
      expect(content.subject).toContain('Your Zava Gift Exchange game')
      expect(content.html).toContain('Game details')
    })
  })
})
