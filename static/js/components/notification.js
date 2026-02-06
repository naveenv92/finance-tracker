/**
 * Notification Component
 * Toast-style notifications with auto-dismiss
 */

export class Notification {
  static container = null;
  static notifications = [];

  /**
   * Initialize notification system
   */
  static init() {
    if (this.container) return;

    this.container = document.createElement('div');
    this.container.id = 'notification-container';
    this.container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: var(--z-notification);
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
      max-width: 400px;
    `;

    document.body.appendChild(this.container);
  }

  /**
   * Show a success notification
   * @param {string} message - Message to display
   * @param {number} duration - Duration in milliseconds (default: 3000)
   */
  static success(message, duration = 3000) {
    this.show(message, 'success', duration);
  }

  /**
   * Show an error notification
   * @param {string} message - Message to display
   * @param {number} duration - Duration in milliseconds (default: 5000)
   */
  static error(message, duration = 5000) {
    this.show(message, 'error', duration);
  }

  /**
   * Show a warning notification
   * @param {string} message - Message to display
   * @param {number} duration - Duration in milliseconds (default: 4000)
   */
  static warning(message, duration = 4000) {
    this.show(message, 'warning', duration);
  }

  /**
   * Show an info notification
   * @param {string} message - Message to display
   * @param {number} duration - Duration in milliseconds (default: 3000)
   */
  static info(message, duration = 3000) {
    this.show(message, 'info', duration);
  }

  /**
   * Show a notification
   * @param {string} message - Message to display
   * @param {string} type - Type of notification (success, error, warning, info)
   * @param {number} duration - Duration in milliseconds
   */
  static show(message, type = 'info', duration = 3000) {
    this.init();

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;

    const colors = {
      success: 'var(--color-success)',
      error: 'var(--color-error)',
      warning: 'var(--color-warning)',
      info: 'var(--color-primary)'
    };

    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };

    notification.style.cssText = `
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      padding: var(--spacing-md) var(--spacing-lg);
      background-color: white;
      border-left: 4px solid ${colors[type]};
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-lg);
      animation: slideIn 0.3s ease-out;
      cursor: pointer;
    `;

    const icon = document.createElement('div');
    icon.style.cssText = `
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background-color: ${colors[type]};
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      flex-shrink: 0;
    `;
    icon.textContent = icons[type];

    const text = document.createElement('div');
    text.style.cssText = `
      flex: 1;
      font-size: var(--font-size-sm);
      color: var(--gray-900);
    `;
    text.textContent = message;

    notification.appendChild(icon);
    notification.appendChild(text);

    // Add animation keyframes if not already added
    if (!document.getElementById('notification-styles')) {
      const style = document.createElement('style');
      style.id = 'notification-styles';
      style.textContent = `
        @keyframes slideIn {
          from {
            transform: translateX(400px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        @keyframes slideOut {
          from {
            transform: translateX(0);
            opacity: 1;
          }
          to {
            transform: translateX(400px);
            opacity: 0;
          }
        }
        .notification:hover {
          box-shadow: var(--shadow-xl);
        }
      `;
      document.head.appendChild(style);
    }

    // Click to dismiss
    notification.addEventListener('click', () => {
      this.dismiss(notification);
    });

    this.container.appendChild(notification);
    this.notifications.push(notification);

    // Auto-dismiss after duration
    if (duration > 0) {
      setTimeout(() => {
        this.dismiss(notification);
      }, duration);
    }
  }

  /**
   * Dismiss a notification
   * @param {HTMLElement} notification - Notification element
   */
  static dismiss(notification) {
    notification.style.animation = 'slideOut 0.3s ease-in';

    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }

      this.notifications = this.notifications.filter(n => n !== notification);
    }, 300);
  }

  /**
   * Dismiss all notifications
   */
  static dismissAll() {
    this.notifications.forEach(notification => {
      this.dismiss(notification);
    });
  }
}
