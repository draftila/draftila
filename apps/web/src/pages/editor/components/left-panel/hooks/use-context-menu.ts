import { useCallback, useEffect, useRef, useState } from 'react';
import type { ContextMenuState } from '../types';

export function useContextMenu(selectedIds: string[], setSelectedIds: (ids: string[]) => void) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!contextMenu) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && contextMenuRef.current?.contains(target)) return;
      setContextMenu(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContextMenu(null);
    };

    const handleWindowContextMenu = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && contextMenuRef.current?.contains(target)) return;
      setContextMenu(null);
    };

    const handleScroll = () => {
      setContextMenu(null);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('contextmenu', handleWindowContextMenu);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('contextmenu', handleWindowContextMenu);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [contextMenu]);

  const openContextMenu = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!selectedIds.includes(id)) {
        setSelectedIds([id]);
      }
      setContextMenu({ x: e.clientX, y: e.clientY, targetId: id });
    },
    [selectedIds, setSelectedIds],
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  return { contextMenu, contextMenuRef, openContextMenu, closeContextMenu };
}
