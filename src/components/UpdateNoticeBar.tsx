import type { JSX } from 'preact';
import type { UpdateNotice, UpdateNoticeState } from '../state/updateNotice';
import { useSignalValue } from './useSignalValue';

interface UpdateNoticeBarProps {
  notice: UpdateNoticeState;
}

export const UPDATE_LOSES_WORK_QUESTION =
  'This browser is not keeping your drawing, so updating now closes it. Update anyway? ' +
  'Use Save PNG first to keep it.';

const MESSAGES: Record<Exclude<UpdateNotice['kind'], 'none'>, string> = {
  countdown: 'A new version of Mini Painter is ready.',
  'on-close':
    'A new version of Mini Painter is available. It installs when you close this drawing.',
  download: 'A new version of Mini Painter is available.',
};

/**
 * Tells the user about an automatic update: a countdown on the empty page, or
 * a bar on top while a drawing is open. Either way they can update now or later.
 */
export function UpdateNoticeBar({ notice }: UpdateNoticeBarProps): JSX.Element | null {
  const current = useSignalValue(notice.notice);
  if (current.kind === 'none') {
    return null;
  }
  const atRisk = current.kind === 'on-close' && current.workAtRisk;
  return (
    <div
      class={current.kind === 'countdown' ? 'update-notice update-notice--center' : 'update-notice'}
    >
      <p class="update-notice__text" role="status">
        {MESSAGES[current.kind]}
      </p>
      {/* Outside the live region: screen readers would read out every second. */}
      {current.kind === 'countdown' && (
        <p class="update-notice__text">Updating in {current.secondsLeft} s…</p>
      )}
      <div class="toolbar">
        <button
          type="button"
          class="button button--small"
          onClick={() => {
            if (!atRisk || window.confirm(UPDATE_LOSES_WORK_QUESTION)) {
              notice.applyNow();
            }
          }}
        >
          {current.kind === 'download' ? 'Download' : 'Update now'}
        </button>
        <button type="button" class="button button--small" onClick={notice.postpone}>
          Later
        </button>
      </div>
    </div>
  );
}
