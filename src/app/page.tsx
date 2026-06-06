import { redirect } from 'next/navigation';

export default function RootPage() {
  // Middleware handles the actual session/role logic.
  // This is a fallback to ensure the route exists at build time.
  redirect('/auth');
}
