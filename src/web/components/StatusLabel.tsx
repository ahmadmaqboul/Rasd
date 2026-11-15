import {HStack} from '@astryxdesign/core/HStack';
import {StatusDot, type StatusDotVariant} from '@astryxdesign/core/StatusDot';
import {Text} from '@astryxdesign/core/Text';
import {useTranslation} from 'react-i18next';
import type {StudyStatus} from '../../core/db/schema';

const VARIANT: Record<StudyStatus, StatusDotVariant> = {
  draft: 'neutral',
  collecting: 'accent',
  ready: 'accent',
  analyzing: 'accent',
  done: 'success',
  partial: 'warning',
  failed: 'error',
};

const IN_PROGRESS: ReadonlySet<StudyStatus> = new Set(['collecting', 'analyzing']);

/** Study status: a dot + text — status is not conveyed by color alone. */
export function StatusLabel({status}: {status: StudyStatus}) {
  const {t} = useTranslation();
  const label = t(`status.${status}`);
  return (
    <HStack gap={2} vAlign="center">
      <StatusDot variant={VARIANT[status]} label={label} isPulsing={IN_PROGRESS.has(status)} />
      <Text type="label">{label}</Text>
    </HStack>
  );
}
