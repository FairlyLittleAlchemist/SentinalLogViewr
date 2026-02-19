import { expect, test, type Page } from "@playwright/test"

async function login(page: Page) {
  const email = process.env.E2E_EMAIL
  const password = process.env.E2E_PASSWORD
  test.skip(!email || !password, "Set E2E_EMAIL and E2E_PASSWORD to run smoke e2e.")

  await page.goto("/auth")
  await page.locator('input[type="email"]').fill(String(email))
  await page.locator('input[type="password"]').first().fill(String(password))
  await page.getByRole("button", { name: /sign in|se connecter/i }).click()
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 30_000 })
}

test("smoke: create case + bind playbook + create board + add evidence", async ({ page, request }) => {
  await login(page)

  const alertsRes = await request.get("/api/alerts?page=1&pageSize=5&type=all")
  expect(alertsRes.ok()).toBeTruthy()
  const alertsPayload = (await alertsRes.json()) as { alerts?: Array<{ id: string }> }
  const alertId = alertsPayload.alerts?.[0]?.id
  expect(alertId).toBeTruthy()

  const playbooksRes = await request.get("/api/playbooks")
  expect(playbooksRes.ok()).toBeTruthy()
  const playbooksPayload = (await playbooksRes.json()) as { playbooks?: Array<{ id: string }> }
  const playbookId = playbooksPayload.playbooks?.[0]?.id ?? null

  const createCaseRes = await request.post("/api/cases", {
    data: {
      alertId,
      priority: "medium",
      playbookId,
    },
  })
  expect(createCaseRes.ok()).toBeTruthy()
  const createCasePayload = (await createCaseRes.json()) as { case?: { id: string } }
  const caseId = createCasePayload.case?.id
  expect(caseId).toBeTruthy()

  if (playbookId) {
    const bindRes = await request.post(`/api/cases/${caseId}/playbook`, {
      data: { action: "bind", templateId: playbookId },
    })
    expect(bindRes.ok()).toBeTruthy()
  }

  const createBoardRes = await request.post("/api/boards", {
    data: {
      name: `Smoke ${new Date().toISOString()}`,
      caseId,
      boardType: "master_shared",
    },
  })
  expect(createBoardRes.ok()).toBeTruthy()
  const createBoardPayload = (await createBoardRes.json()) as { board?: { id: string } }
  const boardId = createBoardPayload.board?.id
  expect(boardId).toBeTruthy()

  const saveBoardStateRes = await request.put(`/api/boards/${boardId}/state`, {
    data: {
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "smoke-node-1",
          position: { x: 20, y: 20 },
          data: { label: "Smoke Node", nodeType: "entity" },
        },
      ],
      edges: [],
    },
  })
  expect(saveBoardStateRes.ok()).toBeTruthy()

  const evidenceRes = await request.post(`/api/cases/${caseId}/evidence`, {
    data: {
      label: "Smoke evidence",
      evidenceType: "note",
      details: "Created by e2e smoke test",
    },
  })
  expect(evidenceRes.ok()).toBeTruthy()
})
