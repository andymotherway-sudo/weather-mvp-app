// app/(tabs)/astronomer.tsx
import { Redirect } from 'expo-router';
import { useState } from 'react';

export default function AstronomerLink() {
  const [nav] = useState(() => String(Date.now()));

  return (
    <Redirect
      href={{
        pathname: '/astro-map',
        params: {
          from: 'astronomer-link',
          nav,
        },
      }}
    />
  );
}
