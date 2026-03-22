import { visit } from 'unist-util-visit';

const CALLOUT_TYPES = new Set(['info', 'tip', 'warning', 'danger']);

interface UnistNode {
  type: string;
  data?: Record<string, unknown>;
  children?: UnistNode[];
}

interface DirectiveNode extends UnistNode {
  type: 'containerDirective';
  name: string;
}

export function remarkCallout() {
  return (tree: UnistNode) => {
    visit(tree, 'containerDirective', (_node: UnistNode) => {
      const node = _node as DirectiveNode;
      if (!CALLOUT_TYPES.has(node.name)) return;

      const data = (node.data ||= {});
      data.hName = 'Callout';
      data.hProperties = { type: node.name };
    });
  };
}
