import { test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Accessibility tests using axe-core / WCAG 2.x rules.
 *
 * Each test scans a key page and writes all violations to
 * playwright-report/a11y/<page>.json so the CI summary script can
 * aggregate and report counts by severity.
 *
 * Tests fail only on critical / serious violations so that moderate /
 * minor issues are visible in the report without blocking PRs outright.
 */

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
const A11Y_REPORT_DIR = path.join('playwright-report', 'a11y')

function saveViolations(pageName: string, violations: object[]): void {
  fs.mkdirSync(A11Y_REPORT_DIR, { recursive: true })
  fs.writeFileSync(
    path.join(A11Y_REPORT_DIR, `${pageName}.json`),
    JSON.stringify(violations, null, 2),
  )
}

test.describe('Accessibility (axe-core)', () => {
  test('home page has no critical or serious violations', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
    saveViolations('home', violations)

    const blocking = violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    )
    if (blocking.length > 0) {
      const details = blocking
        .map((v) => `  [${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} node(s))`)
        .join('\n')
      throw new Error(
        `${blocking.length} critical/serious violation(s) on home page:\n${details}`,
      )
    }
  })

  test('create game page has no critical or serious violations', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /crear nuevo juego|create new game/i }).click()
    await page.waitForLoadState('domcontentloaded')

    const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
    saveViolations('create-game', violations)

    const blocking = violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    )
    if (blocking.length > 0) {
      const details = blocking
        .map((v) => `  [${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} node(s))`)
        .join('\n')
      throw new Error(
        `${blocking.length} critical/serious violation(s) on create-game page:\n${details}`,
      )
    }
  })

  test('privacy page has no critical or serious violations', async ({ page }) => {
    await page.goto('/?view=privacy')
    await page.waitForLoadState('networkidle')

    const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
    saveViolations('privacy', violations)

    const blocking = violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    )
    if (blocking.length > 0) {
      const details = blocking
        .map((v) => `  [${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} node(s))`)
        .join('\n')
      throw new Error(
        `${blocking.length} critical/serious violation(s) on privacy page:\n${details}`,
      )
    }
  })
})
