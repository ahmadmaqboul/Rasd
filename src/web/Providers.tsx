import {InternationalizationProvider} from '@astryxdesign/core/i18n';
import {LinkProvider} from '@astryxdesign/core/Link';
import arSA from '@astryxdesign/core/locales/ar-SA.generated.js';
import {Theme} from '@astryxdesign/core/theme';
import {createContext, useContext, useEffect, useMemo, useState, type ComponentProps, type ReactNode} from 'react';
import {useTranslation} from 'react-i18next';
import {Link as RouterLink} from 'react-router';
import {defaultThemeSlug, themes} from '../astryx-themes';
import {SUPPORTED_LANGUAGES, type Language} from './i18n';
import {DEFAULT_REGIONAL, formatLocale, textDirection} from './lib/locale';

export type ColorMode = 'system' | 'light' | 'dark';
const COLOR_MODE_KEY = 'rasd.colorMode';

const ColorModeContext = createContext<{mode: ColorMode; setMode: (mode: ColorMode) => void}>({
  mode: 'system',
  setMode: () => {},
});

export const useColorMode = () => useContext(ColorModeContext);

function readColorMode(): ColorMode {
  const saved = localStorage.getItem(COLOR_MODE_KEY);
  return saved === 'light' || saved === 'dark' ? saved : 'system';
}

/** روابط Astryx (SideNavItem, Button href, ClickableCard…) تمرّ عبر react-router بلا إعادة تحميل. */
function AppLink({href, to, ...rest}: Omit<ComponentProps<typeof RouterLink>, 'to'> & {href?: string; to?: string}) {
  return <RouterLink to={to ?? href ?? '#'} {...rest} />;
}

export function Providers({children}: {children: ReactNode}) {
  const {i18n} = useTranslation();
  const language: Language = (SUPPORTED_LANGUAGES as readonly string[]).includes(i18n.language)
    ? (i18n.language as Language)
    : 'ar';
  const dir = textDirection(language);
  const [mode, setModeState] = useState<ColorMode>(readColorMode);

  // Astryx لا يضبط dir على <html>؛ نضبطه نحن مع كل تغيير لغة (المتصفح يحتاجه لمحاذاة النص).
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = dir;
  }, [language, dir]);

  const colorMode = useMemo(
    () => ({
      mode,
      setMode: (next: ColorMode) => {
        localStorage.setItem(COLOR_MODE_KEY, next);
        setModeState(next);
      },
    }),
    [mode],
  );

  const theme = themes[defaultThemeSlug as keyof typeof themes];
  // أرقام غربية افتراضياً داخل مكوّنات Astryx أيضاً (تقويم، ترقيم صفحات…).
  const astryxLocale = formatLocale({...DEFAULT_REGIONAL, language});

  return (
    <ColorModeContext.Provider value={colorMode}>
      <Theme theme={theme} mode={mode}>
        <InternationalizationProvider locale={astryxLocale} dir={dir} messages={{ar: arSA}}>
          <LinkProvider component={AppLink}>{children}</LinkProvider>
        </InternationalizationProvider>
      </Theme>
    </ColorModeContext.Provider>
  );
}
