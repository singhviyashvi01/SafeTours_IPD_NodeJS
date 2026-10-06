import { apiClient } from './apiClient';
import { contactsCache } from './contactsCache';

export const contactsService = {
  /**
   * GET /api/contacts
   * Retrieves all emergency contacts for the authenticated user.
   */
  list: async () => {
    try {
      const response = await apiClient.get('/contacts');
      const list = response.data.data || [];
      contactsCache.save(list); // keep the offline copy (used by the SOS text message) in step
      return list;
    } catch (error) {
      // No network: show the last synced contacts instead of an error. Real server errors still surface.
      if (!error.response) {
        const cached = await contactsCache.get();
        if (cached) return cached.contacts;
      }
      throw error;
    }
  },

  /**
   * GET /api/contacts/:id
   * Retrieves a single contact by ID.
   */
  get: async id => {
    const response = await apiClient.get(`/contacts/${id}`);
    return response.data.data;
  },

  /**
   * POST /api/contacts
   * Creates a new emergency contact.
   */
  create: async payload => {
    const response = await apiClient.post('/contacts', payload);
    contactsCache.refresh();
    return response.data.data;
  },

  /**
   * PUT /api/contacts/:id
   * Updates an existing emergency contact.
   */
  update: async (id, payload) => {
    const response = await apiClient.put(`/contacts/${id}`, payload);
    contactsCache.refresh();
    return response.data.data;
  },

  /**
   * DELETE /api/contacts/:id
   * Deletes an emergency contact.
   */
  remove: async id => {
    const response = await apiClient.delete(`/contacts/${id}`);
    contactsCache.refresh();
    return response.data.data;
  },
};
