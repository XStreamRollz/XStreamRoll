'use client';

import { useStreamSocket } from '../../hooks/useStreamSocket';
import { ConnectionStatus } from './ConnectionStatus';
import { StreamFeed } from './StreamFeed';


interface Props {
  socketUrl: string;
}

export const StreamViewer = ({
  socketUrl,
}: Props) => {
  const { status, events } =
    useStreamSocket(socketUrl);

  return (
    <section
      className="space-y-4 rounded-xl border p-5"
      aria-label="Live stream feed"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Live Stream Feed
        </h2>

        <ConnectionStatus status={status} />
      </div>

      <StreamFeed events={events} />
    </section>
  );
};