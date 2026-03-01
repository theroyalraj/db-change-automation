/**
 * Abstract base class for ticketing system integrations.
 * All ticketing adapters (Jira, ServiceNow, Azure DevOps, etc.) must extend
 * this class and implement every method.
 */
class BaseTicketingAdapter {
  constructor(config) {
    if (new.target === BaseTicketingAdapter) {
      throw new Error('BaseTicketingAdapter is abstract and cannot be instantiated directly');
    }
    this.config = config;
  }

  /**
   * Creates a ticket from changeset metadata.
   * @param {object} changeset - Parsed changeset object
   * @param {string} prUrl - Pull request URL
   * @returns {Promise<{ ticketId: string, ticketUrl: string }>}
   */
  async createTicket(changeset, prUrl) {
    throw new Error('createTicket() must be implemented by subclass');
  }

  /**
   * Adds a comment to an existing ticket.
   * @param {string} ticketId - Ticket identifier
   * @param {string} comment - Comment text (supports markdown/ADF depending on implementation)
   * @returns {Promise<void>}
   */
  async addComment(ticketId, comment) {
    throw new Error('addComment() must be implemented by subclass');
  }

  /**
   * Transitions a ticket to a new status.
   * @param {string} ticketId - Ticket identifier
   * @param {'OPEN'|'IN_REVIEW'|'APPROVED'|'REJECTED'|'DONE'|'FAILED'} status
   * @returns {Promise<void>}
   */
  async transitionTicket(ticketId, status) {
    throw new Error('transitionTicket() must be implemented by subclass');
  }

  /**
   * Retrieves a ticket by ID.
   * @param {string} ticketId - Ticket identifier
   * @returns {Promise<object>} Ticket object
   */
  async getTicket(ticketId) {
    throw new Error('getTicket() must be implemented by subclass');
  }

  /**
   * Links two tickets together.
   * @param {string} sourceId - Source ticket ID
   * @param {string} targetId - Target ticket ID
   * @param {string} linkType - Link type (e.g., 'relates to', 'blocks', 'is caused by')
   * @returns {Promise<void>}
   */
  async linkTickets(sourceId, targetId, linkType) {
    throw new Error('linkTickets() must be implemented by subclass');
  }
}

module.exports = BaseTicketingAdapter;
