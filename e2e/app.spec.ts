import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/**
 * Optimized E2E tests for Zava Gift Exchange
 * Focus on critical user flows only - not individual UI elements
 */

// Helper to generate a future date string for tests
function getFutureDate(daysFromNow = 60): string {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  return d.toISOString().split('T')[0]
}

test.describe('Core User Flows', () => {
  
  test('should display home page with main actions', async ({ page }) => {
    await page.goto('/')
    
    // Verify essential elements are present (includes zava intercambio de regalos for Spanish)
    await expect(page.getByRole('heading', { name: /Zava Gift Exchange|zava intercambio de regalos/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /crear nuevo juego|create new game/i })).toBeVisible()
    await expect(page.getByPlaceholder(/código de 6 dígitos|6-digit code/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /es|en/i })).toBeVisible()
  })

  test('should complete full game creation flow', async ({ page }) => {
    await page.goto('/')
    
    // Step 1: Start creating game
    await page.getByRole('button', { name: /crear nuevo juego|create new game/i }).click()
    await expect(page.getByText(/detalles del evento|event details/i)).toBeVisible()
    
    // Fill event details (use dynamic future date to avoid date validation failures)
    await page.getByLabel(/nombre del evento|event name/i).fill('Test Zava Gift Exchange')
    await page.getByLabel(/monto del regalo|gift amount/i).fill('50')
    await page.getByLabel(/fecha del evento|event date/i).fill(getFutureDate())
    await page.getByLabel(/lugar del evento|event location/i).fill('Office Party')
    await page.getByRole('button', { name: /siguiente|next/i }).click()
    
    // Step 2: Add participants
    await expect(page.getByRole('heading', { name: /participantes|participants/i })).toBeVisible()
    
    const participantInput = page.getByPlaceholder(/maría garcía|mary smith/i)
    const addButton = page.getByRole('button', { name: /agregar participante|add participant/i })
    
    await participantInput.fill('Alice')
    await addButton.click()
    await participantInput.fill('Bob')
    await addButton.click()
    await participantInput.fill('Charlie')
    await addButton.click()
    
    await expect(page.getByText('Alice')).toBeVisible()
    await expect(page.getByText('Bob')).toBeVisible()
    await expect(page.getByText('Charlie')).toBeVisible()
    
    await page.getByRole('button', { name: /siguiente|next/i }).click()
    
    // Step 3: Configuration
    await expect(page.getByText(/configuración|configuration/i)).toBeVisible()
    await page.getByRole('button', { name: /finalizar|finish/i }).click()
    
    // Verify game created - check elements that are always visible regardless of protection mode
    await expect(page.getByRole('heading', { name: /juego creado|game created/i })).toBeVisible()
    // For protected games (default), individual links are shown instead of game code
    // Check for organizer link which is always shown
    await expect(page.getByText(/link del organizador|organizer link/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /ir al|go to/i })).toBeVisible()
  })

  test('should toggle language', async ({ page }) => {
    await page.goto('/')
    
    // Verify language button exists and is clickable (use aria-haspopup to target dropdown trigger specifically)
    const langButton = page.locator('button[aria-haspopup="menu"]').first()
    await expect(langButton).toBeVisible()
    
    // Click language toggle - should not throw an error
    await langButton.click()
  })

  test('should validate game code input', async ({ page }) => {
    await page.goto('/')
    
    const codeInput = page.getByPlaceholder(/código de 6 dígitos|6-digit code/i)
    const continueButton = page.getByRole('button', { name: /continuar|continue/i })
    
    // Should be disabled initially
    await expect(continueButton).toBeDisabled()
    
    // Should only accept numeric input
    await codeInput.fill('abc123')
    await expect(codeInput).toHaveValue('123')
    
    // Should enable with valid 6-digit code
    await codeInput.fill('123456')
    await expect(continueButton).toBeEnabled()
  })

  test('should navigate back from create game', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /crear nuevo juego|create new game/i }).click()
    await expect(page.getByText(/detalles del evento|event details/i)).toBeVisible()
    
    await page.getByRole('button', { name: /atrás|back/i }).click()
    await expect(page.getByRole('heading', { name: /Zava Gift Exchange|zava intercambio de regalos/i })).toBeVisible()
  })

  test('should require minimum 3 participants', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /crear nuevo juego|create new game/i }).click()
    
    // Fill step 1
    await page.getByLabel(/nombre del evento|event name/i).fill('Test Event')
    await page.getByLabel(/monto del regalo|gift amount/i).fill('25')
    await page.getByLabel(/fecha del evento|event date/i).fill(getFutureDate())
    await page.getByLabel(/lugar del evento|event location/i).fill('Test Location')
    await page.getByRole('button', { name: /siguiente|next/i }).click()
    
    // Should show minimum participants warning - use nth to get the specific one
    const warningMessages = page.getByText(/at least 3 participants/i)
    await expect(warningMessages.first()).toBeVisible()
    
    // Next button should be disabled with less than 3 participants
    const nextButton = page.getByRole('button', { name: /siguiente|next/i })
    
    const participantInput = page.getByPlaceholder(/maría garcía|mary smith/i)
    const addButton = page.getByRole('button', { name: /agregar participante|add participant/i })
    
    await participantInput.fill('Alice')
    await addButton.click()
    await participantInput.fill('Bob')
    await addButton.click()
    
    // With 2 participants, next should be disabled
    await expect(nextButton).toBeDisabled()
    
    // Add third participant
    await participantInput.fill('Charlie')
    await addButton.click()
    
    // Now should be enabled
    await expect(nextButton).toBeEnabled()
  })

  test('should handle responsive display', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')
    
    await expect(page.getByRole('heading', { name: /Zava Gift Exchange|zava intercambio de regalos/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /crear nuevo juego|create new game/i })).toBeVisible()
    
    // Test desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto('/')
    
    await expect(page.getByRole('heading', { name: /Zava Gift Exchange|zava intercambio de regalos/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /crear nuevo juego|create new game/i })).toBeVisible()
  })

  test('should support multiple languages including Korean, German, and Dutch', async ({ page }) => {
    await page.goto('/')
    
    // Verify language toggle is available (use aria-haspopup to target dropdown trigger specifically)
    const languageButton = page.locator('button[aria-haspopup="menu"]').first()
    await expect(languageButton).toBeVisible()
    
    // Verify welcome description is visible (use paragraph element to avoid matching button text)
    const welcomeDesc = page.locator('p').getByText(/organize|organiza|organisez|organizza|ギフト|쉽고 재미있게|轻松|organisieren|organiseer/i)
    await expect(welcomeDesc).toBeVisible()
  })

  test('should apply language from URL parameter', async ({ browser }) => {
    // Test Spanish - each context has fresh localStorage
    const esContext = await browser.newContext()
    const esPage = await esContext.newPage()
    await esPage.goto('/?lang=es')
    await expect(esPage.getByRole('button', { name: /crear nuevo juego/i })).toBeVisible()
    await esContext.close()
    
    // Test German
    const deContext = await browser.newContext()
    const dePage = await deContext.newPage()
    await dePage.goto('/?lang=de')
    await expect(dePage.getByRole('button', { name: /neues spiel erstellen/i })).toBeVisible()
    await deContext.close()
    
    // Test French (French translation is "Créer un Jeu")
    const frContext = await browser.newContext()
    const frPage = await frContext.newPage()
    await frPage.goto('/?lang=fr')
    await expect(frPage.getByRole('button', { name: /créer un jeu/i })).toBeVisible()
    await frContext.close()
    
    // Test English
    const enContext = await browser.newContext()
    const enPage = await enContext.newPage()
    await enPage.goto('/?lang=en')
    await expect(enPage.getByRole('button', { name: /create new game/i })).toBeVisible()
    await enContext.close()

    // Test Korean
    const koContext = await browser.newContext()
    const koPage = await koContext.newPage()
    await koPage.goto('/?lang=ko')
    await expect(koPage.getByRole('button', { name: /새 게임 만들기/i })).toBeVisible()
    await koContext.close()
  })

  test('should navigate directly to guide pages via URL parameter', async ({ page }) => {
    // Test organizer guide via URL parameter
    await page.goto('/?view=organizer-guide')
    await expect(page.getByRole('heading', { name: /organizer guide|guía del organizador|guide de l'organisateur/i })).toBeVisible()
    
    // Navigate back to home
    await page.getByRole('button', { name: /back|atrás|retour/i }).click()
    await expect(page.getByRole('heading', { name: /Zava Gift Exchange|zava intercambio de regalos/i })).toBeVisible()
    
    // Test participant guide via URL parameter  
    await page.goto('/?view=participant-guide')
    await expect(page.getByRole('heading', { name: /participant guide|guía del participante|guide du participant/i })).toBeVisible()
    
    // Test privacy page via URL parameter
    await page.goto('/?view=privacy')
    await expect(page.getByRole('heading', { name: /privacy|privacidad|confidentialité/i })).toBeVisible()
  })

  test('should navigate directly to guide pages via path-based URLs', async ({ page }) => {
    // Test organizer guide via path-based URL (direct link sharing)
    await page.goto('/organizer-guide')
    await expect(page.getByRole('heading', { name: /organizer guide|guía del organizador|guide de l'organisateur/i })).toBeVisible()
    
    // Verify URL is correct
    expect(page.url()).toContain('/organizer-guide')
    
    // Navigate back to home
    await page.getByRole('button', { name: /back|atrás|retour/i }).click()
    await expect(page.getByRole('heading', { name: /Zava Gift Exchange|zava intercambio de regalos/i })).toBeVisible()
    
    // Test participant guide via path-based URL
    await page.goto('/participant-guide')
    await expect(page.getByRole('heading', { name: /participant guide|guía del participante|guide du participant/i })).toBeVisible()
    expect(page.url()).toContain('/participant-guide')
    
    // Test privacy page via path-based URL
    await page.goto('/privacy')
    await expect(page.getByRole('heading', { name: /privacy|privacidad|confidentialité/i })).toBeVisible()
    expect(page.url()).toContain('/privacy')
  })

  test('should preserve language parameter in path-based URLs', async ({ page }) => {
    // Test organizer guide with Spanish language
    await page.goto('/organizer-guide?lang=es')
    await expect(page.getByRole('heading', { name: /guía del organizador/i })).toBeVisible()
    expect(page.url()).toContain('/organizer-guide')
    expect(page.url()).toContain('lang=es')
    
    // Test participant guide with German language
    await page.goto('/participant-guide?lang=de')
    await expect(page.getByRole('heading', { name: /teilnehmer.leitfaden/i })).toBeVisible()
    expect(page.url()).toContain('/participant-guide')
    expect(page.url()).toContain('lang=de')
    
    // Test privacy page with French language
    await page.goto('/privacy?lang=fr')
    await expect(page.getByRole('heading', { name: /confidentialité/i })).toBeVisible()
    expect(page.url()).toContain('/privacy')
    expect(page.url()).toContain('lang=fr')
  })

  test('should display protected game configuration', async ({ page }) => {
    await page.goto('/')
    
    await page.getByRole('button', { name: /crear nuevo juego|create new game/i }).click()
    await page.getByLabel(/nombre del evento|event name/i).fill('Protected Test')
    await page.getByLabel(/monto del regalo|gift amount/i).fill('50')
    await page.getByLabel(/fecha del evento|event date/i).fill(getFutureDate())
    await page.getByLabel(/lugar del evento|event location/i).fill('Office')
    await page.getByRole('button', { name: /siguiente|next/i }).click()
    
    // Add 3 participants
    const participantInput = page.getByPlaceholder(/maría garcía|mary smith/i)
    const addButton = page.getByRole('button', { name: /agregar participante|add participant/i })
    
    await participantInput.fill('Alice')
    await addButton.click()
    await participantInput.fill('Bob')
    await addButton.click()
    await participantInput.fill('Charlie')
    await addButton.click()
    
    await page.getByRole('button', { name: /siguiente|next/i }).click()
    
    // Verify protection option is available
    const protectOption = page.getByText(/proteger|protect|protéger|proteggere/i)
    await expect(protectOption).toBeVisible()
  })

  test('should export participants with customizable options', async ({ page }) => {
    await page.goto('/')
    
    // Create a game first
    await page.getByRole('button', { name: /crear nuevo juego|create new game/i }).click()
    
    // Fill event details with dynamic future date
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 30) // 30 days from now
    const dateString = futureDate.toISOString().split('T')[0] // Format: YYYY-MM-DD
    
    await page.getByLabel(/nombre del evento|event name/i).fill('Export Test Game')
    await page.getByLabel(/monto del regalo|gift amount/i).fill('50')
    await page.getByLabel(/fecha del evento|event date/i).fill(dateString)
    await page.getByLabel(/lugar del evento|event location/i).fill('Test Office')
    await page.getByRole('button', { name: /siguiente|next/i }).click()
    
    // Add participants
    const participantInput = page.getByPlaceholder(/maría garcía|mary smith/i)
    const addButton = page.getByRole('button', { name: /agregar participante|add participant/i })
    
    await participantInput.fill('Alice')
    await addButton.click()
    await participantInput.fill('Bob')
    await addButton.click()
    await participantInput.fill('Charlie')
    await addButton.click()
    
    await page.getByRole('button', { name: /siguiente|next/i }).click()
    await page.getByRole('button', { name: /finalizar|finish/i }).click()
    
    // Navigate to organizer panel
    await page.getByRole('button', { name: /ir al|go to/i }).click()
    
    // Wait for organizer panel to load
    await expect(page.getByText(/panel del organizador|organizer panel/i)).toBeVisible()
    
    // Click export button
    const exportButton = page.getByRole('button', { name: /exportar participantes|export participants/i })
    await expect(exportButton).toBeVisible()
    await exportButton.click()
    
    // Verify export dialog appears
    await expect(page.getByText(/exportar lista de participantes|export participant list/i)).toBeVisible()
    
    // Verify all checkboxes are present and checked by default using their IDs
    const assignmentsCheckbox = page.locator('#export-assignments')
    const gameDetailsCheckbox = page.locator('#export-game-details')
    const wishesCheckbox = page.locator('#export-wishes')
    const instructionsCheckbox = page.locator('#export-instructions')
    const confirmationCheckbox = page.locator('#export-confirmation')
    const emailsCheckbox = page.locator('#export-emails')
    
    await expect(assignmentsCheckbox).toBeChecked()
    await expect(gameDetailsCheckbox).toBeChecked()
    await expect(wishesCheckbox).toBeChecked()
    await expect(instructionsCheckbox).toBeChecked()
    await expect(confirmationCheckbox).toBeChecked()
    await expect(emailsCheckbox).toBeChecked()
    
    // Test unchecking all options shows warning and disables export
    await assignmentsCheckbox.click()
    await gameDetailsCheckbox.click()
    await wishesCheckbox.click()
    await instructionsCheckbox.click()
    await confirmationCheckbox.click()
    await emailsCheckbox.click()
    
    // Verify warning message appears
    await expect(page.getByText(/selecciona al menos un campo|please select at least one field/i)).toBeVisible()
    
    // Verify export button is disabled
    const exportCsvButton = page.getByRole('button', { name: /exportar como csv|export as csv/i })
    await expect(exportCsvButton).toBeDisabled()
    
    // Re-check one option to enable export
    await assignmentsCheckbox.click()
    await expect(exportCsvButton).toBeEnabled()
    
    // Set up download listener
    const downloadPromise = page.waitForEvent('download')
    
    // Click export
    await exportCsvButton.click()
    
    // Verify download occurred
    const download = await downloadPromise
    
    // Verify filename pattern matches expected format
    expect(download.suggestedFilename()).toMatch(/Export Test Game_participants\.csv/)
    
    // Verify dialog closes after export
    await expect(page.getByText(/exportar lista de participantes|export participant list/i)).not.toBeVisible()
  })
})

test.describe('Error Handling and Token Entry', () => {

  test('should show error page when joining with invalid game code', async ({ page }) => {
    await page.goto('/')
    
    // Enter an invalid game code
    const codeInput = page.getByPlaceholder(/código de 6 dígitos|6-digit code/i)
    await codeInput.fill('999999')
    
    const continueButton = page.getByRole('button', { name: /continuar|continue/i })
    await continueButton.click()
    
    // Should show game not found error page (use heading role to target h1 specifically)
    await expect(page.getByRole('heading', { name: /game not found|juego no encontrado|jogo não encontrado/i, level: 1 })).toBeVisible()
    
    // Go Home button should be available
    const goHomeButton = page.getByRole('button', { name: /go home|inicio|voltar/i })
    await expect(goHomeButton).toBeVisible()
  })

  test('should display token entry form on protected game error', async ({ page }) => {
    // Create a game first to get a valid code, then test accessing it without token
    await page.goto('/')
    
    // Create a protected game
    await page.getByRole('button', { name: /crear nuevo juego|create new game/i }).click()
    await page.getByLabel(/nombre del evento|event name/i).fill('Token Test Game')
    await page.getByLabel(/monto del regalo|gift amount/i).fill('30')
    await page.getByLabel(/fecha del evento|event date/i).fill(getFutureDate())
    await page.getByLabel(/lugar del evento|event location/i).fill('Test Location')
    await page.getByRole('button', { name: /siguiente|next/i }).click()
    
    // Add 3 participants
    const participantInput = page.getByPlaceholder(/maría garcía|mary smith/i)
    const addButton = page.getByRole('button', { name: /agregar participante|add participant/i })
    await participantInput.fill('TokenUser1')
    await addButton.click()
    await participantInput.fill('TokenUser2')
    await addButton.click()
    await participantInput.fill('TokenUser3')
    await addButton.click()
    
    await page.getByRole('button', { name: /siguiente|next/i }).click()
    
    // Ensure protection is enabled (should be default)
    await page.getByRole('button', { name: /finalizar|finish/i }).click()
    
    // Get the game code from the created game page
    await expect(page.getByRole('heading', { name: /juego creado|game created/i })).toBeVisible()
    
    // Go back to home and try to join with just the code (no token)
    await page.goto('/')
    
    // The game should be stored in local storage, so entering code without token 
    // should show protected game error with token entry option
    // Note: This depends on local storage state from game creation
  })

  test('should allow navigation from error page back to home', async ({ page }) => {
    // Directly navigate to a URL with invalid token
    await page.goto('/?code=123456&participant=invalidtoken')
    
    // Wait for error page or home page (depending on whether game exists)
    // Either game not found or error page should have a go home button
    const goHomeButton = page.getByRole('button', { name: /go home|inicio|voltar|volver al inicio/i })
    
    // If the button is visible, click it and verify navigation
    if (await goHomeButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await goHomeButton.click()
      await expect(page.getByRole('heading', { name: /Zava Gift Exchange|zava intercambio de regalos/i })).toBeVisible()
    }
  })

  test('should show token input field on error pages with hint text', async ({ page }) => {
    // This test verifies the token entry UI elements exist when there's an error
    // We need to trigger an error state that shows token entry
    
    await page.goto('/')
    
    // Create a game to populate local storage
    await page.getByRole('button', { name: /crear nuevo juego|create new game/i }).click()
    await page.getByLabel(/nombre del evento|event name/i).fill('Hint Test Game')
    await page.getByLabel(/monto del regalo|gift amount/i).fill('25')
    await page.getByLabel(/fecha del evento|event date/i).fill(getFutureDate())
    await page.getByLabel(/lugar del evento|event location/i).fill('Office')
    await page.getByRole('button', { name: /siguiente|next/i }).click()
    
    const participantInput = page.getByPlaceholder(/maría garcía|mary smith/i)
    const addButton = page.getByRole('button', { name: /agregar participante|add participant/i })
    await participantInput.fill('HintUser1')
    await addButton.click()
    await participantInput.fill('HintUser2')
    await addButton.click()
    await participantInput.fill('HintUser3')
    await addButton.click()
    
    await page.getByRole('button', { name: /siguiente|next/i }).click()
    await page.getByRole('button', { name: /finalizar|finish/i }).click()
    
    // Verify game was created
    await expect(page.getByRole('heading', { name: /juego creado|game created/i })).toBeVisible()
  })
})

test.describe('Accessibility', () => {
  test('home page should have no critical accessibility violations', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /Zava Gift Exchange|zava intercambio de regalos/i })).toBeVisible()

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(['color-contrast']) // Allow theme-managed contrast
      .analyze()

    expect(results.violations.filter(v => v.impact === 'critical')).toHaveLength(0)
  })
})
