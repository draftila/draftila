export type { RpcArgs, RpcHandler } from './types';
export {
  sortByDepth,
  collectShapesWithDescendants,
  toAbsoluteProps,
  applyTextDefaults,
  toRelativeShape,
} from './utils';

import type { RpcHandler } from './types';
import { shapeHandlers } from './shape-handlers';
import { layoutHandlers } from './layout-handlers';
import { pageHandlers } from './page-handlers';
import { componentHandlers } from './component-handlers';
import { guideHandlers } from './guide-handlers';
import { interchangeHandlers } from './interchange-handlers';
import { variableIconHandlers } from './variable-icon-handlers';

export function createRpcHandlers(
  overrides?: Partial<Record<string, RpcHandler>>,
): Record<string, RpcHandler> {
  const handlers: Record<string, RpcHandler> = {
    ...shapeHandlers(),
    ...layoutHandlers(),
    ...pageHandlers(),
    ...componentHandlers(),
    ...guideHandlers(),
    ...interchangeHandlers(),
    ...variableIconHandlers(),
  };

  if (overrides) {
    for (const [key, handler] of Object.entries(overrides)) {
      if (handler) handlers[key] = handler;
    }
  }

  return handlers;
}
