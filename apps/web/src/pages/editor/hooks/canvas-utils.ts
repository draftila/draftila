export function getCursorForTool(tool: string, isPanning: boolean): string {
  if (isPanning) return 'grabbing';
  switch (tool) {
    case 'move':
      return 'default';
    case 'hand':
      return 'grab';
    case 'comment':
    case 'rectangle':
    case 'ellipse':
    case 'frame':
    case 'pen':
    case 'pencil':
    case 'node':
    case 'line':
    case 'polygon':
    case 'star':
    case 'arrow':
      return 'crosshair';
    case 'text':
      return 'text';
    default:
      return 'default';
  }
}
