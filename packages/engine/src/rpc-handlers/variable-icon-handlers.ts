import type { Shape } from '@draftila/shared';
import { getVariables, getVariable, setVariable } from '../variables';
import { deleteVariable, countVariableUsage } from '../variable-scan';
import { getIconNames, searchIcons, getIconSvg } from '../icons';
import { opCreateShape } from '../operations';
import type { RpcHandler } from './types';
import { toAbsoluteProps } from './utils';

export function variableIconHandlers(): Record<string, RpcHandler> {
  return {
    list_variables(ydoc) {
      return {
        variables: getVariables(ydoc).map((variable) => ({
          ...variable,
          usageCount: countVariableUsage(ydoc, variable.id),
        })),
      };
    },

    set_variable(ydoc, args) {
      const id = args['id'] as string;
      const name = args['name'] as string;
      const value = args['value'] as string;
      const previous = getVariable(ydoc, id);
      const usageCount = previous ? countVariableUsage(ydoc, id) : 0;
      const variable = setVariable(ydoc, id, name, value);
      return previous
        ? { variable, overwrote: true, usageCount, previousValue: previous.value }
        : { variable, overwrote: false, usageCount: 0 };
    },

    delete_variable(ydoc, args) {
      return { ok: deleteVariable(ydoc, args['id'] as string) };
    },

    list_icons(_ydoc, args) {
      const query = args['query'] as string | undefined;
      return { icons: query ? searchIcons(query) : getIconNames() };
    },

    insert_icon(ydoc, args) {
      const name = args['name'] as string;
      const size = (args['size'] as number) ?? 24;
      const strokeWidth = (args['strokeWidth'] as number) ?? 2;
      const color = (args['color'] as string) ?? '#000000';
      const svg = getIconSvg(name, size, strokeWidth, color);
      if (!svg) return { error: `Icon "${name}" not found` };
      const parentId = (args['parentId'] as string | undefined) ?? undefined;
      const childIndex = args['childIndex'] as number | undefined;
      let rawProps: Record<string, unknown> = {
        x: (args['x'] as number) ?? 0,
        y: (args['y'] as number) ?? 0,
        width: size,
        height: size,
        svgContent: svg,
        name: `icon-${name}`,
      };
      if (parentId) rawProps['parentId'] = parentId;
      rawProps = toAbsoluteProps(ydoc, rawProps);
      const id = opCreateShape(ydoc, 'svg', rawProps as Partial<Shape>, childIndex);
      return { shapeId: id };
    },
  };
}
