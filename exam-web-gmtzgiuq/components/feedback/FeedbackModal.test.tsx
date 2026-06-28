import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'react-toastify';
import FeedbackModal from './FeedbackModal';
import { sendFeedback } from '@/lib/api/feedback';
import { trackEvent } from '@/lib/api/analytics';

jest.mock('@/lib/api/feedback');
jest.mock('@/lib/api/analytics');
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const mockedSendFeedback = sendFeedback as jest.MockedFunction<typeof sendFeedback>;
const mockedTrackEvent = trackEvent as jest.MockedFunction<typeof trackEvent>;

describe('FeedbackModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    const { container } = render(<FeedbackModal open={false} onClose={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('blocks submission and shows an error when the message is empty', async () => {
    const user = userEvent.setup();
    render(<FeedbackModal open={true} onClose={jest.fn()} />);

    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(toast.error).toHaveBeenCalled();
    expect(mockedSendFeedback).not.toHaveBeenCalled();
  });

  it('submits the trimmed message plus age/details, tracks the event, and closes on success', async () => {
    mockedSendFeedback.mockResolvedValue({ ok: true });
    const onClose = jest.fn();
    const user = userEvent.setup();
    render(<FeedbackModal open={true} onClose={onClose} examId="exam-42" />);

    const [messageBox, detailsBox] = screen.getAllByRole('textbox');
    await user.type(messageBox, '  อยากให้เพิ่มโจทย์ฟิสิกส์  ');
    await user.type(detailsBox, 'ขอบคุณครับ');
    await user.selectOptions(screen.getByRole('combobox'), '15');

    await user.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());

    expect(mockedSendFeedback).toHaveBeenCalledWith({
      examId: 'exam-42',
      age: 15,
      message: 'อยากให้เพิ่มโจทย์ฟิสิกส์',
      details: 'ขอบคุณครับ',
    });
    expect(mockedTrackEvent).toHaveBeenCalledWith('feedback_submit', {
      hasDetails: true,
      age: 15,
      examId: 'exam-42',
    });
    expect(toast.success).toHaveBeenCalled();
  });

  it('shows the server error message and keeps the modal open when submission fails', async () => {
    mockedSendFeedback.mockRejectedValue(new Error('เกิดข้อผิดพลาด'));
    const onClose = jest.fn();
    const user = userEvent.setup();
    render(<FeedbackModal open={true} onClose={onClose} />);

    const [messageBox] = screen.getAllByRole('textbox');
    await user.type(messageBox, 'ทดสอบ');
    await user.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('เกิดข้อผิดพลาด'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
