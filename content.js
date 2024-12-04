// Main content script
(function () {
  // Add missing variable declarations
  let mainObserver = null;
  let observerTimeout = null;

  const SELECTORS = {
    SUBSCRIBE_BUTTON: 'ytd-subscribe-button-renderer',
    SUBSCRIBED: '[subscribed]',
  };

  // Add missing debounce utility
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Add missing cleanup function
  function cleanupButton(button) {
    if (button._observer) {
      button._observer.disconnect();
    }
    button.remove();
  }

  // Core utilities
  // Remove this duplicate createButton function
  /*
  const createButton = (isChannelPage) => {
    const btn = document.createElement("button");
    btn.className = `easy-unsub-button ${isChannelPage ? 'channel-page-unsub' : ''}`;
    btn.innerHTML = `
      <svg class="unsub-icon" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="18" y1="8" x2="23" y2="13"/><line x1="23" y1="8" x2="18" y2="13"/></svg>
      <span>Unsub</span>
    `;
    btn.addEventListener("click", handleUnsubscribe);
    return btn;
  };
  */

  // Core functionality
  async function handleUnsubscribe(event) {
    event.preventDefault();
    event.stopPropagation();

    const button = event.target.closest('.easy-unsub-button');
    if (!button) return;

    button.classList.add('loading');

    const subscribeButton = button.closest('ytd-subscribe-button-renderer');
    if (!subscribeButton) {
      button.classList.remove('loading');
      return;
    }

    const channelContainer =
      window.location.pathname === '/feed/channels'
        ? subscribeButton.closest('ytd-channel-renderer')
        : null;

    try {
      // Find and click the YouTube subscribe button
      const youtubeButton = subscribeButton.querySelector(
        '#subscribe-button button, button.yt-spec-button-shape-next, [aria-label*="Unsubscribe"]'
      );
      if (!youtubeButton) throw new Error('YouTube subscribe button not found');

      // Click the button and wait for dialog
      youtubeButton.click();

      // Wait for dialog with retry
      let confirmButton = null;
      for (let i = 0; i < 10; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        confirmButton = Array.from(
          document.querySelectorAll(
            'yt-confirm-dialog-renderer button, button.yt-spec-button-shape-next'
          )
        ).find((btn) => btn.textContent.toLowerCase().includes('unsubscribe'));
        if (confirmButton) break;
      }

      if (!confirmButton) throw new Error('Confirmation dialog not found');

      // Click confirm and wait for state change
      confirmButton.click();

      // Verify unsubscribe was successful
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const stillSubscribed =
        subscribeButton.hasAttribute('subscribed') ||
        subscribeButton.querySelector('[subscribed]');

      if (stillSubscribed) throw new Error('Channel is still subscribed');

      // Success - cleanup
      button.classList.remove('loading');
      cleanupButton(button);

      if (channelContainer) {
        channelContainer.classList.add('channel-exit-animation');
        setTimeout(() => channelContainer.remove(), 500);
      }
    } catch (error) {
      console.error('Unsubscribe failed:', error);
      button.classList.remove('loading');
      alert('Failed to unsubscribe. Please try again.');
    }
  }

  // Optimized isSubscribed check
  function isSubscribed(button) {
    if (!button) return false;
    return (
      button.hasAttribute('subscribed') ||
      button.hasAttribute('is-subscribed') ||
      button.querySelector(
        "[subscribed], [is-subscribed], button[aria-label*='Unsubscribe']"
      ) !== null
    );
  }

  // Debounced URL handler
  const handleUrlChange = debounce(() => {
    console.log('URL changed:', window.location.pathname);
    addUnsubscribeButtons();
  }, 250);

  // Utility functions
  function createUnsubButton() {
    const button = document.createElement('button');
    button.className = 'easy-unsub-button';
    button.innerHTML = `
      <svg class="unsub-icon" viewBox="0 0 24 24">
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
        <circle cx="8.5" cy="7" r="4"></circle>
        <line x1="23" y1="11" x2="17" y2="11"></line>
      </svg>
      <span>Unsub</span>
    `;
    // Force button to be visible
    button.style.display = 'inline-flex';
    button.style.visibility = 'visible';
    button.style.opacity = '1';
    // Ensure only the bell icon is visible
    button.querySelector('.unsub-icon').style.display = 'block';
    button.addEventListener('click', handleUnsubscribe);
    return button;
  }

  // Function to setup button observer
  function setupButtonObserver(button, parentElement) {
    const buttonObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' || mutation.type === 'childList') {
          const stillSubscribed = isSubscribed(parentElement);
          const existingButton =
            parentElement.querySelector('.easy-unsub-button');

          if (stillSubscribed && !existingButton) {
            const newUnsubButton = createUnsubButton();
            if (window.location.pathname.includes('/@')) {
              newUnsubButton.classList.add('channel-page-unsub');
            }
            parentElement.appendChild(newUnsubButton);
            newUnsubButton.style.display = 'inline-flex';
            newUnsubButton.style.visibility = 'visible';
            newUnsubButton.style.opacity = '1';
            setupButtonObserver(newUnsubButton, parentElement);
          } else if (!stillSubscribed && existingButton) {
            cleanupButton(existingButton);
          }
        }
      });
    });

    buttonObserver.observe(parentElement, {
      attributes: true,
      attributeFilter: ['subscribed', 'is-subscribed'],
      subtree: true,
      childList: true,
    });

    button._observer = buttonObserver;
  }

  // Optimized button addition
  const addUnsubscribeButtons = debounce(() => {
    // Wait for YouTube's dynamic content to load
    setTimeout(() => {
      const buttons = document.querySelectorAll(
        `${SELECTORS.SUBSCRIBE_BUTTON}[subscribed], ${SELECTORS.SUBSCRIBE_BUTTON}[is-subscribed]`
      );

      buttons.forEach((button) => {
        if (
          !button.querySelector('.easy-unsub-button') &&
          isSubscribed(button)
        ) {
          const unsubButton = createUnsubButton();
          if (window.location.pathname.includes('/@')) {
            unsubButton.classList.add('channel-page-unsub');
          }
          // Ensure proper insertion
          button.appendChild(unsubButton);
          // Force layout recalculation
          unsubButton.style.display = 'inline-flex';
          unsubButton.style.visibility = 'visible';
          unsubButton.style.opacity = '1';
          setupButtonObserver(unsubButton, button);
        }
      });
    }, 1000); // Give more time for YouTube's content to load
  }, 100);

  // Optimized observer setup
  function setupMainObserver() {
    try {
      if (mainObserver) {
        mainObserver.disconnect();
      }

      mainObserver = new MutationObserver((mutations) => {
        // Clear previous timeout
        if (observerTimeout) {
          clearTimeout(observerTimeout);
        }

        // Set new timeout for batch processing
        observerTimeout = setTimeout(() => {
          const shouldUpdate = mutations.some(
            (mutation) =>
              mutation.target instanceof Element &&
              (mutation.target.closest('ytd-subscribe-button-renderer') ||
                mutation.target.matches(SELECTORS.CHANNEL_SUBSCRIBE))
          );

          if (shouldUpdate) {
            addUnsubscribeButtons();
          }
        }, 100);
      });

      // Observe only necessary parts of the page
      const observeTarget = window.location.pathname.includes('/@')
        ? document.querySelector('#channel-container')
        : document.querySelector('#content');

      if (observeTarget) {
        mainObserver.observe(observeTarget, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['subscribed'],
        });
      }
    } catch (error) {
      console.error('Observer setup failed:', error);
    }
  }

  // Add bulk unsubscribe functionality with UserMinus icon and tooltips
  // Add state management object
  const bulkState = {
    isProcessing: false,
    selected: 0,
    completed: 0,
    total: 0,
  };

  // Update progress display
  function updateProgress() {
    const progress = document.querySelector('.bulk-progress');
    if (!progress) return;

    const text = bulkState.isProcessing
      ? `Processing: ${bulkState.completed}/${bulkState.selected}`
      : bulkState.completed > 0
      ? `Completed: ${bulkState.completed}/${bulkState.selected}`
      : `Selected: ${bulkState.selected}`;

    // Animate the text change
    progress.style.opacity = '0';
    setTimeout(() => {
      progress.textContent = text;
      progress.style.opacity = '1';
    }, 200);

    // Update button state
    const unsubBtn = document.getElementById('unsubAllBtn');
    if (unsubBtn) {
      unsubBtn.disabled = bulkState.selected === 0 || bulkState.isProcessing;
      unsubBtn.classList.toggle('processing', bulkState.isProcessing);
    }
  }

  // Update addBulkControls function
  function addBulkControls() {
    if (
      window.location.pathname !== '/feed/channels' ||
      document.querySelector('.bulk-controls')
    ) {
      return;
    }

    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'bulk-controls';
    controlsDiv.innerHTML = `
      <button class="bulk-button" id="selectAllBtn" title="Select all channels">Select All</button>
      <button class="bulk-button" id="unsubAllBtn" title="Unsubscribe from selected channels" disabled>
        <svg class="unsub-icon" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <line x1="18" y1="8" x2="23" y2="13"/>
          <line x1="23" y1="8" x2="18" y2="13"/>
        </svg>
        Unsub
      </button>
      <span class="bulk-progress">Selected: 0</span>
    `;

    const container = document.querySelector('ytd-browse');
    container?.insertBefore(controlsDiv, container.firstChild);

    // Update checkbox handling
    function handleCheckboxChange(e) {
      const checkbox = e.target;
      if (checkbox.checked) {
        bulkState.selected++;
      } else {
        bulkState.selected--;
      }
      document.getElementById('unsubAllBtn').disabled =
        bulkState.selected === 0;
      updateProgress();
    }

    // Add checkboxes with improved handling
    function addCheckboxesToChannels() {
      document.querySelectorAll('ytd-channel-renderer').forEach((channel) => {
        if (!channel.querySelector('.channel-checkbox')) {
          const checkbox = document.createElement('div');
          checkbox.className = 'channel-checkbox-wrapper';
          checkbox.innerHTML =
            '<input type="checkbox" class="channel-checkbox">';
          channel.insertBefore(checkbox, channel.firstChild);

          // Add change listener
          checkbox
            .querySelector('.channel-checkbox')
            .addEventListener('change', handleCheckboxChange);
        }
      });
    }

    // Update bulk unsubscribe with improved state management
    async function handleBulkUnsubscribe() {
      const selectedChannels = document.querySelectorAll(
        '.channel-checkbox:checked'
      );
      bulkState.isProcessing = true;
      bulkState.completed = 0;
      bulkState.selected = selectedChannels.length;

      document.getElementById('selectAllBtn').disabled = true;
      document.getElementById('unsubAllBtn').disabled = true;

      updateProgress();

      for (const checkbox of selectedChannels) {
        const channel = checkbox.closest('ytd-channel-renderer');
        const subscribeButton = channel.querySelector(
          'ytd-subscribe-button-renderer'
        );

        if (subscribeButton) {
          bulkState.completed++;
          updateProgress();

          try {
            // Find and click the YouTube subscribe button
            const youtubeButton = subscribeButton.querySelector(
              '#subscribe-button button, button.yt-spec-button-shape-next, [aria-label*="Unsubscribe"]'
            );
            if (!youtubeButton)
              throw new Error('YouTube subscribe button not found');

            // Click the button and wait for dialog
            youtubeButton.click();

            // Bypass confirmation dialog
            let confirmButton = null;
            for (let i = 0; i < 10; i++) {
              await new Promise((resolve) => setTimeout(resolve, 100));
              confirmButton = Array.from(
                document.querySelectorAll(
                  'yt-confirm-dialog-renderer button, button.yt-spec-button-shape-next'
                )
              ).find((btn) =>
                btn.textContent.toLowerCase().includes('unsubscribe')
              );
              if (confirmButton) break;
            }

            if (confirmButton) {
              confirmButton.click();
            }

            // Verify unsubscribe was successful
            await new Promise((resolve) => setTimeout(resolve, 1000));
            const stillSubscribed =
              subscribeButton.hasAttribute('subscribed') ||
              subscribeButton.querySelector('[subscribed]');

            if (stillSubscribed) throw new Error('Channel is still subscribed');

            // Success - cleanup
            channel.classList.add('channel-exit-animation');
            await new Promise((resolve) => setTimeout(resolve, 500));
            channel.remove();
          } catch (error) {
            console.error('Unsubscribe failed:', error);
          }
        }

        // Add small delay between operations
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      bulkState.isProcessing = false;
      document.getElementById('selectAllBtn').disabled = false;
      updateProgress();
    }

    // Event listeners
    document
      .getElementById('selectAllBtn')
      ?.addEventListener('click', (event) => {
        const button = event.target;
        const isSelecting = button.textContent === 'Select All';
        button.textContent = isSelecting ? 'Unselect All' : 'Select All';
        button.classList.toggle('active', isSelecting);
        document.querySelectorAll('.channel-checkbox').forEach((cb) => {
          cb.checked = isSelecting;
        });
        bulkState.selected = isSelecting
          ? document.querySelectorAll('.channel-checkbox').length
          : 0;
        document.getElementById('unsubAllBtn').disabled =
          bulkState.selected === 0;
        updateProgress();
      });

    document
      .getElementById('unsubAllBtn')
      ?.addEventListener('click', handleBulkUnsubscribe);

    // Monitor for new channels
    const channelsObserver = new MutationObserver(addCheckboxesToChannels);
    const channelsContainer = document.querySelector('ytd-browse');
    if (channelsContainer) {
      channelsObserver.observe(channelsContainer, {
        childList: true,
        subtree: true,
      });
    }

    addCheckboxesToChannels();
  }

  // Improved initialization with retry mechanism
  function init() {
    let initAttempts = 0;
    const maxAttempts = 5;

    function attemptInit() {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attemptInit);
        return;
      }

      try {
        if (mainObserver) {
          mainObserver.disconnect();
        }

        setupMainObserver();
        addUnsubscribeButtons();

        if (window.location.pathname === '/feed/channels') {
          setTimeout(addBulkControls, 1000);
        }

        // Verify elements are added
        const elements = document.querySelectorAll(
          '.easy-unsub-button, .bulk-controls'
        );
        if (elements.length === 0 && initAttempts < maxAttempts) {
          console.log(`Retry attempt ${initAttempts + 1} of ${maxAttempts}`);
          initAttempts++;
          setTimeout(attemptInit, 1000);
          return;
        }
      } catch (error) {
        console.error('Init error:', error);
        if (initAttempts < maxAttempts) {
          initAttempts++;
          setTimeout(attemptInit, 1000);
        }
      }
    }

    attemptInit();
  }

  // Replace setTimeout-based execution with more robust initialization
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Clean up on navigation
  window.addEventListener('beforeunload', () => {
    if (mainObserver) {
      mainObserver.disconnect();
    }
    if (observerTimeout) {
      clearTimeout(observerTimeout);
    }
  });
})();
