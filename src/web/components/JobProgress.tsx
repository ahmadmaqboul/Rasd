import {Button} from '@astryxdesign/core/Button';
import {HStack} from '@astryxdesign/core/HStack';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {StackItem} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {useEffect, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {sendJson, type JobView} from '../lib/api';
import {formatNumber} from '../lib/locale';

/** Elapsed seconds since a timestamp, refreshed every second while the job runs. */
function useElapsed(since: string | null, isRunning: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isRunning]);
  return since ? Math.max(0, Math.round((now - Date.parse(since)) / 1000)) : 0;
}

export function useDuration() {
  const {t} = useTranslation('jobs');
  return (seconds: number) =>
    seconds < 60 ? t('time.seconds', {count: seconds}) : t('time.minutes', {count: Math.round(seconds / 60)});
}

interface JobProgressProps {
  job: JobView;
  /** Hide the cancel button (e.g. when the job is shown as history). */
  canCancel?: boolean;
}

/**
 * Live progress of one background job (§4 core flow): the current step, counts, elapsed and estimated time,
 * and a cancel button. The parent keeps `job` fresh from the event stream.
 */
export function JobProgress({job, canCancel = true}: JobProgressProps) {
  const {t} = useTranslation('jobs');
  const duration = useDuration();
  const isActive = job.status === 'queued' || job.status === 'running';
  const elapsed = useElapsed(job.startedAt, job.status === 'running');
  const [isCancelling, setIsCancelling] = useState(false);
  const {step, done, total, detail} = job.progress;
  const hasCount = typeof done === 'number' && typeof total === 'number' && total > 0;
  const remaining = hasCount && done > 0 && done < total ? Math.round((elapsed / done) * (total - done)) : null;

  const stepText = step && t(`steps.${step}` as 'steps.opening_browser', {defaultValue: ''});
  const label = job.status === 'queued' ? t('status.queued') : stepText || t('status.running');

  return (
    <VStack gap={2}>
      <HStack gap={3} vAlign="center">
        <StackItem size="fill">
          <ProgressBar
            label={label}
            value={hasCount ? done : 0}
            max={hasCount ? total : 100}
            isIndeterminate={!hasCount}
            variant="neutral"
          />
        </StackItem>
        {canCancel && isActive ? (
          <Button
            label={isCancelling || job.cancelRequested ? t('cancelling') : t('cancel')}
            size="sm"
            variant="secondary"
            isDisabled={isCancelling || job.cancelRequested}
            clickAction={async () => {
              setIsCancelling(true);
              await sendJson('POST', `/api/jobs/${job.id}/cancel`);
            }}
          />
        ) : null}
      </HStack>
      <HStack gap={3} wrap="wrap">
        {hasCount ? (
          <Text type="supporting" color="secondary" hasTabularNumbers>
            {t('progress', {done: formatNumber(done), total: formatNumber(total)})}
          </Text>
        ) : null}
        {detail ? (
          <Text type="supporting" color="secondary">
            {detail}
          </Text>
        ) : null}
        {job.status === 'running' && elapsed >= 3 ? (
          <Text type="supporting" color="secondary">
            {t('elapsed', {time: duration(elapsed)})}
          </Text>
        ) : null}
        {remaining !== null ? (
          <Text type="supporting" color="secondary">
            {t('remaining', {time: duration(remaining)})}
          </Text>
        ) : null}
      </HStack>
    </VStack>
  );
}
