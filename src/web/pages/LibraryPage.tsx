import {Button} from '@astryxdesign/core/Button';
import {Grid} from '@astryxdesign/core/Grid';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {HStack} from '@astryxdesign/core/HStack';
import {Icon} from '@astryxdesign/core/Icon';
import {Link} from '@astryxdesign/core/Link';
import {Selector} from '@astryxdesign/core/Selector';
import {Skeleton} from '@astryxdesign/core/Skeleton';
import {Table, type TableColumn} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Token} from '@astryxdesign/core/Token';
import {VStack} from '@astryxdesign/core/VStack';
import {DocumentChartBarIcon, MagnifyingGlassIcon} from '@heroicons/react/24/outline';
import {useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {PageFrame} from '../components/PageFrame';
import {StatusLabel} from '../components/StatusLabel';
import {useEventStream, useResource, type ProfileView, type StudyListItem} from '../lib/api';
import {formatDateTime, formatNumber} from '../lib/locale';
import {useStudyText} from '../lib/studyText';
import {ErrorState} from '../components/ErrorState';

type Row = StudyListItem & Record<string, unknown>;

const ALL = 'all';
const NO_PROFILE = 'none';

/** Lowercase, without Arabic diacritics and tatweel, with the common alef/yeh/teh-marbuta variants folded. */
function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .trim();
}

/** My Studies (§4.2): all previous studies, searchable and filterable by type and business profile. */
export function LibraryPage() {
  const {t} = useTranslation(['studies', 'common']);
  const text = useStudyText();
  const studies = useResource<StudyListItem[]>('/api/studies');
  const profiles = useResource<ProfileView[]>('/api/profiles');
  const [query, setQuery] = useState('');
  const [type, setType] = useState(ALL);
  const [profile, setProfile] = useState(ALL);
  useEventStream(event => {
    if (event.type.startsWith('study.') || event.type.startsWith('finding.')) studies.reload();
    if (event.type.startsWith('profile.')) profiles.reload();
  });

  const profileName = useMemo(() => new Map((profiles.data ?? []).map(p => [p.id, p.name])), [profiles.data]);
  const typesPresent = useMemo(() => [...new Set((studies.data ?? []).map(s => s.type))], [studies.data]);
  const filtered = useMemo(() => {
    const q = normalizeSearch(query);
    return (studies.data ?? []).filter(study => {
      if (type !== ALL && study.type !== type) return false;
      if (profile === NO_PROFILE && study.profileId !== null) return false;
      if (profile !== ALL && profile !== NO_PROFILE && study.profileId !== Number(profile)) return false;
      if (!q) return true;
      const haystack = normalizeSearch(`${study.title} ${text.recipeLabel(study.type)} ${JSON.stringify(study.params)}`);
      return q.split(/\s+/).every(word => haystack.includes(word));
    });
  }, [studies.data, query, type, profile, text]);
  const isFiltered = query.trim() !== '' || type !== ALL || profile !== ALL;

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
      {
        key: 'profileId',
        header: t('studies:library.columns.profile'),
        renderCell: row => (
          <Text type="supporting" color={row.profileId ? undefined : 'secondary'}>
            {row.profileId ? (profileName.get(row.profileId) ?? '—') : '—'}
          </Text>
        ),
      },
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
    [t, text, profileName],
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
    body = (
      <VStack gap={4}>
        <Grid columns={{minWidth: 220}} gap={3}>
          <TextInput
            label={t('studies:library.search')}
            isLabelHidden
            type="search"
            placeholder={t('studies:library.search')}
            value={query}
            onChange={setQuery}
            startIcon={MagnifyingGlassIcon}
            dir="auto"
            hasClear
          />
          <Selector
            label={t('studies:library.filters.type')}
            isLabelHidden
            value={type}
            onChange={setType}
            options={[
              {value: ALL, label: `${t('studies:library.filters.type')}: ${t('studies:library.filters.all')}`},
              ...typesPresent.map(id => ({value: id, label: text.recipeLabel(id)})),
            ]}
          />
          <Selector
            label={t('studies:library.filters.profile')}
            isLabelHidden
            value={profile}
            onChange={setProfile}
            options={[
              {value: ALL, label: `${t('studies:library.filters.profile')}: ${t('studies:library.filters.all')}`},
              ...(profiles.data ?? []).map(p => ({value: String(p.id), label: p.name})),
              {value: NO_PROFILE, label: t('studies:library.filters.noProfile')},
            ]}
          />
        </Grid>
        {isFiltered ? (
          <Text type="supporting" color="secondary" hasTabularNumbers role="status">
            {t('studies:library.count', {shown: formatNumber(filtered.length), total: formatNumber(studies.data.length)})}
          </Text>
        ) : null}
        {filtered.length ? (
          <Table<Row> data={filtered as Row[]} columns={columns} idKey="id" hasHover />
        ) : (
          <EmptyState
            headingLevel={2}
            title={t('studies:library.noMatch.title')}
            actions={
              <Button
                label={t('studies:library.noMatch.action')}
                onClick={() => {
                  setQuery('');
                  setType(ALL);
                  setProfile(ALL);
                }}
              />
            }
          />
        )}
      </VStack>
    );
  }

  return <PageFrame title={t('studies:library.title')}>{body}</PageFrame>;
}
