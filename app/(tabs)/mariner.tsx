import { useRouter } from 'expo-router';
import { useEffect } from 'react';

export default function MarinerLink() {
  const router = useRouter();

  useEffect(() => {
    // Replace so the "link page" doesn't stay in history
    router.replace({ pathname: '/maps', params: { view: 'mariner' } });
  }, [router]);

  return null;
}
