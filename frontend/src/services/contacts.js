import { apiClient } from './apiClient';

export const contactsService = {
  /**
   * GET /api/contacts
   * Retrieves all emergency contacts for the authenticated user.
   */
  list: async () => {
    const response = await apiClient.get('/contacts');
    return response.data.data || [];
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
    return response.data.data;
  },

  /**
   * PUT /api/contacts/:id
   * Updates an existing emergency contact.
   */
  update: async (id, payload) => {
    const response = await apiClient.put(`/contacts/${id}`, payload);
    return response.data.data;
  },

  /**
   * DELETE /api/contacts/:id
   * Deletes an emergency contact.
   */
  remove: async id => {
    const response = await apiClient.delete(`/contacts/${id}`);
    return response.data.data;
  },
};
