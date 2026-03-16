import type { Camera } from '@draftila/shared';
import { canvasToScreen } from '@draftila/engine/camera';
import type { RemoteUser } from '../hooks/use-awareness';

interface CursorOverlayProps {
  remoteUsers: RemoteUser[];
  camera: Camera;
}

export function CursorOverlay({ remoteUsers, camera }: CursorOverlayProps) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {remoteUsers.map((user) => {
        if (!user.cursor) return null;
        const screen = canvasToScreen(user.cursor.x, user.cursor.y, camera);
        return (
          <div
            key={user.clientId}
            className="absolute transition-transform duration-75"
            style={{
              transform: `translate(${screen.x}px, ${screen.y}px)`,
            }}
          >
            <svg
              width="16"
              height="20"
              viewBox="0 0 16 20"
              fill="none"
              className="-translate-x-0.5 -translate-y-0.5"
            >
              <path
                d="M0.928 0.640L14.248 10.680C14.808 11.080 14.528 11.960 13.848 11.960H7.688L4.168 19.040C3.928 19.520 3.288 19.520 3.048 19.040L0.168 1.360C0.048 0.840 0.488 0.320 0.928 0.640Z"
                fill={user.user.color}
                stroke="white"
                strokeWidth="1.2"
              />
            </svg>
            <div
              className="ml-3 mt-0.5 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium text-white shadow-sm"
              style={{ backgroundColor: user.user.color }}
            >
              {user.user.name}
            </div>
          </div>
        );
      })}
    </div>
  );
}
