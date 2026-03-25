import type { Shape } from '@draftila/shared';
import { getVariables, setVariable, deleteVariable } from '../variables';
import { getIconNames, searchIcons, getIconSvg } from '../icons';
import { opCreateShape } from '../operations';
import type { RpcHandler } from './types';
import { toAbsoluteProps } from './utils';

export function variableIconHandlers(): Record<string, RpcHandler> {
  return {
    list_variables(ydoc) {
      return { variables: getVariables(ydoc) };
    },

    set_variable(ydoc, args) {
      const id = args['id'] as string;
      const name = args['name'] as string;
      const value = args['value'] as string;
      return { variable: setVariable(ydoc, id, name, value) };
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
      const id = opCreateShape(ydoc, 'svg', rawProps as Partial<Shape>);
      return { shapeId: id };
    },
  };
}
