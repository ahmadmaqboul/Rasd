import {Button} from '@astryxdesign/core/Button';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Layout, LayoutContent} from '@astryxdesign/core/Layout';
import {useTranslation} from 'react-i18next';

export function NotFoundPage() {
  const {t} = useTranslation(['common', 'nav']);
  return (
    <Layout
      content={
        <LayoutContent padding={6}>
          <EmptyState
            headingLevel={1}
            title={t('common:errors.notFound')}
            actions={<Button label={t('nav:home')} variant="primary" href="/" />}
          />
        </LayoutContent>
      }
    />
  );
}
