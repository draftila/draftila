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
  resolve: (color: string | undefined, colorVar: string | undefined) => string | undefined;
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
  }, [variables, ydoc]);

  return <VariablesContext.Provider value={value}>{children}</VariablesContext.Provider>;
}

export function useVariables(): VariablesContextValue {
  return useContext(VariablesContext);
}
