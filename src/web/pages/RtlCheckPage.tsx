import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Calendar, type ISODateString} from '@astryxdesign/core/Calendar';
import {Card} from '@astryxdesign/core/Card';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {DateInput} from '@astryxdesign/core/DateInput';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {Drawer, DrawerHeader} from '@astryxdesign/core/Drawer';
import {DropdownMenu} from '@astryxdesign/core/DropdownMenu';
import {Grid} from '@astryxdesign/core/Grid';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack} from '@astryxdesign/core/HStack';
import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {Pagination} from '@astryxdesign/core/Pagination';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {Selector} from '@astryxdesign/core/Selector';
import {Switch} from '@astryxdesign/core/Switch';
import {Tab, TabList} from '@astryxdesign/core/TabList';
import {Table, type TableColumn} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {TextArea} from '@astryxdesign/core/TextArea';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Tooltip} from '@astryxdesign/core/Tooltip';
import {VStack} from '@astryxdesign/core/VStack';
import {ArrowDownTrayIcon, DocumentDuplicateIcon, MagnifyingGlassIcon, TrashIcon} from '@heroicons/react/24/outline';
import {useState, type ReactNode} from 'react';
import {useTranslation} from 'react-i18next';
import {DirectionalIcon} from '../components/DirectionalIcon';
import {Ltr} from '../components/Ltr';
import {PageFrame} from '../components/PageFrame';
import {formatNumber} from '../lib/locale';

interface AccountRow extends Record<string, unknown> {
  account: string;
  followers: number;
  posts: number;
  rate: string;
}

const ROWS: AccountRow[] = [
  {account: '@saedtel', followers: 18400, posts: 412, rate: '3.2%'},
  {account: '@competitor_one', followers: 52100, posts: 980, rate: '1.4%'},
  {account: '@competitor_two', followers: 9300, posts: 156, rate: '4.8%'},
];

function Block({title, children, testId}: {title: string; children: ReactNode; testId: string}) {
  return (
    <Card data-testid={testId}>
      <VStack gap={4}>
        <Heading level={2}>{title}</Heading>
        {children}
      </VStack>
    </Card>
  );
}

/**
 * صفحة للمطوّر (تظهر في وضع التطوير فقط): تعرض مكوّنات Astryx الأساسية بالعربية
 * للتحقق من الاتجاه. لقطاتها ونتائجها موثّقة في docs/rtl.md.
 * يمكن فتحها مع ‎?open=dialog|drawer|menu‎ لالتقاط العناصر المنبثقة آلياً.
 */
export function RtlCheckPage() {
  const {t} = useTranslation('dev');
  const initial = new URLSearchParams(window.location.search).get('open');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('instagram.com/saedtel');
  const [bad, setBad] = useState('instagram');
  const [search, setSearch] = useState('');
  const [notes, setNotes] = useState('');
  const [price, setPrice] = useState<number | null>(89);
  const [region, setRegion] = useState('ps');
  const [notify, setNotify] = useState(true);
  const [stopped, setStopped] = useState(false);
  const [tab, setTab] = useState('summary');
  const [page, setPage] = useState(2);
  const [date, setDate] = useState<ISODateString | undefined>('2026-11-15');
  const [dialogOpen, setDialogOpen] = useState(initial === 'dialog');
  const [drawerOpen, setDrawerOpen] = useState(initial === 'drawer');

  const columns: TableColumn<AccountRow>[] = [
    {key: 'account', header: t('rtl.columns.account'), renderCell: row => <Ltr>{row.account}</Ltr>},
    {
      key: 'followers',
      header: t('rtl.columns.followers'),
      align: 'end',
      renderCell: row => <Text hasTabularNumbers>{formatNumber(row.followers)}</Text>,
    },
    {
      key: 'posts',
      header: t('rtl.columns.posts'),
      align: 'end',
      renderCell: row => <Text hasTabularNumbers>{formatNumber(row.posts)}</Text>,
    },
    {key: 'rate', header: t('rtl.columns.rate'), align: 'end'},
  ];

  return (
    <PageFrame title={t('rtl.title')} subtitle={t('rtl.subtitle')}>
      <VStack gap={4}>
        <Block title={t('rtl.inputs')} testId="rtl-inputs">
          <Grid columns={{minWidth: 280}} gap={4}>
            <TextInput label={t('rtl.name')} placeholder={t('rtl.namePlaceholder')} value={name} onChange={setName} isRequired />
            <TextInput label={t('rtl.url')} description={t('rtl.urlDescription')} type="url" dir="ltr" value={url} onChange={setUrl} hasClear />
            <TextInput
              label={t('rtl.url')}
              type="url"
              value={bad}
              onChange={setBad}
              status={{type: 'error', message: t('rtl.error')}}
              statusVariant="detached"
            />
            <TextInput
              label={t('rtl.search')}
              type="search"
              placeholder={t('rtl.search')}
              value={search}
              onChange={setSearch}
              startIcon={MagnifyingGlassIcon}
            />
            <NumberInput label={t('rtl.price')} value={price} onChange={setPrice} min={0} />
            <Selector
              label={t('rtl.region')}
              value={region}
              onChange={setRegion}
              options={[
                {value: 'ps', label: t('rtl.regions.ps')},
                {value: 'jo', label: t('rtl.regions.jo')},
                {value: 'eg', label: t('rtl.regions.eg')},
              ]}
            />
            <DateInput label={t('rtl.date')} value={date} onChange={setDate} />
            <TextArea label={t('rtl.notes')} value={notes} onChange={setNotes} />
          </Grid>
          <HStack gap={6} wrap="wrap">
            <Switch label={t('rtl.notify')} value={notify} onChange={setNotify} />
            <CheckboxInput label={t('rtl.agree')} value={stopped} onChange={setStopped} />
          </HStack>
        </Block>

        <Block title={t('rtl.menus')} testId="rtl-menus">
          <HStack gap={2} wrap="wrap" vAlign="center">
            <Button label={t('rtl.primary')} variant="primary" />
            <Button label={t('rtl.secondary')} />
            <Button label={t('rtl.ghost')} variant="ghost" />
            <DropdownMenu
              button={{label: t('rtl.menu')}}
              items={[
                {label: t('rtl.menuItems.export'), icon: ArrowDownTrayIcon, onClick: () => {}},
                {label: t('rtl.menuItems.duplicate'), icon: DocumentDuplicateIcon, onClick: () => {}},
                {label: t('rtl.menuItems.delete'), icon: TrashIcon, onClick: () => {}},
              ]}
            />
            <Tooltip content={t('rtl.tooltip')}>
              <Button label={t('rtl.tooltip')} variant="ghost" />
            </Tooltip>
          </HStack>
        </Block>

        <Block title={t('rtl.icons')} testId="rtl-icons">
          <Text type="supporting" color="secondary">
            {t('rtl.iconsNote')}
          </Text>
          <HStack gap={4} wrap="wrap" vAlign="center">
            <Button label={t('rtl.prev')} icon={<DirectionalIcon direction="back" />} />
            <Button label={t('rtl.next')} endContent={<DirectionalIcon direction="forward" />} />
            <IconButton label={t('rtl.prev')} icon={<DirectionalIcon direction="back" />} />
            <IconButton label={t('rtl.next')} icon={<DirectionalIcon direction="forward" />} />
            <Icon icon="chevronRight" label={t('rtl.rawIcon')} color="secondary" />
            <Pagination label={t('rtl.pagination')} page={page} onChange={setPage} totalPages={7} />
          </HStack>
        </Block>

        <Block title={t('rtl.tabs')} testId="rtl-tabs">
          <TabList value={tab} onChange={setTab}>
            <Tab value="summary" label={t('rtl.tabItems.summary')} />
            <Tab value="content" label={t('rtl.tabItems.content')} />
            <Tab value="ads" label={t('rtl.tabItems.ads')} />
            <Tab value="sources" label={t('rtl.tabItems.sources')} />
          </TabList>
          <Text color="secondary">{t('rtl.tabBody')}</Text>
        </Block>

        <Block title={t('rtl.table')} testId="rtl-table">
          <Table<AccountRow> data={ROWS} columns={columns} idKey="account" hasHover />
        </Block>

        <Grid columns={{minWidth: 320}} gap={4}>
          <Block title={t('rtl.progress')} testId="rtl-progress">
            <ProgressBar label={t('rtl.progressLabel')} value={64} />
            <Banner status="warning" title={t('rtl.bannerTitle')} description={t('rtl.bannerBody')} collapsible={false} />
          </Block>
          <Block title={t('rtl.mixed')} testId="rtl-mixed">
            <Text as="p">{t('rtl.mixedSample')}</Text>
          </Block>
          <Block title={t('rtl.calendar')} testId="rtl-calendar">
            <Calendar value={date ?? null} onChange={(value: ISODateString | null) => setDate(value ?? undefined)} />
          </Block>
        </Grid>

        <Block title={t('rtl.overlays')} testId="rtl-overlays">
          <HStack gap={2} wrap="wrap">
            <Button label={t('rtl.openDialog')} onClick={() => setDialogOpen(true)} />
            <Button label={t('rtl.openDrawer')} onClick={() => setDrawerOpen(true)} />
          </HStack>
        </Block>
      </VStack>

      <Dialog isOpen={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogHeader title={t('rtl.dialogTitle')} onOpenChange={setDialogOpen} />
        <VStack gap={4} padding={4}>
          <Text as="p">{t('rtl.dialogBody')}</Text>
          <HStack gap={2} hAlign="end">
            <Button label={t('rtl.cancel')} variant="ghost" onClick={() => setDialogOpen(false)} />
            <Button label={t('rtl.confirm')} variant="primary" onClick={() => setDialogOpen(false)} />
          </HStack>
        </VStack>
      </Dialog>

      <Drawer isOpen={drawerOpen} onOpenChange={setDrawerOpen} label={t('rtl.drawerTitle')}>
        <DrawerHeader title={t('rtl.drawerTitle')} onOpenChange={setDrawerOpen} />
        <VStack gap={4} padding={4}>
          <Text as="p">{t('rtl.drawerBody')}</Text>
          <Switch label={t('rtl.notify')} value={notify} onChange={setNotify} />
        </VStack>
      </Drawer>
    </PageFrame>
  );
}
