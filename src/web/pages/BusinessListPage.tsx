import {Button} from '@astryxdesign/core/Button';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Icon} from '@astryxdesign/core/Icon';
import {Link} from '@astryxdesign/core/Link';
import {Skeleton} from '@astryxdesign/core/Skeleton';
import {Table, type TableColumn} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {BuildingStorefrontIcon, PlusIcon} from '@heroicons/react/24/outline';
import {useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {ErrorState} from '../components/ErrorState';
import {Ltr} from '../components/Ltr';
import {PageFrame} from '../components/PageFrame';
import {useEventStream, useResource, type ProfileView} from '../lib/api';
import {formatDateTime, formatNumber} from '../lib/locale';

type Row = ProfileView & Record<string, unknown>;

/** Business profiles (§4.5): one per business, Saed Tel first. */
export function BusinessListPage() {
  const {t} = useTranslation('business');
  const profiles = useResource<ProfileView[]>('/api/profiles');
  useEventStream(event => {
    if (event.type.startsWith('profile.')) profiles.reload();
  });

  const columns = useMemo<TableColumn<Row>[]>(
    () => [
      {key: 'name', header: t('columns.name'), renderCell: row => <Link href={`/business/${row.id}`}>{row.name}</Link>},
      {
        key: 'accounts',
        header: t('columns.accounts'),
        renderCell: row =>
          row.accounts.length ? (
            <VStack gap={0.5}>
              {row.accounts.map(a => (
                <Text key={a.entityId} type="supporting">
                  {t(`platforms.${a.platform}`)} · <Ltr>{a.platform === 'web' ? a.handle : `@${a.handle}`}</Ltr>
                </Text>
              ))}
            </VStack>
          ) : (
            <Text type="supporting" color="secondary">
              —
            </Text>
          ),
      },
      {
        key: 'products',
        header: t('columns.products'),
        align: 'end',
        renderCell: row => <Text hasTabularNumbers>{formatNumber(row.products.length)}</Text>,
      },
      {
        key: 'competitors',
        header: t('columns.competitors'),
        align: 'end',
        renderCell: row => <Text hasTabularNumbers>{formatNumber(row.competitors.length)}</Text>,
      },
      {
        key: 'updatedAt',
        header: t('columns.updated'),
        renderCell: row => (
          <Text type="supporting" color="secondary">
            {formatDateTime(row.updatedAt)}
          </Text>
        ),
      },
    ],
    [t],
  );

  const hasProfiles = Boolean(profiles.data?.length);
  const addButton = <Button label={t('add')} variant="primary" href="/business/new" icon={<Icon icon={PlusIcon} />} />;

  let body;
  if (profiles.isLoading && !profiles.data) {
    body = (
      <VStack gap={2}>
        {[0, 1].map(i => (
          <Skeleton key={i} height={52} index={i} />
        ))}
      </VStack>
    );
  } else if (profiles.error && !profiles.data) {
    body = <ErrorState error={profiles.error} onRetry={profiles.reload} />;
  } else if (!hasProfiles) {
    body = (
      <EmptyState
        headingLevel={2}
        icon={<Icon icon={BuildingStorefrontIcon} size="lg" color="secondary" />}
        title={t('empty.title')}
        description={t('empty.description')}
        actions={addButton}
      />
    );
  } else {
    body = <Table<Row> data={profiles.data as Row[]} columns={columns} idKey="id" hasHover />;
  }

  return (
    <PageFrame title={t('title')} subtitle={t('subtitle')} action={hasProfiles ? addButton : undefined}>
      {body}
    </PageFrame>
  );
}
