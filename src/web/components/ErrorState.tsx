import {Button} from '@astryxdesign/core/Button';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Icon} from '@astryxdesign/core/Icon';
import {ExclamationTriangleIcon} from '@heroicons/react/24/outline';
import {useTranslation} from 'react-i18next';
import type {ApiError} from '../lib/api';

/** A load error with a clear Arabic message and a retry button — no blank white screen and no technical message. */
export function ErrorState({error, onRetry}: {error: ApiError; onRetry: () => void}) {
  const {t} = useTranslation();
  return (
    <EmptyState
      headingLevel={2}
      icon={<Icon icon={ExclamationTriangleIcon} size="lg" color="warning" />}
      title={error.kind === 'network' ? t('errors.network') : t('errors.generic')}
      actions={<Button label={t('retry')} onClick={onRetry} />}
    />
  );
}
