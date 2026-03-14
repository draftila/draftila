import { useEditorStore } from '../editor-store';

beforeEach(() => {
  useEditorStore.setState({
    zoom: 1,
    panX: 0,
    panY: 0,
    selectedElementIds: [],
  });
});

describe('useEditorStore', () => {
  describe('setZoom', () => {
    test('updates zoom level', () => {
      useEditorStore.getState().setZoom(2);
      expect(useEditorStore.getState().zoom).toBe(2);
    });

    test('allows fractional zoom', () => {
      useEditorStore.getState().setZoom(0.5);
      expect(useEditorStore.getState().zoom).toBe(0.5);
    });
  });

  describe('setPan', () => {
    test('updates pan position', () => {
      useEditorStore.getState().setPan(100, 200);
      expect(useEditorStore.getState().panX).toBe(100);
      expect(useEditorStore.getState().panY).toBe(200);
    });

    test('allows negative values', () => {
      useEditorStore.getState().setPan(-50, -100);
      expect(useEditorStore.getState().panX).toBe(-50);
      expect(useEditorStore.getState().panY).toBe(-100);
    });
  });

  describe('selectElements', () => {
    test('sets selected element IDs', () => {
      useEditorStore.getState().selectElements(['a', 'b']);
      expect(useEditorStore.getState().selectedElementIds).toEqual(['a', 'b']);
    });

    test('replaces previous selection', () => {
      useEditorStore.getState().selectElements(['a']);
      useEditorStore.getState().selectElements(['b', 'c']);
      expect(useEditorStore.getState().selectedElementIds).toEqual(['b', 'c']);
    });
  });

  describe('clearSelection', () => {
    test('empties selected element IDs', () => {
      useEditorStore.getState().selectElements(['a', 'b']);
      useEditorStore.getState().clearSelection();
      expect(useEditorStore.getState().selectedElementIds).toEqual([]);
    });
  });
});
