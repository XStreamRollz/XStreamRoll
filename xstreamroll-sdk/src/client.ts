import axios from "axios"
import type { StreamEvent, StreamConfig } from "./types"

/** Named environment presets for base URL resolution. */
export type ClientEnv = "development" | "staging" | "production"

const ENV_URLS: Record<ClientEnv, string> = {
  development: "http://localhost:3001",
  staging: "https://staging-api.xstreamroll.io",
  production: "https://api.xstreamroll.io",
}

export class StreamingClient {
  private apiUrl: string
  private clientId: string

  constructor(config: StreamConfig) {
    if (config.baseUrl) {
      this.apiUrl = config.baseUrl
    } else if (config.env) {
      this.apiUrl = ENV_URLS[config.env]
    } else {
      this.apiUrl = config.apiUrl ?? ENV_URLS.development
    }
    this.clientId = config.clientId || `client-${Date.now()}`
  }

  async publishEvent(event: StreamEvent): Promise<void> {
    try {
      await axios.post(`${this.apiUrl}/streams/events`, {
        clientId: this.clientId,
        ...event,
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      console.error("Failed to publish event:", error)
      throw error
    }
  }

  async getStreamStatus(streamId: string): Promise<any> {
    try {
      const response = await axios.get(`${this.apiUrl}/streams/${streamId}`)
      return response.data
    } catch (error) {
      console.error("Failed to get stream status:", error)
      throw error
    }
  }
}
