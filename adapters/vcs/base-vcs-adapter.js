/**
 * Abstract base class for version control system integrations.
 * All VCS adapters (GitHub, GitLab, Bitbucket, Azure DevOps, etc.) must extend
 * this class and implement every method.
 */
class BaseVcsAdapter {
  constructor(config) {
    if (new.target === BaseVcsAdapter) {
      throw new Error('BaseVcsAdapter is abstract and cannot be instantiated directly');
    }
    this.config = config;
  }

  /**
   * Retrieves pull/merge request details.
   * @param {number|string} prNumber - PR/MR number
   * @returns {Promise<{ number: number, title: string, author: string, url: string, state: string, merged: boolean, description: string }>}
   */
  async getPRDetails(prNumber) {
    throw new Error('getPRDetails() must be implemented by subclass');
  }

  /**
   * Adds a comment to a pull/merge request.
   * @param {number|string} prNumber - PR/MR number
   * @param {string} comment - Comment text (markdown)
   * @returns {Promise<void>}
   */
  async addPRComment(prNumber, comment) {
    throw new Error('addPRComment() must be implemented by subclass');
  }

  /**
   * Returns the list of files changed in a PR.
   * @param {number|string} prNumber - PR/MR number
   * @returns {Promise<string[]>} Array of file paths
   */
  async getChangedFiles(prNumber) {
    throw new Error('getChangedFiles() must be implemented by subclass');
  }

  /**
   * Requests reviewers on a PR.
   * @param {number|string} prNumber - PR/MR number
   * @param {string[]} reviewers - Array of team slugs or usernames
   * @returns {Promise<void>}
   */
  async requestReviewers(prNumber, reviewers) {
    throw new Error('requestReviewers() must be implemented by subclass');
  }

  /**
   * Checks the approval status of a PR.
   * @param {number|string} prNumber - PR/MR number
   * @returns {Promise<{ approved: boolean, approvers: string[], pendingReviewers: string[] }>}
   */
  async getPRApprovalStatus(prNumber) {
    throw new Error('getPRApprovalStatus() must be implemented by subclass');
  }

  /**
   * Sets a commit status check on a PR.
   * @param {string} sha - Commit SHA
   * @param {'pending'|'success'|'failure'|'error'} state
   * @param {string} description - Status description
   * @param {string} context - Status context name
   * @param {string} [targetUrl] - Optional URL to link
   * @returns {Promise<void>}
   */
  async setCommitStatus(sha, state, description, context, targetUrl) {
    throw new Error('setCommitStatus() must be implemented by subclass');
  }
}

module.exports = BaseVcsAdapter;
