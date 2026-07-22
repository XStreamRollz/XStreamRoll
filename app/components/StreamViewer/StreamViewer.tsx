'use client';

import { useMemo } from 'react';
import { useStreamSocket } from '../../hooks/useStreamSocket';
import { ConnectionStatus } from './ConnectionStatus';
import { StreamFeed } from './StreamFeed';


interface Props {
  socketUrl: string;
}

export const StreamViewer = ({
  socketUrl,
}: Props) => {
  // Memoize the URL so parent re-renders that don't actually change the
  // socket URL don't cause `useStreamSocket` to re-evaluate its effect.
  // See issue #350.
  const memoizedSocketUrl = useMemo(() => socketUrl, [socketUrl]);

  const { status, events } =
    useStreamSocket(memoizedSocketUrl);

  return (
    <div className="space-y-4 rounded-xl border p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Live Stream Feed
        </h2>

        <ConnectionStatus status={status} />
      </div>

      <StreamFeed events={events} />
    </div>
  );
};
