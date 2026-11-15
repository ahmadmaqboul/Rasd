import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Icon} from '@astryxdesign/core/Icon';
import type {IconType} from '@astryxdesign/core/Icon';
import {Token} from '@astryxdesign/core/Token';
import {useTranslation} from 'react-i18next';
import {PageFrame} from '../components/PageFrame';

interface PlaceholderPageProps {
  section: 'monitors' | 'templates' | 'business';
  /** The phase in which this section gets built — shown honestly instead of a fake UI. */
  phase: number;
  icon: IconType;
}

/** A section that is not built yet: an empty state explaining what will be here, with no buttons that don't work. */
export function PlaceholderPage({section, phase, icon}: PlaceholderPageProps) {
  const {t} = useTranslation('sections');
  return (
    <PageFrame title={t(`${section}.title`)} action={<Token label={t('phase', {n: phase})} color="gray" />}>
      <EmptyState
        headingLevel={2}
        icon={<Icon icon={icon} size="lg" color="secondary" />}
        title={t(`${section}.empty.title`)}
        description={t(`${section}.empty.description`)}
      />
    </PageFrame>
  );
}
