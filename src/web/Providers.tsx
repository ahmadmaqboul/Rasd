import {InternationalizationProvider} from '@astryxdesign/core/i18n';
import {LinkProvider} from '@astryxdesign/core/Link';
import arSA from '@astryxdesign/core/locales/ar-SA.generated.js';
import {Theme} from '@astryxdesign/core/theme';
import {createContext, useContext, useEffect, useMemo, useState, type ComponentProps, type ReactNode} from 'react';
import {useTranslation} from 'react-i18next';
import {Link as RouterLink} from 'react-router';
import {defaultThemeSlug, themes} from '../astryx-themes';
import {SUPPORTED_LANGUAGES, type Language} from './i18n';
import {fetchJson, useEventStream, type Settings} from './lib/api';
import {DEFAULT_REGIONAL, formatLocale, setRegional, textDirection, type RegionalSettings} from './lib/locale';

export type ColorMode = 'system' | 'light' | 'dark';
const COLOR_MODE_KEY = 'rasd.colorMode';

const ColorModeContext = createContext<{mode: ColorMode; setMode: (mode: ColorMode) => void}>({
  mode: 'system',
  setMode: () => {},
});

export const useColorMode = () => useContext(ColorModeContext);

function readColorMode(): ColorMode {
  try {
    const saved = localStorage.getItem(COLOR_MODE_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system'; // storage can be unavailable (private windows, sandboxed frames)
  }
}

/** Digits and currency from Settings; every formatter in lib/locale follows them. */
function useRegionalSettings(language: Language): RegionalSettings {
  const [locale, setLocale] = useState<Settings['locale'] | undefined>();
  const load = useMemo(
    () => () => {
      fetchJson<Settings>('/api/settings')
        .then(settings => setLocale(settings.locale))
        .catch(() => undefined); // the server is not up yet: keep the defaults
    },
    [],
  );
  useEffect(load, [load]);
  useEventStream(event => {
    if (event.type === 'settings.updated') load();
  });
  const regional = useMemo<RegionalSettings>(
    () => ({...DEFAULT_REGIONAL, language, ...(locale ? {digits: locale.digits, currency: locale.currency} : {})}),
    [language, locale],
  );
  setRegional(regional);
  return regional;
}

/** Astryx links (SideNavItem, Button href, ClickableCard…) go through react-router with no page reload. */
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

  // Astryx does not set dir on <html>; we set it ourselves on every language change (the browser needs it to align text).
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = dir;
  }, [language, dir]);

  const colorMode = useMemo(
    () => ({
      mode,
      setMode: (next: ColorMode) => {
        try {
          localStorage.setItem(COLOR_MODE_KEY, next);
        } catch {
          // not saved, but still applied for this visit
        }
        setModeState(next);
      },
    }),
    [mode],
  );

  const regional = useRegionalSettings(language);
  const theme = themes[defaultThemeSlug as keyof typeof themes];
  // The chosen digits inside Astryx components too (calendar, pagination…).
  const astryxLocale = formatLocale(regional);

  return (
    <ColorModeContext.Provider value={colorMode}>
      <Theme theme={theme} mode={mode}>
        <InternationalizationProvider locale={astryxLocale} dir={dir} messages={{ar: arSA}}>
          {/* Remounting on a digits or currency change re-formats every number on screen at once. */}
          <LinkProvider key={`${regional.digits}-${regional.currency}`} component={AppLink}>
            {children}
          </LinkProvider>
        </InternationalizationProvider>
      </Theme>
    </ColorModeContext.Provider>
  );
}
