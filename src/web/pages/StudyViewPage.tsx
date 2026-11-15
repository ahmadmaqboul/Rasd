import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Code} from '@astryxdesign/core/Code';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack} from '@astryxdesign/core/HStack';
import {Icon} from '@astryxdesign/core/Icon';
import {useLightbox} from '@astryxdesign/core/Lightbox';
import {Link} from '@astryxdesign/core/Link';
import {Skeleton} from '@astryxdesign/core/Skeleton';
import {StackItem} from '@astryxdesign/core/Stack';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {Text} from '@astryxdesign/core/Text';
import {Thumbnail} from '@astryxdesign/core/Thumbnail';
import {Token} from '@astryxdesign/core/Token';
import {VStack} from '@astryxdesign/core/VStack';
import {CheckIcon, ClipboardDocumentIcon, DocumentMagnifyingGlassIcon} from '@heroicons/react/24/outline';
import {useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {useParams} from 'react-router';
import {ErrorState} from '../components/ErrorState';
import {Ltr} from '../components/Ltr';
import {PageFrame} from '../components/PageFrame';
import {StatusLabel} from '../components/StatusLabel';
import {useEventStream, useResource, type EvidenceItem, type Finding, type StudyDetail} from '../lib/api';
import {formatNumber} from '../lib/locale';
import {useStudyText} from '../lib/studyText';

const CONFIDENCE_COLOR = {low: 'gray', medium: 'yellow', high: 'green'} as const;

/** زر نسخ أمر التحليل — قلب تدفّق «جاهز للتحليل» (§4). */
function CopyCommandButton({command}: {command: string}) {
  const {t} = useTranslation('studies');
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  };
  return (
    <Button
      variant="primary"
      label={copied ? t('view.analyze.copied') : t('view.analyze.copy')}
      icon={<Icon icon={copied ? CheckIcon : ClipboardDocumentIcon} />}
      clickAction={copy}
    />
  );
}

function EvidenceList({ids, evidence}: {ids: string[]; evidence: Record<string, EvidenceItem>}) {
  const {t} = useTranslation(['studies', 'common']);
  const images = useMemo(
    () =>
      ids.flatMap(id => (evidence[id]?.media ?? []).map(src => ({src, alt: evidence[id]?.label ?? id, caption: evidence[id]?.label}))),
    [ids, evidence],
  );
  const lightbox = useLightbox({media: images});
  let imageIndex = 0;

  return (
    <VStack gap={2}>
      <Text type="label" color="secondary">
        {t('studies:view.evidence')}
      </Text>
      <HStack gap={3} wrap="wrap" vAlign="start">
        {ids.map(id => {
          const item = evidence[id];
          if (!item) {
            return <Token key={id} label={`${t('studies:view.evidenceMissing')} (${id})`} color="red" size="sm" />;
          }
          const first = imageIndex;
          imageIndex += item.media.length;
          return (
            <VStack key={id} gap={1} maxWidth={220}>
              {item.media.length ? (
                <HStack gap={1}>
                  {item.media.map((src, i) => (
                    <Thumbnail key={src} src={src} alt={item.label} label={item.label} onClick={() => lightbox.open(first + i)} />
                  ))}
                </HStack>
              ) : null}
              {item.url ? (
                <Link href={item.url} isExternalLink>
                  <Text type="supporting" maxLines={1}>
                    {item.label}
                  </Text>
                </Link>
              ) : (
                <Text type="supporting" color="secondary" maxLines={1}>
                  {item.label}
                </Text>
              )}
            </VStack>
          );
        })}
      </HStack>
      {lightbox.element}
    </VStack>
  );
}

function FindingCard({finding, evidence}: {finding: Finding; evidence: Record<string, EvidenceItem>}) {
  const {t} = useTranslation(['studies', 'common']);
  return (
    <Card data-testid="finding-card">
      <VStack gap={3}>
        <HStack gap={3} vAlign="start">
          <StackItem size="fill">
            <Heading level={3}>{finding.title}</Heading>
          </StackItem>
          <Token
            size="sm"
            color={CONFIDENCE_COLOR[finding.confidence]}
            label={`${t('common:confidence.label')}: ${t(`common:confidence.${finding.confidence}`)}`}
          />
        </HStack>
        <Text as="p">{finding.claim}</Text>
        {finding.why ? (
          <VStack gap={1}>
            <Text type="label" color="secondary">
              {t('studies:view.why')}
            </Text>
            <Text as="p" color="secondary">
              {finding.why}
            </Text>
          </VStack>
        ) : null}
        <EvidenceList ids={finding.evidence} evidence={evidence} />
      </VStack>
    </Card>
  );
}

/** عرض الدراسة: الحالة، أمر التحليل، والنتائج التي تكتبها جلسة Claude — تظهر مباشرة عبر SSE. */
export function StudyViewPage() {
  const {t} = useTranslation(['studies', 'common']);
  const text = useStudyText();
  const {id = ''} = useParams();
  const detail = useResource<StudyDetail>(`/api/studies/${id}`);
  const isLive = useEventStream(event => {
    if (event.studyId === Number(id)) detail.reload();
  });

  if (detail.isLoading && !detail.data) {
    return (
      <PageFrame title={t('common:loading')}>
        <VStack gap={3}>
          {[0, 1, 2].map(i => (
            <Skeleton key={i} height={120} index={i} />
          ))}
        </VStack>
      </PageFrame>
    );
  }

  if (detail.error && !detail.data) {
    if (detail.error.kind === 'not_found') {
      return (
        <PageFrame title={t('studies:view.notFound.title')}>
          <EmptyState
            headingLevel={2}
            title={t('studies:view.notFound.title')}
            description={t('studies:view.notFound.description')}
            actions={<Button label={t('studies:view.notFound.action')} variant="primary" href="/studies" />}
          />
        </PageFrame>
      );
    }
    return (
      <PageFrame title={t('common:errors.generic')}>
        <ErrorState error={detail.error} onRetry={detail.reload} />
      </PageFrame>
    );
  }

  const data = detail.data;
  if (!data) return null;
  const {study, findings, evidence, packageStats} = data;
  const command = `/rasd-analyze ${study.id}`;

  // ترتيب الوحدات كما في الدراسة، ثم أي وحدة كتبت نتائج خارجها.
  const moduleOrder = [...new Set([...study.modules, ...findings.map(f => f.module)])];
  const byModule = moduleOrder
    .map(module => ({module, items: findings.filter(f => f.module === module)}))
    .filter(group => group.items.length);

  return (
    <PageFrame
      title={study.title}
      subtitle={text.recipeLabel(study.type)}
      action={study.status === 'ready' ? <CopyCommandButton command={command} /> : undefined}>
      <VStack gap={6}>
        <HStack gap={4} vAlign="center" wrap="wrap">
          <StatusLabel status={study.status} />
          {packageStats ? (
            <Text type="supporting" color="secondary">
              {t('studies:view.package', {items: formatNumber(packageStats.items), images: formatNumber(packageStats.images)})}
            </Text>
          ) : null}
          <StackItem size="fill">
            <HStack gap={2} vAlign="center" hAlign="end">
              <StatusDot
                variant={isLive ? 'success' : 'neutral'}
                label={isLive ? t('studies:view.live') : t('studies:view.offline')}
              />
              <Text type="supporting" color="secondary">
                {isLive ? t('studies:view.live') : t('studies:view.offline')}
              </Text>
            </HStack>
          </StackItem>
        </HStack>

        {study.isDemo ? (
          <Banner
            status="info"
            title={t('studies:view.demoBanner.title')}
            description={t('studies:view.demoBanner.description')}
            collapsible={false}
          />
        ) : null}

        {study.status === 'ready' ? (
          <Card variant="muted">
            <VStack gap={2}>
              <Heading level={2}>{t('studies:view.analyze.title')}</Heading>
              <Text as="p" color="secondary">
                {t('studies:view.analyze.description')}
              </Text>
              <HStack>
                <Code>
                  <Ltr>{command}</Ltr>
                </Code>
              </HStack>
            </VStack>
          </Card>
        ) : null}

        {study.status === 'analyzing' ? (
          <Banner
            status="info"
            title={t('studies:view.analyzing.title')}
            description={t('studies:view.analyzing.description')}
            collapsible={false}
          />
        ) : null}

        <VStack gap={4}>
          <HStack gap={3} vAlign="center">
            <Heading level={2}>{t('studies:view.findings')}</Heading>
            {findings.length ? (
              <Text type="supporting" color="secondary">
                {t('studies:view.findingsCount', {count: findings.length})}
              </Text>
            ) : null}
          </HStack>

          {byModule.length === 0 ? (
            <EmptyState
              headingLevel={3}
              isCompact
              icon={<Icon icon={DocumentMagnifyingGlassIcon} size="lg" color="secondary" />}
              title={t('studies:view.noFindings.title')}
              description={t('studies:view.noFindings.description')}
            />
          ) : (
            byModule.map(group => (
              <VStack key={group.module} gap={3}>
                <Text type="label" color="secondary">
                  {text.moduleLabel(group.module)}
                </Text>
                {group.items.map(finding => (
                  <FindingCard key={finding.id} finding={finding} evidence={evidence} />
                ))}
              </VStack>
            ))
          )}
        </VStack>
      </VStack>
    </PageFrame>
  );
}
