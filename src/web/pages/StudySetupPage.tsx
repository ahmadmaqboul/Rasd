import {Banner} from '@astryxdesign/core/Banner';
import {Card} from '@astryxdesign/core/Card';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack} from '@astryxdesign/core/HStack';
import {Icon} from '@astryxdesign/core/Icon';
import {Text} from '@astryxdesign/core/Text';
import {Token} from '@astryxdesign/core/Token';
import {VStack} from '@astryxdesign/core/VStack';
import {useTranslation} from 'react-i18next';
import {useParams, useSearchParams} from 'react-router';
import {getRecipe, resolveModules} from '../../core/recipes';
import {Ltr} from '../components/Ltr';
import {PageFrame} from '../components/PageFrame';
import {recipeIcon} from '../lib/recipeIcons';
import {useStudyText} from '../lib/studyText';

/**
 * معاينة وصفة الدراسة. شاشة الإعداد الكاملة (مدخل واحد + «خيارات متقدمة») تُبنى في Phase 4؛
 * هنا نعرض بصدق ما المطلوب وما سيُحلَّل، بلا زر تشغيل لا يعمل.
 */
export function StudySetupPage() {
  const {t} = useTranslation('studies');
  const text = useStudyText();
  const {type = ''} = useParams();
  const [search] = useSearchParams();
  const recipe = getRecipe(type);
  const prefilled = search.get('q');

  if (!recipe) {
    return (
      <PageFrame title={t('setup.unknown')}>
        <EmptyState headingLevel={2} title={t('setup.unknown')} />
      </PageFrame>
    );
  }

  const label = text.recipeLabel(recipe.id);
  const modules = resolveModules(recipe.id);

  return (
    <PageFrame title={t('setup.title', {study: label})} subtitle={text.recipeDescription(recipe.id)} contentWidth={720}>
      <VStack gap={4}>
        <Banner
          status="info"
          title={t('setup.notReady.title')}
          description={t('setup.notReady.description')}
          collapsible={false}
        />

        <Card>
          <VStack gap={3}>
            <Heading level={2}>{t('setup.required')}</Heading>
            <HStack gap={3} vAlign="center">
              <Icon icon={recipeIcon(recipe.id)} color="secondary" />
              <VStack gap={0.5}>
                <Text type="label">{text.recipeInput(recipe.id)}</Text>
                {prefilled ? (
                  <Text type="supporting" color="secondary">
                    <Ltr>{prefilled}</Ltr>
                  </Text>
                ) : null}
              </VStack>
            </HStack>
          </VStack>
        </Card>

        {recipe.composes?.length ? (
          <Card>
            <VStack gap={3}>
              <Heading level={2}>{t('setup.composes')}</Heading>
              <HStack gap={2} wrap="wrap">
                {recipe.composes.map(id => (
                  <Token key={id} label={text.recipeLabel(id)} href={`/studies/new/${id}`} />
                ))}
              </HStack>
            </VStack>
          </Card>
        ) : null}

        {modules.length ? (
          <Card>
            <VStack gap={3}>
              <Heading level={2}>{t('setup.modules')}</Heading>
              <HStack gap={2} wrap="wrap">
                {modules.map(id => (
                  <Token key={id} label={text.moduleLabel(id)} color="gray" />
                ))}
              </HStack>
            </VStack>
          </Card>
        ) : null}
      </VStack>
    </PageFrame>
  );
}
