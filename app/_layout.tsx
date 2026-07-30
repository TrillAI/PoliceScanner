import { AlertProvider } from '@/template';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { ScannerProvider } from '../contexts/ScannerContext';

export default function RootLayout() {
  return (
    <AlertProvider>
      <SafeAreaProvider>
        <ScannerProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </ScannerProvider>
      </SafeAreaProvider>
    </AlertProvider>
  );
}
