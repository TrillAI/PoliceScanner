import { AlertSeverity } from '../../constants/types';
import { Colors } from '../../constants/theme';

// Marker colors: severity for alerts, blue for plain location mentions.
export function markerColor(severity: AlertSeverity | null): string {
  switch (severity) {
    case 'HIGH':
      return Colors.high;
    case 'MEDIUM':
      return Colors.medium;
    case 'LOW':
      return Colors.low;
    default:
      return Colors.info;
  }
}

export function formatMarkerTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
