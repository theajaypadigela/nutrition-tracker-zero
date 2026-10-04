import React, { useEffect, useState } from 'react';
import { SafeAreaView, Text } from 'react-native';
import { API_BASE_URL } from './config/local';

export default function App() {
  const [status, setStatus] = useState('checking…');
  useEffect(() => {
    fetch(`${API_BASE_URL}/health`)
      .then((r) => r.json())
      .then((b) => setStatus(b.ok ? 'API ok' : 'API error'))
      .catch((e) => setStatus(`API unreachable: ${String(e.message ?? e)}`));
  }, []);
  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-white">
      <Text className="text-2xl font-bold text-gray-900">Nutrition Zero</Text>
      <Text testID="api-status" className="mt-4 text-lg text-gray-700">{status}</Text>
    </SafeAreaView>
  );
}
