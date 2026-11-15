import {Button} from '@astryxdesign/core/Button';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {HStack} from '@astryxdesign/core/HStack';
import {Icon} from '@astryxdesign/core/Icon';
import {Link} from '@astryxdesign/core/Link';
import {Skeleton} from '@astryxdesign/core/Skeleton';
import {Table, type TableColumn} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {Token} from '@astryxdesign/core/Token';
import {VStack} from '@astryxdesign/core/VStack';
import {DocumentChartBarIcon} from '@heroicons/react/24/outline';
import {useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {PageFrame} from '../components/PageFrame';
import {StatusLabel} from '../components/StatusLabel';
import {useEventStream, useResource, type StudyListItem} from '../lib/api';
import {formatDateTime, formatNumber} from '../lib/locale';
import {useStudyText} from '../lib/studyText';
import {ErrorState} from '../components/ErrorState';

type Row = StudyListItem & Record<string, unknown>;

/** My Studies (§4.2): all previous studies. Search and filtering come with the business profiles in Phase 1. */
export function LibraryPage() {
  const {t} = useTranslation(['studies', 'common']);
  const text = useStudyText();
  const studies = useResource<StudyListItem[]>('/api/studies');
  useEventStream(() => studies.reload());

  const columns = useMemo<TableColumn<Row>[]>(
    () => [
      {
        key: 'title',
        header: t('studies:library.columns.title'),
        renderCell: row => (
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Link href={`/studies/${row.id}`}>{row.title}</Link>
            {row.isDemo ? <Token label={t('common:demoData')} size="sm" color="gray" /> : null}
          </HStack>
        ),
      },
      {key: 'type', header: t('studies:library.columns.type'), renderCell: row => text.recipeLabel(row.type)},
      {key: 'status', header: t('studies:library.columns.status'), renderCell: row => <StatusLabel status={row.status} />},
      {
        key: 'findingCount',
        header: t('studies:library.columns.findings'),
        align: 'end',
        renderCell: row => <Text hasTabularNumbers>{formatNumber(row.findingCount)}</Text>,
      },
      {
        key: 'updatedAt',
        header: t('studies:library.columns.updated'),
        renderCell: row => (
          <Text type="supporting" color="secondary">
            {formatDateTime(row.updatedAt)}
          </Text>
        ),
      },
    ],
    [t, text],
  );

  let body;
  if (studies.isLoading && !studies.data) {
    body = (
      <VStack gap={2}>
        {[0, 1, 2].map(i => (
          <Skeleton key={i} height={44} index={i} />
        ))}
      </VStack>
    );
  } else if (studies.error && !studies.data) {
    body = <ErrorState error={studies.error} onRetry={studies.reload} />;
  } else if (!studies.data?.length) {
    body = (
      <EmptyState
        headingLevel={2}
        icon={<Icon icon={DocumentChartBarIcon} size="lg" color="secondary" />}
        title={t('studies:library.empty.title')}
        description={t('studies:library.empty.description')}
        actions={<Button label={t('studies:library.empty.action')} variant="primary" href="/" />}
      />
    );
  } else {
    body = <Table<Row> data={studies.data as Row[]} columns={columns} idKey="id" hasHover />;
  }

  return <PageFrame title={t('studies:library.title')}>{body}</PageFrame>;
}
