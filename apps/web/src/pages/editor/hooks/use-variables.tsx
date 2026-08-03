import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type * as Y from 'yjs';
import type { Variable } from '@draftila/shared';
import {
  buildVariableTable,
  getVariables,
  observeVariables,
  resolveColorRef,
  type VariableTable,
} from '@draftila/engine';

interface VariablesContextValue {
  variables: Variable[];
  byId: Map<string, Variable>;
  table: VariableTable;
  /** Resolve a colour for display. Mirrors the engine's render-time resolution. */
  resolve: (color: string | undefined, colorVar: string | undefined) => string | undefined;
  /** A binding whose variable no longer exists. Renders its literal; shown as "Missing". */
  isDangling: (colorVar: string | undefined) => boolean;
}

const EMPTY: VariablesContextValue = {
  variables: [],
  byId: new Map(),
  table: new Map(),
  resolve: (color) => color,
  isDangling: () => false,
};

const VariablesContext = createContext<VariablesContextValue>(EMPTY);

/**
 * Mount on the active document (which may be a version-preview doc, not the
 * live one). Context crosses React portals, so pickers rendered inside Radix
 * popovers — including the nested one in the gradient editor — still see it.
 */
export function VariablesProvider({ ydoc, children }: { ydoc: Y.Doc; children: React.ReactNode }) {
  const [variables, setVariables] = useState<Variable[]>(() => getVariables(ydoc));

  useEffect(() => {
    setVariables(getVariables(ydoc));
    return observeVariables(ydoc, setVariables);
  }, [ydoc]);

  const value = useMemo<VariablesContextValue>(() => {
    const byId = new Map(variables.map((variable) => [variable.id, variable]));
    const table = buildVariableTable(ydoc);
    return {
      variables,
      byId,
      table,
      resolve: (color, colorVar) => resolveColorRef(color, colorVar, table),
      isDangling: (colorVar) => colorVar !== undefined && !byId.has(colorVar),
    };
    // `variables` is the change signal; the table is derived from the same data.
  }, [variables, ydoc]);

  return <VariablesContext.Provider value={value}>{children}</VariablesContext.Provider>;
}

export function useVariables(): VariablesContextValue {
  return useContext(VariablesContext);
}
