type Status = 'connecting' | 'connected' | 'disconnected' | 'error';

interface Props {
  status: Status;
}

const statusColorMap: Record<Status, string> = {
  connecting: 'bg-yellow-500',
  connected: 'bg-green-500',
  disconnected: 'bg-gray-500',
  error: 'bg-red-500',
};

const statusLabelMap: Record<Status, string> = {
  connecting: 'Connecting',
  connected: 'Connected',
  disconnected: 'Disconnected',
  error: 'Connection error',
};

export const ConnectionStatus = ({ status }: Props) => {
  const label = statusLabelMap[status];

  return (
    <div
      className="flex items-center gap-2"
      role="status"
      aria-label={`Stream connection status: ${label}`}
    >
      <div
        className={`h-3 w-3 rounded-full ${statusColorMap[status]}`}
        aria-hidden="true"
      />

      <span className="text-sm font-medium">
        {label}
      </span>
    </div>
  );
};