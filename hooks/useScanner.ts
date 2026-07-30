import { useContext } from 'react';
import { ScannerContext } from '../contexts/ScannerContext';

export function useScanner() {
  const context = useContext(ScannerContext);
  if (!context) throw new Error('useScanner must be used within ScannerProvider');
  return context;
}
