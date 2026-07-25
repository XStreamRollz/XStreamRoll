import { ApiProperty } from "@nestjs/swagger"

export class StreamEventCountsDto {
  @ApiProperty({ example: 42 })
  last24h!: number

  @ApiProperty({ example: 512 })
  last7d!: number

  @ApiProperty({ example: 1840 })
  last30d!: number
}

export class StreamErrorRateDto {
  @ApiProperty({ example: "30d" })
  window!: "30d"

  @ApiProperty({ example: 1840 })
  totalEvents!: number

  @ApiProperty({ example: 23 })
  errorEvents!: number

  @ApiProperty({
    description: "Percentage of events whose event_type is error.",
    example: 1.25,
  })
  percentage!: number
}

export class StreamLatencyDto {
  @ApiProperty({ example: "30d" })
  window!: "30d"

  @ApiProperty({
    description: "Average processing latency in milliseconds, or null when no latency samples exist.",
    nullable: true,
    example: 18.42,
  })
  averageMs!: number | null

  @ApiProperty({
    description: "99th percentile processing latency in milliseconds, or null when no latency samples exist.",
    nullable: true,
    example: 91,
  })
  p99Ms!: number | null
}

export class EventsPerMinuteDto {
  @ApiProperty({ example: "2026-07-17T16:21:00.000Z" })
  minute!: string

  @ApiProperty({ example: 8 })
  count!: number
}

export class StreamAnalyticsDto {
  @ApiProperty({ example: 12 })
  streamId!: number

  @ApiProperty({ type: StreamEventCountsDto })
  totalEventsProcessed!: StreamEventCountsDto

  @ApiProperty({ type: StreamErrorRateDto })
  errorRate!: StreamErrorRateDto

  @ApiProperty({ type: StreamLatencyDto })
  processingLatency!: StreamLatencyDto

  @ApiProperty({ type: [EventsPerMinuteDto] })
  eventsPerMinute!: EventsPerMinuteDto[]

  @ApiProperty({ example: "2026-07-17T16:21:32.000Z" })
  generatedAt!: string
}
