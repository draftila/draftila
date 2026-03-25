import type { StackMoveDirection, LayerDropPlacement } from '../scene-graph/types';
import type { BooleanOperation } from '../boolean-ops';
import { applyAutoLayout } from '../scene-graph/layout-ops';
import {
  opNudgeShapes,
  opFlipShapes,
  opGroupShapes,
  opUngroupShapes,
  opFrameSelection,
  opMoveInStack,
  opMoveByDrop,
  opAlignShapes,
  opDistributeShapes,
  opBooleanOperation,
} from '../operations';
import type { RpcHandler } from './types';

export function layoutHandlers(): Record<string, RpcHandler> {
  return {
    group_shapes(ydoc, args) {
      return { groupId: opGroupShapes(ydoc, args['shapeIds'] as string[]) };
    },

    ungroup_shapes(ydoc, args) {
      return { childIds: opUngroupShapes(ydoc, args['shapeIds'] as string[]) };
    },

    frame_selection(ydoc, args) {
      return { frameId: opFrameSelection(ydoc, args['shapeIds'] as string[]) };
    },

    align_shapes(ydoc, args) {
      type Alignment = 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom';
      opAlignShapes(ydoc, args['shapeIds'] as string[], args['alignment'] as Alignment);
      return { ok: true };
    },

    distribute_shapes(ydoc, args) {
      type Direction = 'horizontal' | 'vertical';
      opDistributeShapes(ydoc, args['shapeIds'] as string[], args['direction'] as Direction);
      return { ok: true };
    },

    apply_auto_layout(ydoc, args) {
      applyAutoLayout(ydoc, args['frameId'] as string);
      return { ok: true };
    },

    nudge_shapes(ydoc, args) {
      opNudgeShapes(ydoc, args['shapeIds'] as string[], args['dx'] as number, args['dy'] as number);
      return { ok: true };
    },

    flip_shapes(ydoc, args) {
      opFlipShapes(ydoc, args['shapeIds'] as string[], args['axis'] as 'horizontal' | 'vertical');
      return { ok: true };
    },

    move_in_stack(ydoc, args) {
      const movedIds = opMoveInStack(
        ydoc,
        args['shapeIds'] as string[],
        args['direction'] as StackMoveDirection,
      );
      return { movedIds };
    },

    move_by_drop(ydoc, args) {
      const rawPlacement = args['placement'] as LayerDropPlacement;
      const enginePlacement: LayerDropPlacement =
        rawPlacement === 'before' ? 'after' : rawPlacement === 'after' ? 'before' : rawPlacement;
      const movedIds = opMoveByDrop(
        ydoc,
        args['shapeIds'] as string[],
        args['targetId'] as string,
        enginePlacement,
      );
      return { movedIds };
    },

    boolean_operation(ydoc, args) {
      return {
        resultId: opBooleanOperation(
          ydoc,
          args['shapeIds'] as string[],
          args['operation'] as BooleanOperation,
        ),
      };
    },
  };
}
