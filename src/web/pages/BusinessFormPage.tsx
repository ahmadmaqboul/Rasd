import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Collapsible} from '@astryxdesign/core/Collapsible';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {Divider} from '@astryxdesign/core/Divider';
import {Grid} from '@astryxdesign/core/Grid';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack} from '@astryxdesign/core/HStack';
import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {Selector} from '@astryxdesign/core/Selector';
import {Skeleton} from '@astryxdesign/core/Skeleton';
import {StackItem} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {TextArea} from '@astryxdesign/core/TextArea';
import {TextInput} from '@astryxdesign/core/TextInput';
import {VStack} from '@astryxdesign/core/VStack';
import {PlusIcon, TrashIcon, XMarkIcon} from '@heroicons/react/24/outline';
import {useEffect, useRef, useState, type ReactNode} from 'react';
import {useTranslation} from 'react-i18next';
import {useNavigate, useParams} from 'react-router';
import {ErrorState} from '../components/ErrorState';
import {PageFrame} from '../components/PageFrame';
import {issueAt, sendJson, useResource, type FieldIssue, type ProfileView} from '../lib/api';
import {formatNumber} from '../lib/locale';

const CURRENCIES = ['ILS', 'JOD', 'USD', 'EUR'] as const;
type Currency = (typeof CURRENCIES)[number];
/** Symbols are not words, so they need no translation. */
const CURRENCY_SYMBOL: Record<Currency, string> = {ILS: '₪', JOD: 'JD', USD: '$', EUR: '€'};

interface ProductDraft {
  key: number;
  id?: number;
  name: string;
  ourPrice: number | null;
  cost: number | null;
}

interface AccountDraft {
  key: number;
  value: string;
}

interface Draft {
  name: string;
  category: string;
  region: string;
  currency: Currency;
  audienceNotes: string;
  products: ProductDraft[];
  accounts: AccountDraft[];
  competitors: AccountDraft[];
}

let nextKey = 1;
const key = () => nextKey++;

const emptyDraft = (): Draft => ({
  name: '',
  category: '',
  region: '',
  currency: 'ILS',
  audienceNotes: '',
  products: [],
  accounts: [{key: key(), value: ''}],
  competitors: [],
});

const accountText = (a: {platform: string; handle: string; url: string}) => (a.platform === 'web' ? a.url : `@${a.handle}`);

function draftFrom(profile: ProfileView): Draft {
  return {
    name: profile.name,
    category: profile.category ?? '',
    region: profile.region ?? '',
    currency: profile.currency,
    audienceNotes: profile.audienceNotes ?? '',
    products: profile.products.map(p => ({key: key(), id: p.id, name: p.name, ourPrice: p.ourPrice, cost: p.cost})),
    accounts: profile.accounts.length
      ? profile.accounts.map(a => ({key: key(), value: a.platform === 'instagram' ? `@${a.handle}` : a.url}))
      : [{key: key(), value: ''}],
    competitors: profile.competitors.map(a => ({key: key(), value: a.platform === 'instagram' ? `@${a.handle}` : accountText(a)})),
  };
}

/** What the API expects. Empty rows are dropped so the user is never blocked by a blank line. */
function toInput(draft: Draft) {
  const accounts = draft.accounts.map(a => a.value.trim());
  const competitors = draft.competitors.map(a => a.value.trim());
  return {
    input: {
      name: draft.name,
      category: draft.category,
      region: draft.region,
      currency: draft.currency,
      audienceNotes: draft.audienceNotes,
      products: draft.products
        .filter(p => p.name.trim() || p.ourPrice !== null)
        .map(p => ({...(p.id ? {id: p.id} : {}), name: p.name, ourPrice: p.ourPrice, cost: p.cost})),
      accounts: accounts.filter(Boolean),
      competitors: competitors.filter(Boolean),
    },
    // Maps an index in the sent list back to the row the user sees, so field errors land on the right row.
    rowOf: {
      accounts: draft.accounts.filter(a => a.value.trim()).map(a => a.key),
      competitors: draft.competitors.filter(a => a.value.trim()).map(a => a.key),
      products: draft.products.filter(p => p.name.trim() || p.ourPrice !== null).map(p => p.key),
    },
  };
}

type RowMap = ReturnType<typeof toInput>['rowOf'];

/** The error for one row of a list, by its key. */
function rowIssue(issues: FieldIssue[], rowOf: RowMap | undefined, list: keyof RowMap, rowKey: number, ...rest: string[]) {
  const index = rowOf?.[list].indexOf(rowKey) ?? -1;
  return index === -1 ? undefined : issueAt(issues, list, index, ...rest);
}

function Section({title, description, children}: {title: string; description: string; children: ReactNode}) {
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

const errorStatus = (message: string | undefined) => (message ? {type: 'error' as const, message} : undefined);

interface AccountListProps {
  rows: AccountDraft[];
  onChange: (rows: AccountDraft[]) => void;
  label: (n: number) => string;
  removeLabel: (n: number) => string;
  addLabel: string;
  placeholder: string;
  errorFor: (rowKey: number) => string | undefined;
}

function AccountList({rows, onChange, label, removeLabel, addLabel, placeholder, errorFor}: AccountListProps) {
  return (
    <VStack gap={2}>
      {rows.map((row, i) => (
        <HStack key={row.key} gap={2} vAlign="end">
          <StackItem size="fill">
            <TextInput
              label={label(i + 1)}
              isLabelHidden={rows.length === 1}
              value={row.value}
              placeholder={placeholder}
              dir="auto"
              onChange={value => onChange(rows.map(r => (r.key === row.key ? {...r, value} : r)))}
              status={errorStatus(errorFor(row.key))}
              statusVariant="detached"
            />
          </StackItem>
          <IconButton
            label={removeLabel(i + 1)}
            tooltip={removeLabel(i + 1)}
            icon={<Icon icon={XMarkIcon} />}
            variant="ghost"
            onClick={() => onChange(rows.filter(r => r.key !== row.key))}
          />
        </HStack>
      ))}
      <HStack>
        <Button label={addLabel} variant="ghost" size="sm" icon={<Icon icon={PlusIcon} />} onClick={() => onChange([...rows, {key: key(), value: ''}])} />
      </HStack>
    </VStack>
  );
}

/** Create or edit a business profile. Only the name is required; everything optional sits behind "خيارات متقدمة". */
export function BusinessFormPage() {
  const {t} = useTranslation('business');
  const navigate = useNavigate();
  const {id} = useParams();
  const isNew = id === undefined;
  const existing = useResource<ProfileView>(isNew ? null : `/api/profiles/${id}`);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [issues, setIssues] = useState<FieldIssue[]>([]);
  const [rowOf, setRowOf] = useState<RowMap>();
  const [formError, setFormError] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const loadedId = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!isNew && existing.data && loadedId.current !== existing.data.id) {
      loadedId.current = existing.data.id;
      setDraft(draftFrom(existing.data));
    }
  }, [isNew, existing.data]);

  const set = <K extends keyof Draft>(field: K, value: Draft[K]) => setDraft(d => ({...d, [field]: value}));

  const save = async () => {
    const {input, rowOf: map} = toInput(draft);
    setIsSaving(true);
    const result = isNew
      ? await sendJson<ProfileView>('POST', '/api/profiles', input)
      : await sendJson<ProfileView>('PUT', `/api/profiles/${id}`, input);
    setIsSaving(false);
    if (result.ok) {
      void navigate('/business');
      return;
    }
    setRowOf(map);
    setIssues(result.issues);
    setFormError(result.issues.length ? t('form.errors.summary') : result.message || t('form.errors.summary'));
  };

  const remove = async () => {
    const result = await sendJson('DELETE', `/api/profiles/${id}`);
    setConfirmDelete(false);
    if (result.ok) void navigate('/business');
    else setFormError(result.message);
  };

  if (!isNew && existing.error) {
    return (
      <PageFrame title={t('title')} contentWidth={880}>
        {existing.error.kind === 'not_found' ? <Banner status="warning" title={t('form.notFound')} /> : <ErrorState error={existing.error} onRetry={existing.reload} />}
      </PageFrame>
    );
  }
  if (!isNew && !existing.data) {
    return (
      <PageFrame title={t('title')} contentWidth={880}>
        <VStack gap={3}>
          {[0, 1, 2].map(i => (
            <Skeleton key={i} height={56} index={i} />
          ))}
        </VStack>
      </PageFrame>
    );
  }

  const advancedHasErrors = issues.some(i => ['category', 'region', 'currency', 'audienceNotes', 'competitors'].includes(String(i.path[0])) || i.path[2] === 'cost');

  return (
    <PageFrame
      title={isNew ? t('form.newTitle') : existing.data!.name}
      subtitle={isNew ? t('form.newSubtitle') : t('form.editSubtitle')}
      contentWidth={880}
      action={<Button label={isNew ? t('form.create') : t('form.save')} variant="primary" isLoading={isSaving} onClick={() => void save()} />}
    >
      <VStack gap={6}>
        {formError ? <Banner status="error" title={formError} collapsible={false} /> : null}

        <Section title={t('form.basics.title')} description={t('form.basics.description')}>
          <TextInput
            label={t('form.name')}
            placeholder={t('form.namePlaceholder')}
            value={draft.name}
            onChange={value => set('name', value)}
            isRequired
            status={errorStatus(issueAt(issues, 'name'))}
            statusVariant="detached"
          />
        </Section>
        <Divider />

        <Section title={t('form.accounts.title')} description={t('form.accounts.description')}>
          <AccountList
            rows={draft.accounts}
            onChange={rows => set('accounts', rows)}
            label={n => t('form.accounts.label', {n: formatNumber(n)})}
            removeLabel={n => t('form.accounts.remove', {n: formatNumber(n)})}
            addLabel={t('form.accounts.add')}
            placeholder={t('form.accountPlaceholder')}
            errorFor={rowKey => rowIssue(issues, rowOf, 'accounts', rowKey)}
          />
        </Section>
        <Divider />

        <Section title={t('form.products.title')} description={t('form.products.description')}>
          {draft.products.length === 0 ? (
            <Text type="supporting" color="secondary">
              {t('form.products.empty')}
            </Text>
          ) : null}
          {draft.products.map((product, i) => (
            <HStack key={product.key} gap={2} vAlign="end">
              <StackItem size="fill">
                <TextInput
                  label={t('form.products.name', {n: formatNumber(i + 1)})}
                  placeholder={t('form.products.namePlaceholder')}
                  value={product.name}
                  onChange={name => set('products', draft.products.map(p => (p.key === product.key ? {...p, name} : p)))}
                  status={errorStatus(rowIssue(issues, rowOf, 'products', product.key, 'name'))}
                  statusVariant="detached"
                />
              </StackItem>
              <NumberInput
                label={t('form.products.price')}
                units={CURRENCY_SYMBOL[draft.currency]}
                width={130}
                value={product.ourPrice}
                min={0}
                step={1}
                isWheelEnabled={false}
                onChange={ourPrice =>
                  set('products', draft.products.map(p => (p.key === product.key ? {...p, ourPrice: Number.isFinite(ourPrice) ? ourPrice : null} : p)))
                }
                status={errorStatus(rowIssue(issues, rowOf, 'products', product.key, 'ourPrice'))}
                statusVariant="detached"
              />
              <IconButton
                label={t('form.products.remove', {n: formatNumber(i + 1)})}
                tooltip={t('form.products.remove', {n: formatNumber(i + 1)})}
                icon={<Icon icon={XMarkIcon} />}
                variant="ghost"
                onClick={() => set('products', draft.products.filter(p => p.key !== product.key))}
              />
            </HStack>
          ))}
          <HStack>
            <Button
              label={t('form.products.add')}
              variant="ghost"
              size="sm"
              icon={<Icon icon={PlusIcon} />}
              onClick={() => set('products', [...draft.products, {key: key(), name: '', ourPrice: null, cost: null}])}
            />
          </HStack>
        </Section>
        <Divider />

        <Collapsible trigger={<Text weight="semibold">{t('form.advanced')}</Text>} defaultIsOpen={advancedHasErrors} key={advancedHasErrors ? 'open' : 'closed'}>
          <VStack gap={6} paddingBlockStart={4}>
            <Grid columns={{minWidth: 240}} gap={4}>
              <TextInput
                label={t('form.category')}
                placeholder={t('form.categoryPlaceholder')}
                value={draft.category}
                onChange={value => set('category', value)}
                status={errorStatus(issueAt(issues, 'category'))}
                statusVariant="detached"
              />
              <TextInput
                label={t('form.region')}
                placeholder={t('form.regionPlaceholder')}
                value={draft.region}
                onChange={value => set('region', value)}
                status={errorStatus(issueAt(issues, 'region'))}
                statusVariant="detached"
              />
              <Selector
                label={t('form.currency')}
                value={draft.currency}
                onChange={value => set('currency', value as Currency)}
                options={CURRENCIES.map(c => ({value: c, label: t(`currencies.${c}`)}))}
              />
            </Grid>
            <TextArea
              label={t('form.audienceNotes')}
              description={t('form.audienceNotesDescription')}
              value={draft.audienceNotes}
              onChange={value => set('audienceNotes', value)}
              maxLength={2000}
            />

            {draft.products.some(p => p.name.trim()) ? (
              <VStack gap={3}>
                <VStack gap={1}>
                  <Heading level={3}>{t('form.costs')}</Heading>
                  <Text type="supporting" color="secondary">
                    {t('form.costsDescription')}
                  </Text>
                </VStack>
                <Grid columns={{minWidth: 220}} gap={3}>
                  {draft.products
                    .filter(p => p.name.trim())
                    .map(product => (
                      <NumberInput
                        key={product.key}
                        label={product.name}
                        description={t('form.products.cost')}
                        units={CURRENCY_SYMBOL[draft.currency]}
                        value={product.cost}
                        min={0}
                        isWheelEnabled={false}
                        onChange={cost =>
                          set('products', draft.products.map(p => (p.key === product.key ? {...p, cost: Number.isFinite(cost) ? cost : null} : p)))
                        }
                        status={errorStatus(rowIssue(issues, rowOf, 'products', product.key, 'cost'))}
                        statusVariant="detached"
                      />
                    ))}
                </Grid>
              </VStack>
            ) : null}

            <VStack gap={3}>
              <VStack gap={1}>
                <Heading level={3}>{t('form.competitors.title')}</Heading>
                <Text type="supporting" color="secondary">
                  {t('form.competitors.description')}
                </Text>
              </VStack>
              <AccountList
                rows={draft.competitors}
                onChange={rows => set('competitors', rows)}
                label={n => t('form.competitors.label', {n: formatNumber(n)})}
                removeLabel={n => t('form.competitors.remove', {n: formatNumber(n)})}
                addLabel={t('form.competitors.add')}
                placeholder={t('form.accountPlaceholder')}
                errorFor={rowKey => rowIssue(issues, rowOf, 'competitors', rowKey)}
              />
            </VStack>
          </VStack>
        </Collapsible>

        {!isNew ? (
          <>
            <Divider />
            <HStack>
              <Button label={t('form.delete.action')} variant="ghost" icon={<Icon icon={TrashIcon} />} onClick={() => setConfirmDelete(true)} />
            </HStack>
          </>
        ) : null}
      </VStack>

      <Dialog isOpen={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogHeader title={t('form.delete.title', {name: existing.data?.name ?? ''})} onOpenChange={setConfirmDelete} />
        <VStack gap={4} padding={4}>
          <Text as="p">{t('form.delete.body')}</Text>
          <HStack gap={2} hAlign="end">
            <Button label={t('form.delete.cancel')} variant="ghost" onClick={() => setConfirmDelete(false)} />
            <Button label={t('form.delete.confirm')} variant="destructive" clickAction={remove} />
          </HStack>
        </VStack>
      </Dialog>
    </PageFrame>
  );
}
