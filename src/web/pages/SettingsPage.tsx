import {Card} from '@astryxdesign/core/Card';
import {Heading} from '@astryxdesign/core/Heading';
import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import {Text} from '@astryxdesign/core/Text';
import {Token} from '@astryxdesign/core/Token';
import {HStack} from '@astryxdesign/core/HStack';
import {StackItem} from '@astryxdesign/core/Stack';
import {VStack} from '@astryxdesign/core/VStack';
import {useTranslation} from 'react-i18next';
import {PageFrame} from '../components/PageFrame';
import {useResource} from '../lib/api';
import {useColorMode, type ColorMode} from '../Providers';

const MODES: ColorMode[] = ['system', 'light', 'dark'];

/** Settings — Phase 0: appearance only. Sessions, limits and the bridge status come in Phase 1. */
export function SettingsPage() {
  const {t} = useTranslation(['sections', 'common']);
  const {mode, setMode} = useColorMode();
  const health = useResource<{dataDir: string}>('/api/health');

  return (
    <PageFrame title={t('sections:settings.title')} contentWidth={720}>
      <VStack gap={4}>
        <Card>
          <HStack gap={4} vAlign="center" wrap="wrap">
            <StackItem size="fill">
              <VStack gap={1}>
                <Heading level={2}>{t('sections:settings.appearance.title')}</Heading>
                <Text type="supporting" color="secondary">
                  {t('sections:settings.appearance.description')}
                </Text>
              </VStack>
            </StackItem>
            <SegmentedControl label={t('common:theme.label')} value={mode} onChange={value => setMode(value as ColorMode)}>
              {MODES.map(m => (
                <SegmentedControlItem key={m} value={m} label={t(`common:theme.${m}`)} />
              ))}
            </SegmentedControl>
          </HStack>
        </Card>

        <Card>
          <HStack gap={4} vAlign="center">
            <StackItem size="fill">
              <VStack gap={1}>
                <Heading level={2}>{t('sections:settings.sessions.title')}</Heading>
                <Text type="supporting" color="secondary">
                  {t('sections:settings.sessions.description')}
                </Text>
              </VStack>
            </StackItem>
            <Token label={t('sections:phase', {n: 1})} color="gray" />
          </HStack>
        </Card>

        {health.data ? (
          <Card variant="muted">
            <VStack gap={1}>
              <Heading level={2}>{t('sections:settings.local.title')}</Heading>
              <Text type="supporting" color="secondary">
                {t('sections:settings.local.description', {dir: health.data.dataDir})}
              </Text>
            </VStack>
          </Card>
        ) : null}
      </VStack>
    </PageFrame>
  );
}
