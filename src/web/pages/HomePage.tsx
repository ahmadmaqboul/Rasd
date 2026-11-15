import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {ClickableCard} from '@astryxdesign/core/ClickableCard';
import {Grid} from '@astryxdesign/core/Grid';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack} from '@astryxdesign/core/HStack';
import {Icon} from '@astryxdesign/core/Icon';
import {InputGroup} from '@astryxdesign/core/InputGroup';
import {Layout, LayoutContent} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Token} from '@astryxdesign/core/Token';
import {VStack} from '@astryxdesign/core/VStack';
import {LightBulbIcon, MagnifyingGlassIcon} from '@heroicons/react/24/outline';
import {useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {useNavigate} from 'react-router';
import {RECIPES} from '../../core/recipes';
import {suggestStudy, type Suggestion} from '../../core/suggest';
import {recipeIcon} from '../lib/recipeIcons';
import {useStudyText} from '../lib/studyText';

function setupHref(recipeId: string, value?: string): string {
  const query = value ? `?q=${encodeURIComponent(value)}` : '';
  return `/studies/new/${recipeId}${query}`;
}

function SuggestionNote({suggestion}: {suggestion: Suggestion}) {
  const {t} = useTranslation('home');
  const text = useStudyText();
  const platform = suggestion.platform ? t(`platforms.${suggestion.platform}`) : '';
  const reason =
    suggestion.reason === 'account_url'
      ? suggestion.handle
        ? t('suggestion.account_url_handle', {platform, handle: suggestion.handle})
        : t('suggestion.account_url', {platform})
      : suggestion.reason === 'handle'
        ? t('suggestion.handle', {handle: suggestion.handle ?? ''})
        : t(`suggestion.${suggestion.reason}`);

  return (
    <Card variant="muted" padding={3}>
      <HStack gap={3} vAlign="start">
        <Icon icon={LightBulbIcon} color="secondary" />
        <VStack gap={0.5}>
          <Text type="label">
            {t('suggestion.title', {study: text.recipeLabel(suggestion.recipeId)})}
          </Text>
          <Text type="supporting" color="secondary">
            {reason} {t('suggestion.change')}
          </Text>
        </VStack>
      </HStack>
    </Card>
  );
}

/** الرئيسية (§4.1): سؤال واحد، صندوق لصق/بحث، وبطاقات أنواع الدراسات. الإجراء الأساسي الوحيد: «ابدأ». */
export function HomePage() {
  const {t} = useTranslation('home');
  const text = useStudyText();
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const suggestion = useMemo(() => suggestStudy(value), [value]);

  const start = () => {
    if (suggestion) void navigate(setupHref(suggestion.recipeId, suggestion.value));
  };

  return (
    <Layout
      contentWidth={960}
      content={
        <LayoutContent padding={6}>
          <VStack gap={8} paddingBlockStart={8}>
            <VStack gap={5}>
              <VStack gap={2}>
                <Heading level={1} type="display-3">
                  {t('title')}
                </Heading>
                <Text type="large" color="secondary">
                  {t('subtitle')}
                </Text>
              </VStack>
              <InputGroup label={t('input.label')} isLabelHidden size="lg">
                <TextInput
                  label={t('input.label')}
                  isLabelHidden
                  placeholder={t('input.placeholder')}
                  value={value}
                  onChange={setValue}
                  onEnter={start}
                  startIcon={MagnifyingGlassIcon}
                  hasClear
                  hasAutoFocus
                />
                <Button label={t('input.submit')} variant="primary" isDisabled={!suggestion} onClick={start} />
              </InputGroup>
              {suggestion ? <SuggestionNote suggestion={suggestion} /> : null}
            </VStack>

            <VStack gap={4}>
              <Heading level={2}>{t('types.heading')}</Heading>
              <Grid columns={{minWidth: 260}} gap={4}>
                {RECIPES.map(recipe => {
                  const label = text.recipeLabel(recipe.id);
                  return (
                    <ClickableCard key={recipe.id} label={label} href={setupHref(recipe.id)} padding={4} height="100%">
                      <VStack gap={3}>
                        <HStack gap={2} vAlign="center" hAlign="between">
                          <Icon icon={recipeIcon(recipe.id)} size="lg" />
                          {recipe.featured ? <Token label={t('types.featured')} size="sm" color="gray" /> : null}
                        </HStack>
                        <VStack gap={1}>
                          <Text type="label" weight="semibold">
                            {label}
                          </Text>
                          <Text type="supporting" color="secondary">
                            {text.recipeDescription(recipe.id)}
                          </Text>
                        </VStack>
                      </VStack>
                    </ClickableCard>
                  );
                })}
              </Grid>
            </VStack>
          </VStack>
        </LayoutContent>
      }
    />
  );
}
