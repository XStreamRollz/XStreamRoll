type Status = "connecting" | "connected" | "disconnected" | "error"

interface Props {
  status: Status
}

const statusColorMap: Record<Status, string> = {
  connecting: "bg-yellow-500",
  connected: "bg-green-500",
  disconnected: "bg-gray-500",
  error: "bg-red-500",
}

export const ConnectionStatus = ({ status }: Props) => {
  return (
    <div className="flex items-center gap-2">
      <div className={`h-3 w-3 rounded-full ${statusColorMap[status]}`} />

      <span className="text-sm font-medium capitalize">{status}</span>
    </div>
  )
}
