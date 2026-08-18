import { describe, test, expect } from 'bun:test';
import { parseTailwindClasses } from '../../../src/interchange/html/tailwind-class-parser';

describe('parseTailwindClasses', () => {
  test('parses layout classes', () => {
    const { style } = parseTailwindClasses(
      'flex flex-col gap-3 p-6 items-center justify-between flex-wrap',
    );
    expect(style.display).toBe('flex');
    expect(style.flexDirection).toBe('col');
    expect(style.gap).toBe(12);
    expect(style.paddingTop).toBe(24);
    expect(style.paddingRight).toBe(24);
    expect(style.paddingBottom).toBe(24);
    expect(style.paddingLeft).toBe(24);
    expect(style.alignItems).toBe('center');
    expect(style.justifyContent).toBe('space_between');
    expect(style.flexWrap).toBe(true);
  });

  test('parses the spacing scale including specials and arbitrary values', () => {
    expect(parseTailwindClasses('p-4').style.paddingTop).toBe(16);
    expect(parseTailwindClasses('p-px').style.paddingTop).toBe(1);
    expect(parseTailwindClasses('p-0.5').style.paddingTop).toBe(2);
    expect(parseTailwindClasses('p-1.5').style.paddingTop).toBe(6);
    expect(parseTailwindClasses('p-[13px]').style.paddingTop).toBe(13);
    expect(parseTailwindClasses('px-8').style.paddingLeft).toBe(32);
    expect(parseTailwindClasses('py-2').style.paddingTop).toBe(8);
    expect(parseTailwindClasses('gap-x-2 gap-y-4').style.gapX).toBe(8);
    expect(parseTailwindClasses('gap-x-2 gap-y-4').style.gapY).toBe(16);
  });

  test('parses sizing classes', () => {
    const { style } = parseTailwindClasses('w-64 h-[313px] min-w-10 max-w-sm');
    expect(style.width).toBe(256);
    expect(style.height).toBe(313);
    expect(style.minWidth).toBe(40);
    expect(style.maxWidth).toBe(384);

    expect(parseTailwindClasses('w-full').style.widthFull).toBe(true);
    expect(parseTailwindClasses('flex-1').style.flexGrow).toBe(true);
    expect(parseTailwindClasses('size-6').style.width).toBe(24);
    expect(parseTailwindClasses('size-6').style.height).toBe(24);
  });

  test('resolves palette and arbitrary colors with opacity suffixes', () => {
    expect(parseTailwindClasses('bg-blue-600').style.backgroundColor).toBe('#2563eb');
    expect(parseTailwindClasses('bg-white').style.backgroundColor).toBe('#ffffff');
    expect(parseTailwindClasses('bg-[#ff2]').style.backgroundColor).toBe('#ffff22');
    expect(parseTailwindClasses('bg-black/50').style.backgroundOpacity).toBe(0.5);
    expect(parseTailwindClasses('text-slate-500').style.textColor).toBe('#64748b');
    expect(parseTailwindClasses('text-[#123456]').style.textColor).toBe('#123456');
    expect(parseTailwindClasses('border-red-500').style.borderColor).toBe('#ef4444');
  });

  test('parses text classes', () => {
    const { style } = parseTailwindClasses(
      "text-2xl font-bold italic leading-tight tracking-[0.5px] text-center uppercase truncate font-['Playfair_Display']",
    );
    expect(style.fontSize).toBe(24);
    expect(style.fontWeight).toBe(700);
    expect(style.fontItalic).toBe(true);
    expect(style.lineHeight).toBe(1.25);
    expect(style.letterSpacing).toBe(0.5);
    expect(style.textAlign).toBe('center');
    expect(style.textTransform).toBe('uppercase');
    expect(style.truncate).toBe(true);
    expect(style.fontFamily).toBe('Playfair Display');
    expect(parseTailwindClasses('text-[15px]').style.fontSize).toBe(15);
  });

  test('parses borders, radius, shadows, and effects', () => {
    const { style } = parseTailwindClasses('border-2 border-gray-200 rounded-xl shadow-md');
    expect(style.borderWidth).toBe(2);
    expect(style.borderColor).toBe('#e5e7eb');
    expect(style.cornerRadius).toBe(12);
    expect(style.shadows).toHaveLength(2);
    expect(style.shadows![0]!.y).toBe(4);

    expect(parseTailwindClasses('rounded-full').style.roundedFull).toBe(true);
    expect(parseTailwindClasses('rounded-t-lg').style.cornerRadiusTL).toBe(8);
    expect(parseTailwindClasses('rounded-t-lg').style.cornerRadiusTR).toBe(8);
    expect(parseTailwindClasses('opacity-50').style.opacity).toBe(0.5);
    expect(parseTailwindClasses('blur-md').style.blurRadius).toBe(12);
    expect(parseTailwindClasses('backdrop-blur-sm').style.backdropBlurRadius).toBe(8);
    expect(parseTailwindClasses('shadow-[0_4px_16px_0_#00000015]').style.shadows![0]!.blur).toBe(
      16,
    );
  });

  test('parses gradients', () => {
    const { style } = parseTailwindClasses('bg-linear-to-r from-blue-500 to-purple-500');
    expect(style.gradient?.angle).toBe(0);
    expect(style.gradient?.from).toBe('#3b82f6');
    expect(style.gradient?.to).toBe('#a855f7');

    const v3 = parseTailwindClasses('bg-gradient-to-b from-white via-gray-100 to-gray-200');
    expect(v3.style.gradient?.angle).toBe(90);
    expect(v3.style.gradient?.via).toBe('#f3f4f6');
  });

  test('drops variant prefixes with warnings and reports unknown classes', () => {
    const responsive = parseTailwindClasses('md:flex-row hover:bg-blue-700 flex');
    expect(responsive.style.display).toBe('flex');
    expect(responsive.style.flexDirection).toBeUndefined();
    expect(responsive.warnings.some((w) => w.includes('responsive'))).toBe(true);
    expect(responsive.warnings.some((w) => w.includes('state'))).toBe(true);

    const unknown = parseTailwindClasses('bg-blue-600 not-a-real-class');
    expect(unknown.unknown).toEqual(['not-a-real-class']);
  });

  test('warns on unsupported utilities with fallbacks', () => {
    const grid = parseTailwindClasses('grid grid-cols-3');
    expect(grid.style.display).toBe('flex');
    expect(grid.style.flexDirection).toBe('col');
    expect(grid.warnings.some((w) => w.includes('grid'))).toBe(true);

    const margins = parseTailwindClasses('mt-4 mx-auto');
    expect(margins.warnings.some((w) => w.includes('margins are not supported'))).toBe(true);
    expect(margins.warnings.some((w) => w.includes('mx-auto'))).toBe(true);
  });

  test('silently ignores presentation-neutral utilities', () => {
    const { unknown, warnings } = parseTailwindClasses(
      'z-10 transition duration-300 animate-pulse cursor-pointer select-none antialiased',
    );
    expect(unknown).toEqual([]);
    expect(warnings).toEqual([]);
  });
});
