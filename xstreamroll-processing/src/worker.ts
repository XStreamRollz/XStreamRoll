import axios from "axios"
import { env } from "./config"

interface StreamEvent {
  streamId: string
  data: Record<string, any>
  timestamp: string
}

const API_URL = env.API_URL
const WORKER_ID = `worker-${Date.now()}`

class StreamProcessor {
  async processEvent(event: StreamEvent): Promise<void> {
    try {
      console.log(`[${WORKER_ID}] Processing event:`, event.streamId)

      // Process stream data
      const processed = {
        ...event,
        processedAt: new Date().toISOString(),
        workerId: WORKER_ID,
      }

      // Send processed data back to API
      await axios.post(`${API_URL}/streams/processed`, processed)
    } catch (error) {
      console.error(`[${WORKER_ID}] Processing failed:`, error)
    }
  }

  async start(): Promise<void> {
    console.log(`[${WORKER_ID}] Stream processor started`)

    // Poll for events every 5 seconds
    setInterval(async () => {
      try {
        const response = await axios.get(`${API_URL}/streams/pending`)
        const events = response.data || []

        for (const event of events) {
          await this.processEvent(event)
        }
      } catch (error) {
        console.error(`[${WORKER_ID}] Polling failed:`, error)
      }
    }, 5000)
  }
}

const processor = new StreamProcessor()
processor.start()
