import { Platform } from 'react-native';
import { tokenStorage } from './tokenStorage';

const getBaseUrl = () => {
  if (__DEV__) {
    // 10.0.2.2 is the alias to host loopback for Android Emulator, localhost for iOS simulator
    return Platform.OS === 'android' ? 'http://10.0.2.2:5000/api' : 'http://localhost:5000/api';
  }
  return 'https://api.safetours.example.com/api';
};

const getHeaders = async () => {
  const token = await tokenStorage.getAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export const communityService = {
  /**
   * Report a new incident.
   */
  reportIncident: async (incidentData) => {
    try {
      const baseUrl = getBaseUrl();
      const headers = await getHeaders();
      const response = await fetch(`${baseUrl}/community/report`, {
        method: 'POST',
        headers,
        body: JSON.stringify(incidentData),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || 'Failed to submit incident report.');
      }
      return result;
    } catch (error) {
      console.error('[communityService.reportIncident] Error:', error.message);
      throw error;
    }
  },

  /**
   * Fetch nearby active incidents based on radius.
   */
  getNearbyIncidents: async (latitude, longitude, radiusInMeters = 5000) => {
    try {
      const baseUrl = getBaseUrl();
      const headers = await getHeaders();
      const url = `${baseUrl}/community/nearby?latitude=${latitude}&longitude=${longitude}&radius=${radiusInMeters}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers,
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || 'Failed to fetch nearby incidents.');
      }
      return result;
    } catch (error) {
      console.error('[communityService.getNearbyIncidents] Error:', error.message);
      throw error;
    }
  },

  /**
   * Confirm the validity of a community reported incident.
   */
  confirmIncident: async (incidentId) => {
    try {
      const baseUrl = getBaseUrl();
      const headers = await getHeaders();
      const response = await fetch(`${baseUrl}/community/${incidentId}/confirm`, {
        method: 'POST',
        headers,
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || 'Failed to confirm incident.');
      }
      return result;
    } catch (error) {
      console.error('[communityService.confirmIncident] Error:', error.message);
      throw error;
    }
  },

  /**
   * Flag a reported incident as false.
   */
  reportFalse: async (incidentId) => {
    try {
      const baseUrl = getBaseUrl();
      const headers = await getHeaders();
      const response = await fetch(`${baseUrl}/community/${incidentId}/report-false`, {
        method: 'POST',
        headers,
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || 'Failed to flag incident as false.');
      }
      return result;
    } catch (error) {
      console.error('[communityService.reportFalse] Error:', error.message);
      throw error;
    }
  },

  /**
   * Fetch all incidents reported by the logged-in user.
   */
  getMyReports: async () => {
    try {
      const baseUrl = getBaseUrl();
      const headers = await getHeaders();
      const response = await fetch(`${baseUrl}/community/my-reports`, {
        method: 'GET',
        headers,
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || 'Failed to fetch my incident reports.');
      }
      return result;
    } catch (error) {
      console.error('[communityService.getMyReports] Error:', error.message);
      throw error;
    }
  },

  /**
   * Retrieve full details of an incident.
   */
  getIncidentDetails: async (incidentId) => {
    try {
      const baseUrl = getBaseUrl();
      const headers = await getHeaders();
      const response = await fetch(`${baseUrl}/community/${incidentId}`, {
        method: 'GET',
        headers,
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || 'Failed to fetch incident details.');
      }
      return result;
    } catch (error) {
      console.error('[communityService.getIncidentDetails] Error:', error.message);
      throw error;
    }
  },
};
