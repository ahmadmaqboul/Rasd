import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Collapsible} from '@astryxdesign/core/Collapsible';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {Divider} from '@astryxdesign/core/Divider';
import {DropdownMenu} from '@astryxdesign/core/DropdownMenu';
import {Grid} from '@astryxdesign/core/Grid';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack} from '@astryxdesign/core/HStack';
import {Icon} from '@astryxdesign/core/Icon';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import {Selector} from '@astryxdesign/core/Selector';
import {Skeleton} from '@astryxdesign/core/Skeleton';
import {StackItem} from '@astryxdesign/core/Stack';
import {StatusDot, type StatusDotVariant} from '@astryxdesign/core/StatusDot';
import {Table, type TableColumn} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {VStack} from '@astryxdesign/core/VStack';
import {EllipsisHorizontalIcon} from '@heroicons/react/24/outline';
import {useEffect, useMemo, useState, type ReactNode} from 'react';
import {useTranslation} from 'react-i18next';
import type {SessionStatus} from '../../core/db/schema';
import {JobProgress} from '../components/JobProgress';
import {Ltr, isolateLtr} from '../components/Ltr';
import {PageFrame} from '../components/PageFrame';
import {
  issueAt,
  sendJson,
  useEventStream,
  useResource,
  type BridgeStatus,
  type FieldIssue,
  type JobView,
  type SessionView,
  type Settings,
} from '../lib/api';
import {formatDateTime, formatNumber, formatRelative} from '../lib/locale';
import {useColorMode, type ColorMode} from '../Providers';

const MODES: ColorMode[] = ['system', 'light', 'dark'];
const CURRENCIES = ['ILS', 'JOD', 'USD', 'EUR'] as const;

const SESSION_VARIANT: Record<SessionStatus, StatusDotVariant> = {
  missing: 'neutral',
  valid: 'success',
  expired: 'warning',
  challenged: 'error',
  unknown: 'neutral',
};

/** A settings section: title and explanation on one side, controls on the other (the Astryx settings layout). */
function Section({title, description, children}: {title: string; description: ReactNode; children: ReactNode}) {
  return (
    <Grid columns={{minWidth: 300}} gap={8}>
      <VStack gap={1}>
        <Heading level={2}>{title}</Heading>
        <Text type="supporting" color="secondary">
          {description}
        </Text>
      </VStack>
      <VStack gap={3}>{children}</VStack>
    </Grid>
  );
}

function useJobText() {
  const {t} = useTranslation(['jobs', 'settings']);
  return (job: JobView) => {
    const platform = typeof job.payload.platform === 'string' ? job.payload.platform : '';
    const platformLabel = platform ? t(`settings:sessions.platforms.${platform}` as 'settings:sessions.platforms.instagram') : '';
    const [group, action] = job.type.split('.');
    return group === 'session' && (action === 'login' || action === 'check')
      ? t(`jobs:types.session.${action}`, {platform: platformLabel})
      : t('jobs:types.unknown');
  };
}

// ── Sessions ─────────────────────────────────────────────────────────────────
interface SessionCardProps {
  session: SessionView;
  /** The latest finished job for this platform, to show why a login or check failed. */
  lastJob: JobView | undefined;
  onChanged: () => void;
}

function SessionCard({session, lastJob, onChanged}: SessionCardProps) {
  const {t} = useTranslation(['settings', 'jobs']);
  const [error, setError] = useState<string>();
  const [renaming, setRenaming] = useState(false);
  const [label, setLabel] = useState(session.label ?? '');
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const platform = t(`sessions.platforms.${session.platform}`);
  const statusLabel = t(`sessions.status.${session.status}`);
  const job = session.activeJob;
  const needsLogin = session.status === 'missing' || session.status === 'expired' || session.status === 'challenged';
  const failed = !job && lastJob?.status === 'failed' && (!session.lastCheckedAt || Date.parse(lastJob.finishedAt ?? '') > Date.parse(session.lastCheckedAt))
    ? lastJob
    : undefined;

  const start = async (action: 'login' | 'check') => {
    setError(undefined);
    const result = await sendJson('POST', `/api/sessions/${session.platform}/${action}`, {});
    if (!result.ok) setError(result.message);
    onChanged();
  };

  return (
    <Card data-testid={`session-${session.platform}`}>
      <VStack gap={3}>
        <HStack gap={3} vAlign="center" wrap="wrap">
          <StackItem size="fill">
            <VStack gap={0.5}>
              <HStack gap={2} vAlign="center">
                <Heading level={3}>{platform}</Heading>
                <StatusDot variant={SESSION_VARIANT[session.status]} label={statusLabel} isPulsing={Boolean(job)} />
                <Text type="label">{statusLabel}</Text>
              </HStack>
              {session.label ? (
                <Text type="supporting" color="secondary">
                  {session.label}
                </Text>
              ) : null}
            </VStack>
          </StackItem>
          {!job ? (
            <HStack gap={2} vAlign="center">
              <Button
                label={needsLogin ? t('sessions.login') : t('sessions.check')}
                variant="secondary"
                clickAction={() => start(needsLogin ? 'login' : 'check')}
              />
              <DropdownMenu
                renderTrigger={props => (
                  <Button {...props} label={t('sessions.moreActions')} variant="ghost" icon={<Icon icon={EllipsisHorizontalIcon} />} />
                )}
                hasChevron={false}
                items={[
                  ...(needsLogin
                    ? session.hasProfile
                      ? [{label: t('sessions.check'), onClick: () => void start('check')}]
                      : []
                    : [{label: t('sessions.loginAgain'), onClick: () => void start('login')}]),
                  {label: t('sessions.label'), onClick: () => setRenaming(true)},
                  ...(session.hasProfile ? [{label: t('sessions.disconnect'), onClick: () => setConfirmDisconnect(true)}] : []),
                ]}
              />
            </HStack>
          ) : null}
        </HStack>

        {job ? (
          <JobProgress job={job} />
        ) : (
          <Text type="supporting" color="secondary">
            {t(`sessions.statusHelp.${session.status}`)}
          </Text>
        )}

        <HStack gap={4} wrap="wrap">
          <Text type="supporting" color="secondary">
            {session.lastCheckedAt ? t('sessions.lastChecked', {time: formatRelative(session.lastCheckedAt)}) : t('sessions.neverChecked')}
          </Text>
          {session.expiresAt && session.status === 'valid' ? (
            <Text type="supporting" color="secondary">
              {t('sessions.expires', {time: formatDateTime(session.expiresAt)})}
            </Text>
          ) : null}
        </HStack>

        {session.message && !job ? <Banner status="warning" title={session.message} collapsible={false} /> : null}
        {failed?.error ? <Banner status="error" title={failed.error} collapsible={false} /> : null}
        {error ? <Banner status="error" title={error} collapsible={false} /> : null}
        {session.platform === 'facebook' ? (
          <Text type="supporting" color="secondary">
            {t('sessions.facebookNote')}
          </Text>
        ) : null}
      </VStack>

      <Dialog isOpen={renaming} onOpenChange={setRenaming} purpose="form">
        <DialogHeader title={t('sessions.label')} onOpenChange={setRenaming} />
        <VStack gap={4} padding={4}>
          <TextInput label={t('sessions.label')} description={t('sessions.labelDescription')} value={label} onChange={setLabel} />
          <HStack gap={2} hAlign="end">
            <Button label={t('sessions.cancel')} variant="ghost" onClick={() => setRenaming(false)} />
            <Button
              label={t('sessions.labelSave')}
              variant="primary"
              clickAction={async () => {
                const result = await sendJson('PATCH', `/api/sessions/${session.platform}`, {label: label.trim() || null});
                if (!result.ok) setError(result.message);
                setRenaming(false);
                onChanged();
              }}
            />
          </HStack>
        </VStack>
      </Dialog>

      <Dialog isOpen={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <DialogHeader title={t('sessions.disconnectTitle', {platform})} onOpenChange={setConfirmDisconnect} />
        <VStack gap={4} padding={4}>
          <Text as="p">{t('sessions.disconnectBody')}</Text>
          <HStack gap={2} hAlign="end">
            <Button label={t('sessions.cancel')} variant="ghost" onClick={() => setConfirmDisconnect(false)} />
            <Button
              label={t('sessions.disconnectConfirm')}
              variant="destructive"
              clickAction={async () => {
                const result = await sendJson('DELETE', `/api/sessions/${session.platform}`);
                if (!result.ok) setError(result.message);
                setConfirmDisconnect(false);
                onChanged();
              }}
            />
          </HStack>
        </VStack>
      </Dialog>
    </Card>
  );
}

// ── Collection limits ────────────────────────────────────────────────────────
type Limits = Settings['collection'];
const LIMIT_FIELDS: {key: keyof Limits; min: number; max: number; step?: number; hasDescription?: boolean}[] = [
  {key: 'maxItemsPerRun', min: 5, max: 500, hasDescription: true},
  {key: 'maxItemsPerDay', min: 20, max: 10_000, hasDescription: true},
  {key: 'maxRequestsPerHour', min: 10, max: 2_000, hasDescription: true},
  {key: 'reuseWithinHours', min: 0, max: 720, hasDescription: true},
  {key: 'minDelayMs', min: 800, max: 30_000, step: 100},
  {key: 'maxDelayMs', min: 1_000, max: 60_000, step: 100},
  {key: 'maxScrolls', min: 1, max: 40},
];

function LimitsSection({limits, onSaved}: {limits: Limits; onSaved: () => void}) {
  const {t} = useTranslation('settings');
  const [draft, setDraft] = useState<Limits>(limits);
  const [issues, setIssues] = useState<FieldIssue[]>([]);
  const [saved, setSaved] = useState(false);
  useEffect(() => setDraft(limits), [limits]);
  const isDirty = LIMIT_FIELDS.some(f => draft[f.key] !== limits[f.key]);

  return (
    <Section
      title={t('limits.title')}
      description={
        <>
          {t('limits.description')} {t('limits.summary', {items: formatNumber(limits.maxItemsPerRun), perDay: formatNumber(limits.maxItemsPerDay)})}
        </>
      }
    >
      <Collapsible trigger={<Text weight="semibold">{t('limits.advanced')}</Text>} defaultIsOpen={false}>
        <VStack gap={4} paddingBlockStart={3}>
          <Grid columns={{minWidth: 240}} gap={4}>
            {LIMIT_FIELDS.map(field => {
              const message = issueAt(issues, field.key);
              return (
                <NumberInput
                  key={field.key}
                  label={t(`limits.${field.key}`)}
                  description={field.hasDescription ? t(`limits.${field.key}Description` as 'limits.maxItemsPerRunDescription') : undefined}
                  value={draft[field.key]}
                  min={field.min}
                  max={field.max}
                  step={field.step ?? 1}
                  isWheelEnabled={false}
                  onChange={value => {
                    setSaved(false);
                    setDraft(d => ({...d, [field.key]: value}));
                  }}
                  status={message ? {type: 'error', message} : undefined}
                  statusVariant="detached"
                />
              );
            })}
          </Grid>
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Button
              label={t('limits.save')}
              variant="secondary"
              isDisabled={!isDirty}
              clickAction={async () => {
                const result = await sendJson<Settings>('PUT', '/api/settings/collection', draft);
                setIssues(result.ok ? [] : result.issues);
                setSaved(result.ok);
                if (result.ok) onSaved();
              }}
            />
            <Button
              label={t('limits.reset')}
              variant="ghost"
              clickAction={async () => {
                const result = await sendJson<Settings>('POST', '/api/settings/collection/reset');
                if (result.ok) {
                  setIssues([]);
                  setDraft(result.data.collection);
                  onSaved();
                }
              }}
            />
            {saved ? (
              <Text type="supporting" color="secondary" role="status">
                {t('limits.saved')}
              </Text>
            ) : null}
          </HStack>
        </VStack>
      </Collapsible>
    </Section>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
/** Settings (§4.6): platform sessions, collection limits, digits and currency, the bridge status, appearance. */
export function SettingsPage() {
  const {t} = useTranslation(['settings', 'common', 'jobs', 'business']);
  const {mode, setMode} = useColorMode();
  const jobText = useJobText();
  const sessions = useResource<SessionView[]>('/api/sessions');
  const jobs = useResource<JobView[]>('/api/jobs?limit=15');
  const settings = useResource<Settings>('/api/settings');
  const bridge = useResource<BridgeStatus>('/api/bridge');
  const health = useResource<{dataDir: string}>('/api/health');

  useEventStream(event => {
    if (event.type === 'job.updated' || event.type === 'session.updated') {
      sessions.reload();
      jobs.reload();
    }
    if (event.type === 'settings.updated') settings.reload();
  });

  const lastJobByLane = useMemo(() => {
    const map = new Map<string, JobView>();
    for (const job of jobs.data ?? []) if (!map.has(job.lane) && job.type.startsWith('session.')) map.set(job.lane, job);
    return map;
  }, [jobs.data]);

  const saveLocale = async (patch: Partial<Settings['locale']>) => {
    await sendJson('PUT', '/api/settings/locale', patch);
    settings.reload();
  };

  const jobColumns: TableColumn<JobView & Record<string, unknown>>[] = [
    {key: 'type', header: t('settings:jobs.columns.task'), renderCell: job => jobText(job)},
    {
      key: 'status',
      header: t('settings:jobs.columns.status'),
      renderCell: job => (
        <VStack gap={0.5}>
          <Text type="label">{t(`jobs:status.${job.status}`)}</Text>
          {job.status === 'failed' && job.error ? (
            <Text type="supporting" color="secondary">
              {job.error}
            </Text>
          ) : null}
          {job.status === 'succeeded' && typeof job.result?.status === 'string' ? (
            <Text type="supporting" color="secondary">
              {t(`jobs:results.${job.result.status}` as 'jobs:results.valid', {defaultValue: ''})}
            </Text>
          ) : null}
        </VStack>
      ),
    },
    {
      key: 'createdAt',
      header: t('settings:jobs.columns.when'),
      align: 'end',
      renderCell: job => (
        <Text type="supporting" color="secondary">
          {formatRelative(job.createdAt)}
        </Text>
      ),
    },
  ];

  return (
    <PageFrame title={t('settings:title')} contentWidth={960}>
      <VStack gap={8}>
        <Section title={t('settings:sessions.title')} description={t('settings:sessions.description')}>
          <Banner status="warning" title={t('settings:sessions.warningTitle')} description={t('settings:sessions.warningBody')} collapsible={false} />
          {sessions.data ? (
            sessions.data.map(session => (
              <SessionCard key={session.platform} session={session} lastJob={lastJobByLane.get(session.platform)} onChanged={sessions.reload} />
            ))
          ) : (
            <VStack gap={3}>
              <Skeleton height={120} index={0} />
              <Skeleton height={120} index={1} />
            </VStack>
          )}
        </Section>
        <Divider />

        {settings.data ? <LimitsSection limits={settings.data.collection} onSaved={settings.reload} /> : <Skeleton height={80} index={0} />}
        <Divider />

        <Section title={t('settings:locale.title')} description={t('settings:locale.description')}>
          {settings.data ? (
            <Grid columns={{minWidth: 220}} gap={4}>
              <Selector
                label={t('settings:locale.language')}
                description={t('settings:locale.languageNote')}
                value={settings.data.locale.language}
                onChange={() => undefined}
                options={[{value: 'ar', label: t('settings:locale.languages.ar')}]}
                isDisabled
              />
              <VStack gap={2}>
                <Text type="label">{t('settings:locale.digits')}</Text>
                <HStack>
                  <SegmentedControl
                    label={t('settings:locale.digits')}
                    value={settings.data.locale.digits}
                    onChange={value => void saveLocale({digits: value as 'latn' | 'arab'})}
                  >
                    <SegmentedControlItem value="latn" label={t('settings:locale.digitsOptions.latn')} />
                    <SegmentedControlItem value="arab" label={t('settings:locale.digitsOptions.arab')} />
                  </SegmentedControl>
                </HStack>
              </VStack>
              <Selector
                label={t('settings:locale.currency')}
                value={settings.data.locale.currency}
                onChange={value => void saveLocale({currency: value as (typeof CURRENCIES)[number]})}
                options={CURRENCIES.map(c => ({value: c, label: t(`business:currencies.${c}`)}))}
              />
            </Grid>
          ) : (
            <Skeleton height={64} index={0} />
          )}
        </Section>
        <Divider />

        <Section title={t('settings:bridge.title')} description={t('settings:bridge.description')}>
          {bridge.data ? (
            <Card variant="muted">
              <VStack gap={3}>
                <BridgeRow label={t('settings:bridge.cli')} ok={Boolean(bridge.data.cli)}>
                  {bridge.data.cli
                    ? t('settings:bridge.cliSeen', {time: formatRelative(bridge.data.cli.lastSeenAt), command: isolateLtr(bridge.data.cli.command)})
                    : t('settings:bridge.cliNever')}
                </BridgeRow>
                <BridgeRow label={t('settings:bridge.command')} ok={bridge.data.analyzeCommand}>
                  {bridge.data.analyzeCommand ? <Ltr>/rasd-analyze</Ltr> : t('settings:bridge.commandMissing')}
                </BridgeRow>
                <BridgeRow label={t('settings:bridge.playbooks')} ok={bridge.data.playbooks > 0}>
                  {t('settings:bridge.playbooksCount', {count: bridge.data.playbooks})}
                </BridgeRow>
                <BridgeRow label={t('settings:bridge.mcp')} ok={bridge.data.mcp.available}>
                  {t('settings:bridge.mcpLater')}
                </BridgeRow>
              </VStack>
            </Card>
          ) : (
            <Skeleton height={120} index={0} />
          )}
        </Section>
        <Divider />

        <Section title={t('settings:jobs.title')} description={t('settings:jobs.description')}>
          {jobs.data?.length ? (
            <Table<JobView & Record<string, unknown>> data={jobs.data as (JobView & Record<string, unknown>)[]} columns={jobColumns} idKey="id" />
          ) : (
            <Text type="supporting" color="secondary">
              {t('settings:jobs.empty')}
            </Text>
          )}
        </Section>
        <Divider />

        <Section title={t('settings:appearance.title')} description={t('settings:appearance.description')}>
          <SegmentedControl label={t('common:theme.label')} value={mode} onChange={value => setMode(value as ColorMode)}>
            {MODES.map(m => (
              <SegmentedControlItem key={m} value={m} label={t(`common:theme.${m}`)} />
            ))}
          </SegmentedControl>
        </Section>
        <Divider />

        <Section title={t('settings:local.title')} description={t('settings:local.description')}>
          {health.data ? (
            <Text type="supporting">
              <Ltr>{health.data.dataDir}</Ltr>
            </Text>
          ) : null}
        </Section>
      </VStack>
    </PageFrame>
  );
}

function BridgeRow({label, ok, children}: {label: string; ok: boolean; children: ReactNode}) {
  return (
    <HStack gap={3} vAlign="start">
      <StatusDot variant={ok ? 'success' : 'neutral'} label={label} />
      <VStack gap={0.5}>
        <Text type="label">{label}</Text>
        <Text type="supporting" color="secondary">
          {children}
        </Text>
      </VStack>
    </HStack>
  );
}
