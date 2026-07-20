interface StreamEvent {
  id: string
  type: string
  timestamp: string | number
  message: string
}

interface Props {
  events: StreamEvent[]
}

export const StreamFeed = ({ events }: Props) => {
  if (events.length === 0) {
    return <div className="text-sm text-gray-500">No events received yet.</div>
  }

  return (
    <div className="space-y-3">
      {events.map((event) => (
        <div key={event.id} className="rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold">{event.type}</span>

            <span className="text-xs text-gray-500">
              {new Date(event.timestamp).toLocaleTimeString()}
            </span>
          </div>

          <p className="mt-2 text-sm">{event.message}</p>
        </div>
      ))}
    </div>
  )
}
