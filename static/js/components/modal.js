/**
 * Modal Component
 * Reusable modal dialog system
 */

export class Modal {
  constructor(id, title, contentHTML) {
    this.id = id;
    this.title = title;
    this.contentHTML = contentHTML;
    this.submitHandler = null;
    this.cancelHandler = null;
    this.element = null;
    this.overlay = null;
    this.submitText = 'Save';
    this.cancelText = 'Cancel';
  }

  /**
   * Create a new modal instance
   * @param {string} id - Unique modal ID
   * @param {string} title - Modal title
   * @param {string} contentHTML - HTML content for modal body
   * @returns {Modal} Modal instance
   */
  static create(id, title, contentHTML) {
    return new Modal(id, title, contentHTML);
  }

  /**
   * Set submit handler
   * @param {Function} handler - Submit callback function
   */
  setSubmitHandler(handler) {
    this.submitHandler = handler;
    return this;
  }

  /**
   * Set cancel handler
   * @param {Function} handler - Cancel callback function
   */
  setCancelHandler(handler) {
    this.cancelHandler = handler;
    return this;
  }

  /**
   * Render the modal HTML
   */
  render() {
    // Create overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    this.overlay.id = `${this.id}-overlay`;

    // Create modal container
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = this.id;

    // Create header
    const header = document.createElement('div');
    header.className = 'modal-header';

    const titleEl = document.createElement('h3');
    titleEl.className = 'modal-title';
    titleEl.textContent = this.title;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.innerHTML = '✕';
    closeBtn.setAttribute('aria-label', 'Close modal');

    header.appendChild(titleEl);
    header.appendChild(closeBtn);

    // Create body
    const body = document.createElement('div');
    body.className = 'modal-body';
    body.innerHTML = this.contentHTML;

    // Create footer
    const footer = document.createElement('div');
    footer.className = 'modal-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.textContent = this.cancelText;
    cancelBtn.type = 'button';

    const submitBtn = document.createElement('button');
    submitBtn.className = 'btn btn-primary';
    submitBtn.textContent = this.submitText;
    submitBtn.type = 'button';

    footer.appendChild(cancelBtn);
    footer.appendChild(submitBtn);

    // Assemble modal
    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    this.overlay.appendChild(modal);

    // Store reference
    this.element = modal;

    // Event listeners
    closeBtn.addEventListener('click', () => this.close());
    cancelBtn.addEventListener('click', () => this.handleCancel());
    submitBtn.addEventListener('click', () => this.handleSubmit());

    // Close on overlay click
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    });

    // Close on Escape key
    this.escapeHandler = (e) => {
      if (e.key === 'Escape') {
        this.close();
      }
    };

    return this;
  }

  /**
   * Show the modal
   */
  show() {
    if (!this.overlay) {
      this.render();
    }

    document.body.appendChild(this.overlay);
    document.addEventListener('keydown', this.escapeHandler);

    // Focus first input
    setTimeout(() => {
      const firstInput = this.element.querySelector('input, select, textarea');
      if (firstInput) {
        firstInput.focus();
      }
    }, 100);

    return this;
  }

  /**
   * Close the modal
   */
  close() {
    if (!this.overlay) return;

    this.overlay.classList.add('closing');

    setTimeout(() => {
      if (this.overlay && this.overlay.parentNode) {
        this.overlay.parentNode.removeChild(this.overlay);
      }
      document.removeEventListener('keydown', this.escapeHandler);
    }, 250);

    return this;
  }

  /**
   * Handle submit button click
   */
  async handleSubmit() {
    console.log('handleSubmit called, submitHandler exists:', !!this.submitHandler);
    if (this.submitHandler) {
      const result = await this.submitHandler(this);
      console.log('Submit handler returned:', result);
      // Close modal unless handler returns false
      if (result !== false) {
        console.log('Closing modal because result is not false');
        this.close();
      } else {
        console.log('Keeping modal open because result is false');
      }
    } else {
      console.log('No submit handler, closing modal');
      this.close();
    }
  }

  /**
   * Handle cancel button click
   */
  handleCancel() {
    if (this.cancelHandler) {
      this.cancelHandler(this);
    }
    this.close();
  }

  /**
   * Get form data from modal inputs
   * @returns {Object} Form data as key-value pairs
   */
  getFormData() {
    const form = this.element.querySelector('form');
    if (!form) {
      // Collect all inputs if no form element
      const inputs = this.element.querySelectorAll('input, select, textarea');
      const data = {};

      inputs.forEach(input => {
        if (input.name) {
          if (input.type === 'checkbox') {
            data[input.name] = input.checked;
          } else if (input.type === 'radio') {
            if (input.checked) {
              data[input.name] = input.value;
            }
          } else {
            data[input.name] = input.value;
          }
        }
      });

      return data;
    }

    return Object.fromEntries(new FormData(form));
  }

  /**
   * Set form data
   * @param {Object} data - Data to populate form with
   */
  setFormData(data) {
    Object.keys(data).forEach(key => {
      const input = this.element.querySelector(`[name="${key}"]`);
      if (input) {
        if (input.type === 'checkbox') {
          input.checked = data[key];
        } else if (input.type === 'radio') {
          if (input.value === data[key]) {
            input.checked = true;
          }
        } else {
          input.value = data[key];
        }
      }
    });
  }

  /**
   * Get modal body element
   * @returns {HTMLElement} Body element
   */
  getBody() {
    return this.element ? this.element.querySelector('.modal-body') : null;
  }

  /**
   * Update modal content
   * @param {string} contentHTML - New HTML content
   */
  updateContent(contentHTML) {
    const body = this.getBody();
    if (body) {
      body.innerHTML = contentHTML;
    }
  }

  /**
   * Set submit button text
   * @param {string} text - Button text
   */
  setSubmitText(text) {
    this.submitText = text;
    if (this.element) {
      const submitBtn = this.element.querySelector('.modal-footer .btn-primary');
      if (submitBtn) {
        submitBtn.textContent = text;
      }
    }
    return this;
  }

  /**
   * Set cancel button text
   * @param {string} text - Button text
   */
  setCancelText(text) {
    this.cancelText = text;
    if (this.element) {
      const cancelBtn = this.element.querySelector('.modal-footer .btn-secondary');
      if (cancelBtn) {
        cancelBtn.textContent = text;
      }
    }
    return this;
  }
}
