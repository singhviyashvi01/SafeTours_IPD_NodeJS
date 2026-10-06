/**
 * Who is signed in right now (set by AuthContext). The outbox tags every row with its owner and only uploads rows
 * of the signed-in user, so a queued SOS or report of one account can never be sent under another account that
 * signs in later on the same phone.
 */
let userId = null;

export const session = {
  set(id) {
    userId = id ? String(id) : null;
  },
  get() {
    return userId;
  },
};
