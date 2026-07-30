import { Feed } from '../constants/types';

// Publicly accessible police/emergency radio streams
// Note: Broadcastify premium streams require authentication.
// These are publicly verifiable scanner streams (some may require region access).
export const ALL_FEEDS: Feed[] = [
  {
    id: 'sfpd',
    name: 'SF Police & Fire Dispatch',
    agency: 'SFPD / SFFD',
    city: 'San Francisco',
    state: 'CA',
    country: 'US',
    latitude: 37.7749,
    longitude: -122.4194,
    url: 'https://broadcastify.cdnstream1.com/23568',
    listeners: 1240,
    description: 'San Francisco Police & Fire combined dispatch',
    tags: ['police', 'fire', 'dispatch'],
  },
  {
    id: 'lapd',
    name: 'LAPD Communications Division',
    agency: 'LAPD',
    city: 'Los Angeles',
    state: 'CA',
    country: 'US',
    latitude: 34.0522,
    longitude: -118.2437,
    url: 'https://broadcastify.cdnstream1.com/22431',
    listeners: 3580,
    description: 'Los Angeles Police Department primary dispatch',
    tags: ['police', 'dispatch'],
  },
  {
    id: 'nypd',
    name: 'NYPD Brooklyn South',
    agency: 'NYPD',
    city: 'New York',
    state: 'NY',
    country: 'US',
    latitude: 40.6782,
    longitude: -73.9442,
    url: 'https://broadcastify.cdnstream1.com/22158',
    listeners: 5210,
    description: 'NYPD Brooklyn South division dispatch',
    tags: ['police', 'dispatch'],
  },
  {
    id: 'chicago',
    name: 'Chicago Police Zone 3',
    agency: 'CPD',
    city: 'Chicago',
    state: 'IL',
    country: 'US',
    latitude: 41.8781,
    longitude: -87.6298,
    url: 'https://broadcastify.cdnstream1.com/21698',
    listeners: 2890,
    description: 'Chicago Police Department Zone 3 dispatch',
    tags: ['police', 'dispatch'],
  },
  {
    id: 'miami',
    name: 'Miami-Dade Police Dispatch',
    agency: 'MDPD',
    city: 'Miami',
    state: 'FL',
    country: 'US',
    latitude: 25.7617,
    longitude: -80.1918,
    url: 'https://broadcastify.cdnstream1.com/20812',
    listeners: 1650,
    description: 'Miami-Dade Police Department dispatch channel',
    tags: ['police', 'dispatch'],
  },
  {
    id: 'houston',
    name: 'Houston Police Dispatch',
    agency: 'HPD',
    city: 'Houston',
    state: 'TX',
    country: 'US',
    latitude: 29.7604,
    longitude: -95.3698,
    url: 'https://broadcastify.cdnstream1.com/19874',
    listeners: 2100,
    description: 'Houston Police Department primary dispatch',
    tags: ['police', 'dispatch'],
  },
  {
    id: 'phoenix',
    name: 'Phoenix Police Dispatch',
    agency: 'PPD',
    city: 'Phoenix',
    state: 'AZ',
    country: 'US',
    latitude: 33.4484,
    longitude: -112.0740,
    url: 'https://broadcastify.cdnstream1.com/18965',
    listeners: 1340,
    description: 'Phoenix Police Department dispatch',
    tags: ['police', 'dispatch'],
  },
  {
    id: 'seattle',
    name: 'Seattle Police Dispatch',
    agency: 'SPD',
    city: 'Seattle',
    state: 'WA',
    country: 'US',
    latitude: 47.6062,
    longitude: -122.3321,
    url: 'https://broadcastify.cdnstream1.com/17823',
    listeners: 1820,
    description: 'Seattle Police Department primary dispatch',
    tags: ['police', 'dispatch'],
  },
  {
    id: 'denver',
    name: 'Denver Police Dispatch',
    agency: 'DPD',
    city: 'Denver',
    state: 'CO',
    country: 'US',
    latitude: 39.7392,
    longitude: -104.9903,
    url: 'https://broadcastify.cdnstream1.com/16734',
    listeners: 980,
    description: 'Denver Police Department dispatch',
    tags: ['police', 'dispatch'],
  },
  {
    id: 'atlanta',
    name: 'Atlanta Police Dispatch',
    agency: 'APD',
    city: 'Atlanta',
    state: 'GA',
    country: 'US',
    latitude: 33.7490,
    longitude: -84.3880,
    url: 'https://broadcastify.cdnstream1.com/15612',
    listeners: 1470,
    description: 'Atlanta Police Department primary dispatch',
    tags: ['police', 'dispatch'],
  },
];

function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export interface FeedWithDistance extends Feed {
  distanceKm: number;
}

export function getFeedsNearLocation(
  latitude: number,
  longitude: number,
  radiusKm: number = 5000
): FeedWithDistance[] {
  return ALL_FEEDS.map((feed) => ({
    ...feed,
    distanceKm: getDistanceKm(latitude, longitude, feed.latitude, feed.longitude),
  }))
    .filter((f) => f.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

export function getAllFeedsWithDistance(
  latitude: number,
  longitude: number
): FeedWithDistance[] {
  return ALL_FEEDS.map((feed) => ({
    ...feed,
    distanceKm: getDistanceKm(latitude, longitude, feed.latitude, feed.longitude),
  })).sort((a, b) => a.distanceKm - b.distanceKm);
}
