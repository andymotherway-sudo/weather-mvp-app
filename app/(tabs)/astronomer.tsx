// app/(tabs)/astronomer.tsx
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

export default function AstronomerLink() {
  const router = useRouter();

  useEffect(() => {
    // Direct route to the dedicated Astro map screen
    router.replace({
      pathname: '/astro-map',
      params: {
        from: 'astronomer-link',
        nav: String(Date.now()), // force fresh init if your screen uses nav token
      },
    });
  }, [router]);

  return null;
}
