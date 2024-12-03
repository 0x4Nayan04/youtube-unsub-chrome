// Main content script
(function () {
  // Add debounce utility
  const debounce = (fn, delay) => {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn(...args), delay);
    };
  };

  // Configuration
  const SELECTORS = {
    SUBSCRIBE_BUTTON: "ytd-subscribe-button-renderer",
    SUBSCRIBED_STATE: "[subscribed]",
    CHANNEL_SUBSCRIBE:
      "#subscribe-button ytd-subscribe-button-renderer, ytd-channel-name + ytd-subscribe-button-renderer",
  };

  // Optimize observer by using more specific targets
  let mainObserver = null;
  let observerTimeout = null;

  // Improved button cleanup with memory management
  function cleanupButton(button) {
    if (button?._observer) {
      button._observer.disconnect();
      delete button._observer;
    }
    button?.remove();
  }

  // Optimized isSubscribed check
  function isSubscribed(button) {
    if (!button) return false;
    return (
      button.hasAttribute("subscribed") ||
      button.hasAttribute("is-subscribed") ||
      button.querySelector("[subscribed], [is-subscribed], button[aria-label*='Unsubscribe']") !== null
    );
  }

  // Debounced URL handler
  const handleUrlChange = debounce(() => {
    console.log("URL changed:", window.location.pathname);
    addUnsubscribeButtons();
  }, 250);

  // Utility functions
  function createUnsubButton() {
    const button = document.createElement("button");
    button.className = "easy-unsub-button";
    button.innerHTML = `
      <svg class="unsub-icon" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <line x1="18" y1="8" x2="23" y2="13"/>
        <line x1="23" y1="8" x2="18" y2="13"/>
      </svg>
      <span>${
        window.location.pathname.includes("/@") ? "Unsubscribe" : "Unsub"
      }</span>
    `;
    // Force button to be visible
    button.style.display = "inline-flex";
    button.style.visibility = "visible";
    button.style.opacity = "1";
    button.addEventListener("click", handleUnsubscribe);
    return button;
  }

  // Function to setup button observer
  function setupButtonObserver(button, parentElement) {
    const buttonObserver = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        if (mutation.type === 'attributes' || mutation.type === 'childList') {
          const stillSubscribed = isSubscribed(parentElement);
          const existingButton = parentElement.querySelector('.easy-unsub-button');

          if (stillSubscribed && !existingButton) {
            const newUnsubButton = createUnsubButton();
            if (window.location.pathname.includes("/@")) {
              newUnsubButton.classList.add("channel-page-unsub");
            }
            parentElement.appendChild(newUnsubButton);
            newUnsubButton.style.display = "inline-flex";
            newUnsubButton.style.visibility = "visible";
            newUnsubButton.style.opacity = "1";
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
      childList: true
    });

    button._observer = buttonObserver;
  }

  async function handleUnsubscribe(event) {
    event.preventDefault();
    event.stopPropagation();

    const subscribeButton = event.target.closest(
      "ytd-subscribe-button-renderer"
    );
    if (!subscribeButton) return;

    const channelContainer =
      window.location.pathname === "/feed/channels"
        ? subscribeButton.closest("ytd-channel-renderer")
        : null;

    const subscribeButtonElement = subscribeButton.querySelector(
      "#subscribe-button button, button.yt-spec-button-shape-next"
    );
    if (subscribeButtonElement) {
      subscribeButtonElement.click();

      setTimeout(async () => {
        try {
          const confirmButton = document.querySelector(
            "yt-confirm-dialog-renderer #confirm-button button, " +
              "tp-yt-paper-dialog[dialog] #confirm-button"
          );
          if (confirmButton) {
            confirmButton.click();
            setTimeout(() => {
              const unsubButton = event.target.closest(".easy-unsub-button");
              if (unsubButton) {
                cleanupButton(unsubButton);
                if (channelContainer) {
                  channelContainer.classList.add("channel-exit-animation");
                  setTimeout(() => {
                    channelContainer.remove();
                  }, 500);
                }
              }
            }, 1000);
          }
        } catch (error) {
          console.error("Error during unsubscribe:", error);
        }
      }, 100);
    }
  }

  // Optimized button addition
  const addUnsubscribeButtons = debounce(() => {
    // Wait for YouTube's dynamic content to load
    setTimeout(() => {
      const buttons = document.querySelectorAll(
        'ytd-subscribe-button-renderer[subscribed], ytd-subscribe-button-renderer[is-subscribed]'
      );

      buttons.forEach(button => {
        if (!button.querySelector('.easy-unsub-button') && isSubscribed(button)) {
          const unsubButton = createUnsubButton();
          if (window.location.pathname.includes("/@")) {
            unsubButton.classList.add("channel-page-unsub");
          }
          // Ensure proper insertion
          button.appendChild(unsubButton);
          // Force layout recalculation
          unsubButton.style.display = "inline-flex";
          unsubButton.style.visibility = "visible";
          unsubButton.style.opacity = "1";
          setupButtonObserver(unsubButton, button);
        }
      });
    }, 1000); // Give more time for YouTube's content to load
  }, 100);

  // Optimized observer setup
  function setupMainObserver() {
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
        const shouldUpdate = mutations.some(mutation => 
          mutation.target instanceof Element && 
          (mutation.target.closest("ytd-subscribe-button-renderer") || 
           mutation.target.matches(SELECTORS.CHANNEL_SUBSCRIBE))
        );

        if (shouldUpdate) {
          addUnsubscribeButtons();
        }
      }, 100);
    });

    // Observe only necessary parts of the page
    const observeTarget = window.location.pathname.includes("/@")
      ? document.querySelector("#channel-container")
      : document.querySelector("#content");

    if (observeTarget) {
      mainObserver.observe(observeTarget, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['subscribed']
      });
    }
  }

  // Initialize with cleanup
  function init() {
    // Cleanup existing observers
    if (mainObserver) {
      mainObserver.disconnect();
    }

    setupMainObserver();
    addUnsubscribeButtons();

    // URL change handling
    const pushState = history.pushState;
    history.pushState = function () {
      pushState.apply(history, arguments);
      handleUrlChange();
    };

    window.addEventListener("popstate", handleUrlChange);

    // Add retry mechanism
    let retryCount = 0;
    const maxRetries = 5;
    
    function tryAddButtons() {
      addUnsubscribeButtons();
      if (document.querySelectorAll('.easy-unsub-button').length === 0 && retryCount < maxRetries) {
        retryCount++;
        setTimeout(tryAddButtons, 1000);
      }
    }
    
    tryAddButtons();
  }

  // Start with error handling
  try {
    init();
  } catch (error) {
    console.error("Failed to initialize YouTube Easy Unsubscribe:", error);
  }

  // Cleanup on page unload
  window.addEventListener('unload', () => {
    if (mainObserver) {
      mainObserver.disconnect();
    }
    if (observerTimeout) {
      clearTimeout(observerTimeout);
    }
  });
})();
