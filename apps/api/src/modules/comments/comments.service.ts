import type { CommentResponse, CreateComment, UpdateComment } from '@draftila/shared';
import { ForbiddenError, NotFoundError } from '../../common/errors';
import { nextTimestamp } from '../../common/lib/pagination';
import { nanoid } from '../../common/lib/utils';
import { db } from '../../db';
import * as draftsService from '../drafts/drafts.service';
import { userAccessFilter } from '../projects/projects.service';

type CommentWithMeta = {
  id: string;
  draftId: string;
  pageId: string;
  userId: string;
  content: string;
  parentId: string | null;
  resolved: boolean;
  createdAt: Date;
  updatedAt: Date;
  user: { id: string; name: string; email: string; image: string | null };
  reads: Array<{ id: string }>;
};

const commentSelect = {
  id: true,
  draftId: true,
  pageId: true,
  userId: true,
  content: true,
  parentId: true,
  resolved: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
    },
  },
} as const;

async function ensureDraftAccess(draftId: string, userId: string) {
  const draft = await draftsService.getByIdForUser(draftId, userId);
  if (!draft) {
    throw new NotFoundError('Draft');
  }
}

function mapComment(comment: CommentWithMeta, currentUserId: string): CommentResponse {
  return {
    id: comment.id,
    draftId: comment.draftId,
    pageId: comment.pageId,
    userId: comment.userId,
    content: comment.content,
    parentId: comment.parentId,
    resolved: comment.resolved,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    author: {
      id: comment.user.id,
      name: comment.user.name,
      email: comment.user.email,
      image: comment.user.image,
    },
    unread: comment.userId !== currentUserId && comment.reads.length === 0,
    replies: [],
  };
}

function buildThread(comments: CommentWithMeta[], currentUserId: string): CommentResponse[] {
  const nodes = new Map<string, CommentResponse>();
  const roots: CommentResponse[] = [];

  for (const comment of comments) {
    nodes.set(comment.id, mapComment(comment, currentUserId));
  }

  for (const comment of comments) {
    const node = nodes.get(comment.id);
    if (!node) continue;
    if (!comment.parentId) {
      roots.push(node);
      continue;
    }
    const parent = nodes.get(comment.parentId);
    if (parent) {
      parent.replies.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

async function getCommentForUser(
  commentId: string,
  userId: string,
): Promise<CommentWithMeta | null> {
  const comment = await db.comment.findFirst({
    where: {
      id: commentId,
      draft: {
        project: userAccessFilter(userId),
      },
    },
    select: {
      ...commentSelect,
      reads: {
        where: { userId },
        select: { id: true },
      },
    },
  });

  return comment;
}

export async function listByDraft(draftId: string, pageId: string, userId: string) {
  await ensureDraftAccess(draftId, userId);

  const comments = await db.comment.findMany({
    where: {
      draftId,
      pageId,
    },
    orderBy: {
      createdAt: 'asc',
    },
    select: {
      ...commentSelect,
      reads: {
        where: { userId },
        select: { id: true },
      },
    },
  });

  return buildThread(comments, userId);
}

export async function create(draftId: string, userId: string, payload: CreateComment) {
  await ensureDraftAccess(draftId, userId);

  if (payload.parentId) {
    const parent = await db.comment.findUnique({
      where: { id: payload.parentId },
      select: { id: true, draftId: true, pageId: true },
    });
    if (!parent || parent.draftId !== draftId || parent.pageId !== payload.pageId) {
      throw new NotFoundError('Comment');
    }
  }

  const timestamp = nextTimestamp();
  const created = await db.comment.create({
    data: {
      id: nanoid(),
      draftId,
      pageId: payload.pageId,
      userId,
      content: payload.content,
      parentId: payload.parentId ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    select: {
      ...commentSelect,
      reads: {
        where: { userId },
        select: { id: true },
      },
    },
  });

  return mapComment(created, userId);
}

export async function update(commentId: string, userId: string, payload: UpdateComment) {
  const existing = await getCommentForUser(commentId, userId);
  if (!existing) {
    throw new NotFoundError('Comment');
  }
  if (existing.userId !== userId) {
    throw new ForbiddenError();
  }

  const updated = await db.comment.update({
    where: { id: commentId },
    data: {
      content: payload.content,
      updatedAt: nextTimestamp(),
    },
    select: {
      ...commentSelect,
      reads: {
        where: { userId },
        select: { id: true },
      },
    },
  });

  return mapComment(updated, userId);
}

export async function remove(commentId: string, userId: string) {
  const existing = await getCommentForUser(commentId, userId);
  if (!existing) {
    throw new NotFoundError('Comment');
  }
  if (existing.userId !== userId) {
    throw new ForbiddenError();
  }

  await db.comment.delete({ where: { id: commentId } });
  return { ok: true };
}

export async function toggleResolved(commentId: string, userId: string) {
  const existing = await getCommentForUser(commentId, userId);
  if (!existing) {
    throw new NotFoundError('Comment');
  }

  const updated = await db.comment.update({
    where: { id: commentId },
    data: {
      resolved: !existing.resolved,
      updatedAt: nextTimestamp(),
    },
    select: {
      ...commentSelect,
      reads: {
        where: { userId },
        select: { id: true },
      },
    },
  });

  return mapComment(updated, userId);
}

function collectThreadIds(
  allComments: Array<{ id: string; parentId: string | null }>,
  rootId: string,
): string[] {
  const childrenByParent = new Map<string, string[]>();
  for (const item of allComments) {
    if (!item.parentId) continue;
    const children = childrenByParent.get(item.parentId);
    if (children) {
      children.push(item.id);
    } else {
      childrenByParent.set(item.parentId, [item.id]);
    }
  }

  const ids: string[] = [];
  const stack = [rootId];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    ids.push(current);
    const children = childrenByParent.get(current) ?? [];
    for (let i = children.length - 1; i >= 0; i -= 1) {
      const childId = children[i];
      if (childId) {
        stack.push(childId);
      }
    }
  }

  return ids;
}

async function resolveRootCommentId(commentId: string): Promise<string> {
  let currentId = commentId;
  while (true) {
    const node = await db.comment.findUnique({
      where: { id: currentId },
      select: { parentId: true },
    });
    if (!node || !node.parentId) {
      return currentId;
    }
    currentId = node.parentId;
  }
}

export async function markThreadRead(commentId: string, userId: string) {
  const existing = await getCommentForUser(commentId, userId);
  if (!existing) {
    throw new NotFoundError('Comment');
  }

  const rootId = await resolveRootCommentId(commentId);
  const allComments = await db.comment.findMany({
    where: {
      draftId: existing.draftId,
      pageId: existing.pageId,
    },
    select: {
      id: true,
      parentId: true,
      userId: true,
    },
  });

  const threadIds = collectThreadIds(allComments, rootId);
  const readableIds = threadIds.filter((id) => {
    const comment = allComments.find((item) => item.id === id);
    return comment ? comment.userId !== userId : false;
  });

  if (readableIds.length === 0) {
    return { ok: true };
  }

  for (const id of readableIds) {
    await db.commentRead.upsert({
      where: {
        commentId_userId: {
          commentId: id,
          userId,
        },
      },
      update: {
        readAt: nextTimestamp(),
      },
      create: {
        id: nanoid(),
        commentId: id,
        userId,
        readAt: nextTimestamp(),
      },
    });
  }

  return { ok: true };
}

export async function markAllRead(draftId: string, pageId: string, userId: string) {
  await ensureDraftAccess(draftId, userId);

  const unreadComments = await db.comment.findMany({
    where: {
      draftId,
      pageId,
      NOT: {
        userId,
      },
    },
    select: {
      id: true,
    },
  });

  if (unreadComments.length === 0) {
    return { ok: true };
  }

  for (const comment of unreadComments) {
    await db.commentRead.upsert({
      where: {
        commentId_userId: {
          commentId: comment.id,
          userId,
        },
      },
      update: {
        readAt: nextTimestamp(),
      },
      create: {
        id: nanoid(),
        commentId: comment.id,
        userId,
        readAt: nextTimestamp(),
      },
    });
  }

  return { ok: true };
}
