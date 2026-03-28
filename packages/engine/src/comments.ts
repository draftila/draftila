import * as Y from 'yjs';
import { getShape } from './scene-graph';

export interface CommentPin {
  commentId: string;
  pageId: string;
  x: number;
  y: number;
  parentShapeId: string | null;
  userId: string;
  userName: string;
}

function getCommentPinsMap(ydoc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return ydoc.getMap('commentPins') as Y.Map<Y.Map<unknown>>;
}

function mapToCommentPin(commentId: string, value: Y.Map<unknown>): CommentPin {
  return {
    commentId,
    pageId: (value.get('pageId') as string | undefined) ?? '',
    x: (value.get('x') as number | undefined) ?? 0,
    y: (value.get('y') as number | undefined) ?? 0,
    parentShapeId: (value.get('parentShapeId') as string | null | undefined) ?? null,
    userId: (value.get('userId') as string | undefined) ?? '',
    userName: (value.get('userName') as string | undefined) ?? '',
  };
}

export function getCommentPins(ydoc: Y.Doc, pageId?: string): CommentPin[] {
  const pins = getCommentPinsMap(ydoc);
  const result: CommentPin[] = [];
  pins.forEach((pinMap, commentId) => {
    const pin = mapToCommentPin(commentId, pinMap);
    if (pageId && pin.pageId !== pageId) {
      return;
    }
    result.push(pin);
  });
  return result;
}

export function getCommentPin(ydoc: Y.Doc, commentId: string): CommentPin | null {
  const pinMap = getCommentPinsMap(ydoc).get(commentId);
  if (!pinMap) {
    return null;
  }
  return mapToCommentPin(commentId, pinMap);
}

export function addCommentPin(ydoc: Y.Doc, pin: CommentPin): string {
  const pins = getCommentPinsMap(ydoc);
  const pinMap = new Y.Map<unknown>();
  pinMap.set('commentId', pin.commentId);
  pinMap.set('pageId', pin.pageId);
  pinMap.set('x', pin.x);
  pinMap.set('y', pin.y);
  pinMap.set('parentShapeId', pin.parentShapeId);
  pinMap.set('userId', pin.userId);
  pinMap.set('userName', pin.userName);

  ydoc.transact(() => {
    pins.set(pin.commentId, pinMap);
  });

  return pin.commentId;
}

export function updateCommentPin(
  ydoc: Y.Doc,
  commentId: string,
  updates: Partial<Omit<CommentPin, 'commentId'>>,
) {
  const pinMap = getCommentPinsMap(ydoc).get(commentId);
  if (!pinMap) {
    return;
  }

  ydoc.transact(() => {
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        pinMap.set(key, value);
      }
    }
  });
}

export function deleteCommentPin(ydoc: Y.Doc, commentId: string) {
  const pins = getCommentPinsMap(ydoc);
  ydoc.transact(() => {
    pins.delete(commentId);
  });
}

export function observeCommentPins(
  ydoc: Y.Doc,
  callback: (pins: CommentPin[]) => void,
  pageId?: string,
): () => void {
  const pins = getCommentPinsMap(ydoc);

  const emit = () => {
    callback(getCommentPins(ydoc, pageId));
  };

  pins.observeDeep(emit);
  emit();

  return () => {
    pins.unobserveDeep(emit);
  };
}

export function getCommentPinCanvasPosition(
  ydoc: Y.Doc,
  pin: CommentPin,
): { x: number; y: number } {
  if (!pin.parentShapeId) {
    return { x: pin.x, y: pin.y };
  }

  const parent = getShape(ydoc, pin.parentShapeId);
  if (!parent) {
    return { x: pin.x, y: pin.y };
  }

  return { x: parent.x + pin.x, y: parent.y + pin.y };
}

export function setCommentPinParent(
  ydoc: Y.Doc,
  commentId: string,
  parentShapeId: string | null,
  canvasX: number,
  canvasY: number,
) {
  if (!parentShapeId) {
    updateCommentPin(ydoc, commentId, { x: canvasX, y: canvasY, parentShapeId: null });
    return;
  }

  const parent = getShape(ydoc, parentShapeId);
  if (!parent) {
    updateCommentPin(ydoc, commentId, { x: canvasX, y: canvasY, parentShapeId: null });
    return;
  }

  updateCommentPin(ydoc, commentId, {
    parentShapeId,
    x: canvasX - parent.x,
    y: canvasY - parent.y,
  });
}
