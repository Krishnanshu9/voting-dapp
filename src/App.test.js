// App.test.js patch
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders login heading', () => {
  render(<App />);
  const heading = screen.getByText(/Welcome to decentralized voting application/i);
  expect(heading).toBeInTheDocument();
});
