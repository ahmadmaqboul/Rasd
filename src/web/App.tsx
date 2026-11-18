import {AppShell} from '@astryxdesign/core/AppShell';
import {Icon} from '@astryxdesign/core/Icon';
import type {IconType} from '@astryxdesign/core/Icon';
import {NavIcon} from '@astryxdesign/core/NavIcon';
import {SideNav, SideNavHeading, SideNavItem, SideNavSection} from '@astryxdesign/core/SideNav';
import {
  BellAlertIcon,
  BookmarkSquareIcon,
  BuildingStorefrontIcon,
  Cog6ToothIcon,
  DocumentChartBarIcon,
  HomeIcon,
  LanguageIcon,
  ViewfinderCircleIcon,
} from '@heroicons/react/24/outline';
import {
  BellAlertIcon as BellAlertSolid,
  BookmarkSquareIcon as BookmarkSquareSolid,
  BuildingStorefrontIcon as BuildingStorefrontSolid,
  Cog6ToothIcon as Cog6ToothSolid,
  DocumentChartBarIcon as DocumentChartBarSolid,
  HomeIcon as HomeSolid,
  LanguageIcon as LanguageSolid,
} from '@heroicons/react/24/solid';
import {useTranslation} from 'react-i18next';
import {Route, Routes, useLocation} from 'react-router';
import {BusinessFormPage} from './pages/BusinessFormPage';
import {BusinessListPage} from './pages/BusinessListPage';
import {HomePage} from './pages/HomePage';
import {LibraryPage} from './pages/LibraryPage';
import {NotFoundPage} from './pages/NotFoundPage';
import {PlaceholderPage} from './pages/PlaceholderPage';
import {RtlCheckPage} from './pages/RtlCheckPage';
import {SettingsPage} from './pages/SettingsPage';
import {StudySetupPage} from './pages/StudySetupPage';
import {StudyViewPage} from './pages/StudyViewPage';

type NavKey = 'home' | 'library' | 'monitors' | 'templates' | 'business' | 'settings';

interface NavEntry {
  key: NavKey;
  href: string;
  icon: IconType;
  selectedIcon: IconType;
  /** The paths that count as part of this section (for highlighting). */
  match: (pathname: string) => boolean;
}

// Navigation: only 6 items (§4). Settings sits at the bottom of the menu, as is customary.
const MAIN_NAV: NavEntry[] = [
  {key: 'home', href: '/', icon: HomeIcon, selectedIcon: HomeSolid, match: p => p === '/' || p.startsWith('/studies/new')},
  {
    key: 'library',
    href: '/studies',
    icon: DocumentChartBarIcon,
    selectedIcon: DocumentChartBarSolid,
    match: p => p === '/studies' || (/^\/studies\/\d+/.test(p)),
  },
  {key: 'monitors', href: '/monitors', icon: BellAlertIcon, selectedIcon: BellAlertSolid, match: p => p.startsWith('/monitors')},
  {
    key: 'templates',
    href: '/templates',
    icon: BookmarkSquareIcon,
    selectedIcon: BookmarkSquareSolid,
    match: p => p.startsWith('/templates'),
  },
  {
    key: 'business',
    href: '/business',
    icon: BuildingStorefrontIcon,
    selectedIcon: BuildingStorefrontSolid,
    match: p => p.startsWith('/business'),
  },
];

const SETTINGS_NAV: NavEntry = {
  key: 'settings',
  href: '/settings',
  icon: Cog6ToothIcon,
  selectedIcon: Cog6ToothSolid,
  match: p => p.startsWith('/settings'),
};

export function App() {
  const {t} = useTranslation(['nav', 'common']);
  const {pathname} = useLocation();

  const item = (entry: NavEntry) => (
    <SideNavItem
      key={entry.key}
      label={t(`nav:${entry.key}`)}
      href={entry.href}
      icon={entry.icon}
      selectedIcon={entry.selectedIcon}
      isSelected={entry.match(pathname)}
    />
  );

  return (
    <AppShell
      contentPadding={0}
      variant="section"
      sideNav={
        <SideNav
          collapsible={{buttonLabel: t('nav:collapse')}}
          aria-label={t('nav:label')}
          header={
            <SideNavHeading
              heading={t('common:appName')}
              subheading={t('common:appTagline')}
              headingHref="/"
              icon={<NavIcon icon={<Icon icon={ViewfinderCircleIcon} size="sm" />} />}
            />
          }
          footer={
            <SideNavSection title={t('nav:settings')} isHeaderHidden>
              {import.meta.env.DEV && (
                <SideNavItem
                  label={t('nav:rtlCheck')}
                  href="/dev/rtl"
                  icon={LanguageIcon}
                  selectedIcon={LanguageSolid}
                  isSelected={pathname.startsWith('/dev/rtl')}
                />
              )}
              {item(SETTINGS_NAV)}
            </SideNavSection>
          }>
          <SideNavSection title={t('nav:label')} isHeaderHidden>
            {MAIN_NAV.map(item)}
          </SideNavSection>
        </SideNav>
      }>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/studies" element={<LibraryPage />} />
        <Route path="/studies/new/:type" element={<StudySetupPage />} />
        <Route path="/studies/:id" element={<StudyViewPage />} />
        <Route path="/monitors" element={<PlaceholderPage section="monitors" phase={6} icon={BellAlertIcon} />} />
        <Route path="/templates" element={<PlaceholderPage section="templates" phase={4} icon={BookmarkSquareIcon} />} />
        <Route path="/business" element={<BusinessListPage />} />
        <Route path="/business/new" element={<BusinessFormPage />} />
        <Route path="/business/:id" element={<BusinessFormPage key="edit" />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/dev/rtl" element={<RtlCheckPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  );
}
