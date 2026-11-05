import { signal } from '@preact/signals-core';
import { fireEvent, render, screen } from '@testing-library/preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UpdateNotice, UpdateNoticeState } from '../state/updateNotice';
import { UPDATE_LOSES_WORK_QUESTION, UpdateNoticeBar } from './UpdateNoticeBar';

function fakeNotice(initial: UpdateNotice) {
  return {
    notice: signal<UpdateNotice>(initial),
    applyNow: vi.fn(),
    postpone: vi.fn(),
    dispose: vi.fn(),
  } satisfies UpdateNoticeState;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('UpdateNoticeBar', () => {
  it('shows nothing without an update', () => {
    render(<UpdateNoticeBar notice={fakeNotice({ kind: 'none' })} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('counts down on the empty page', async () => {
    const notice = fakeNotice({ kind: 'countdown', secondsLeft: 5 });
    render(<UpdateNoticeBar notice={notice} />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Updating in 5 s');
    expect(status).toHaveClass('update-notice--center');
    await act(() => {
      notice.notice.value = { kind: 'countdown', secondsLeft: 4 };
    });
    expect(status).toHaveTextContent('Updating in 4 s');
  });

  it('says the update waits for the drawing to close, in a bar on top', () => {
    render(<UpdateNoticeBar notice={fakeNotice({ kind: 'on-close', workAtRisk: false })} />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('installs when you close this drawing');
    expect(status).not.toHaveClass('update-notice--center');
  });

  it('updates now or later', () => {
    const notice = fakeNotice({ kind: 'on-close', workAtRisk: false });
    render(<UpdateNoticeBar notice={notice} />);
    fireEvent.click(screen.getByRole('button', { name: 'Update now' }));
    expect(notice.applyNow).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(notice.postpone).toHaveBeenCalledOnce();
  });

  it('asks before an update that would lose the drawing', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const notice = fakeNotice({ kind: 'on-close', workAtRisk: true });
    render(<UpdateNoticeBar notice={notice} />);
    fireEvent.click(screen.getByRole('button', { name: 'Update now' }));
    expect(confirm).toHaveBeenCalledWith(UPDATE_LOSES_WORK_QUESTION);
    expect(notice.applyNow).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Update now' }));
    expect(notice.applyNow).toHaveBeenCalledOnce();
  });

  it('offers the download in the offline copy', () => {
    const notice = fakeNotice({ kind: 'download' });
    render(<UpdateNoticeBar notice={notice} />);
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(notice.applyNow).toHaveBeenCalledOnce();
  });
});
