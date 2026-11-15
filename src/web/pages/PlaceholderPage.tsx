import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Icon} from '@astryxdesign/core/Icon';
import type {IconType} from '@astryxdesign/core/Icon';
import {Token} from '@astryxdesign/core/Token';
import {useTranslation} from 'react-i18next';
import {PageFrame} from '../components/PageFrame';

interface PlaceholderPageProps {
  section: 'monitors' | 'templates' | 'business';
  /** المرحلة التي يُبنى فيها هذا القسم — تُعرض بصدق بدل واجهة وهمية. */
  phase: number;
  icon: IconType;
}

/** قسم لم يُبنَ بعد: حالة فارغة تشرح ما سيكون هنا، بلا أزرار لا تعمل. */
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
