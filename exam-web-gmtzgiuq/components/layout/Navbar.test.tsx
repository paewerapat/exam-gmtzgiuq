import { render, screen } from '@testing-library/react';
import Navbar from './Navbar';

let mockPath = '/';
jest.mock('next/navigation', () => ({ usePathname: () => mockPath }));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null, loading: false, logout: jest.fn() }) }));
jest.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'light', toggleTheme: jest.fn() }) }));

describe('Navbar', () => {
  it.each(['/dashboard', '/dashboard/mock-exams/1', '/admin/pro', '/upgrade', '/upgrade/'])(
    'ซ่อนบนหน้าที่มี sidebar ของตัวเอง: %s',
    (path) => {
      mockPath = path;
      const { container } = render(<Navbar />);
      expect(container).toBeEmptyDOMElement();
    },
  );

  it.each(['/', '/blogs', '/upgrades-info'])('แสดงบนหน้าสาธารณะ: %s', (path) => {
    mockPath = path;
    render(<Navbar />);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });
});
