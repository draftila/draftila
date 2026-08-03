import { Outlet } from 'react-router-dom';
import { CustomFontsLoader } from '@/api/fonts';

export function EditorLayout() {
  return (
    <>
      <CustomFontsLoader />
      <Outlet />
    </>
  );
}
