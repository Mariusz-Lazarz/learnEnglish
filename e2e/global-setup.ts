import { chromium } from '@playwright/test'
import { config } from 'dotenv'
import path from 'path'

config({ path: '.env.local' })

export default async function globalSetup() {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.goto('http://localhost:3000/login')
  await page.getByLabel('Username').fill(process.env.AUTH_USERNAME!)
  await page.getByLabel('Password').fill(process.env.AUTH_PASSWORD!)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('http://localhost:3000/')
  await page.context().storageState({ path: path.join('e2e', '.auth', 'user.json') })
  await browser.close()
}
