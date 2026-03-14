import type { z } from 'zod';
import type {
  loginSchema,
  userSchema,
  createUserSchema,
  projectSchema,
  createProjectSchema,
} from '../schemas';

export type Login = z.infer<typeof loginSchema>;
export type User = z.infer<typeof userSchema>;
export type CreateUser = z.infer<typeof createUserSchema>;
export type Project = z.infer<typeof projectSchema>;
export type CreateProject = z.infer<typeof createProjectSchema>;

// WebSocket event types
export type WSEventType = 'cursor:move' | 'element:update' | 'element:create' | 'element:delete';

export interface WSMessage<T = unknown> {
  type: WSEventType;
  payload: T;
  userId: string;
  timestamp: number;
}
