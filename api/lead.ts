import { handleLead } from '../server/lead-handler.js'

// Vercel Function: POST /api/lead

export async function POST(request: Request): Promise<Response> {
  return handleLead(request, {
    env: process.env,
    fetch,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log: (message, detail) => console.error(JSON.stringify({ message, ...detail })),
  })
}
