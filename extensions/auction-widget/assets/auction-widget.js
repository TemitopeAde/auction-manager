(() => {
  const URGENT_MS = 60 * 60 * 1000;
  const pad = (n) => String(n).padStart(2, '0');

  const setStatus = (root, message, tone) => {
    const status = root.querySelector('.auction-widget__status');
    status.textContent = message || '';
    status.hidden = !message;
    if (tone) status.dataset.tone = tone;
    else delete status.dataset.tone;
  };


  // ---------- Sonner-style toaster ----------
  const TOAST_DURATION = 4000;
  const TOAST_VISIBLE = 3;
  const TOAST_ICONS = {
    success: '<svg viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.86-9.81a.75.75 0 0 0-1.22-.88l-3.24 4.48-1.6-1.6a.75.75 0 1 0-1.06 1.06l2.22 2.22a.75.75 0 0 0 1.14-.09l3.76-5.19Z" clip-rule="evenodd"/></svg>',
    error: '<svg viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clip-rule="evenodd"/></svg>',
  };

  const getToaster = () => {
    let toaster = document.querySelector('.aw-toaster');
    if (toaster) return toaster;
    toaster = document.createElement('section');
    toaster.className = 'aw-toaster';
    toaster.setAttribute('aria-label', 'Notifications');
    toaster.setAttribute('aria-live', 'polite');
    toaster.addEventListener('mouseenter', () => { toaster.dataset.expanded = 'true'; layoutToasts(toaster); pauseToasts(toaster, true); });
    toaster.addEventListener('mouseleave', () => { toaster.dataset.expanded = 'false'; layoutToasts(toaster); pauseToasts(toaster, false); });
    document.body.append(toaster);
    return toaster;
  };

  const layoutToasts = (toaster) => {
    const toasts = [...toaster.querySelectorAll('.aw-toast:not([data-removed])')].reverse();
    const expanded = toaster.dataset.expanded === 'true';
    let offset = 0;
    toasts.forEach((el, index) => {
      el.style.setProperty('--index', index);
      el.style.setProperty('--offset', `${offset}px`);
      el.style.setProperty('--front-height', `${toasts[0]._height}px`);
      el.dataset.front = String(index === 0);
      el.dataset.visible = String(index < TOAST_VISIBLE);
      offset += el._height + 14;
    });
    toaster.style.setProperty('--stack-height', expanded ? `${offset}px` : `${toasts[0] ? toasts[0]._height : 0}px`);
  };

  const pauseToasts = (toaster, paused) => {
    toaster.querySelectorAll('.aw-toast').forEach((el) => { if (el._timer) el._timer(paused); });
  };

  const dismissToast = (el) => {
    if (el.dataset.removed) return;
    el.dataset.removed = 'true';
    const toaster = el.parentElement;
    layoutToasts(toaster);
    window.setTimeout(() => { el.remove(); if (toaster) layoutToasts(toaster); }, 400);
  };

  const toast = (type, title, description) => {
    const toaster = getToaster();
    const el = document.createElement('div');
    el.className = 'aw-toast';
    el.dataset.type = type;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML = `<span class="aw-toast__icon">${TOAST_ICONS[type]}</span><div class="aw-toast__content"><p class="aw-toast__title"></p><p class="aw-toast__description"></p></div><button type="button" class="aw-toast__close" aria-label="Close"><svg viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"/></svg></button>`;
    el.querySelector('.aw-toast__title').textContent = title;
    const desc = el.querySelector('.aw-toast__description');
    desc.textContent = description || '';
    desc.hidden = !description;
    el.querySelector('.aw-toast__close').addEventListener('click', () => dismissToast(el));

    // Auto-dismiss with pause on hover.
    let remaining = TOAST_DURATION;
    let started = Date.now();
    let handle = window.setTimeout(() => dismissToast(el), remaining);
    el._timer = (paused) => {
      if (paused) { window.clearTimeout(handle); remaining -= Date.now() - started; }
      else { started = Date.now(); handle = window.setTimeout(() => dismissToast(el), Math.max(remaining, 1000)); }
    };

    // Swipe to dismiss.
    let startX = null;
    el.addEventListener('pointerdown', (event) => {
      if (event.target.closest('button')) return;
      startX = event.clientX;
      el.setPointerCapture(event.pointerId);
      el.dataset.swiping = 'true';
    });
    el.addEventListener('pointermove', (event) => {
      if (startX === null) return;
      el.style.setProperty('--swipe', `${Math.max(0, event.clientX - startX)}px`);
    });
    const endSwipe = (event) => {
      if (startX === null) return;
      const delta = event.clientX - startX;
      startX = null;
      delete el.dataset.swiping;
      if (delta > 60) { el.dataset.swipeOut = 'true'; dismissToast(el); }
      else el.style.setProperty('--swipe', '0px');
    };
    el.addEventListener('pointerup', endSwipe);
    el.addEventListener('pointercancel', endSwipe);

    toaster.append(el);
    el._height = el.getBoundingClientRect().height;
    layoutToasts(toaster);
    requestAnimationFrame(() => { el.dataset.mounted = 'true'; });
  };

  const currencySymbol = (formatter) => {
    const part = formatter.formatToParts(0).find((p) => p.type === 'currency');
    return part ? part.value : '';
  };

  const tick = (root) => {
    const endsAt = root._endsAt;
    const countdown = root.querySelector('.auction-widget__countdown');
    const badge = root.querySelector('.auction-widget__badge');
    const badgeLabel = badge.querySelector('.auction-widget__badge-label');
    if (!endsAt) {
      countdown.hidden = true;
      badge.dataset.tone = 'live';
      badgeLabel.textContent = root.dataset.liveLabel;
      root.dataset.urgent = 'false';
      return;
    }
    const remaining = Math.max(0, endsAt - Date.now());
    const total = Math.floor(remaining / 1000);
    const values = { d: Math.floor(total / 86400), h: Math.floor((total % 86400) / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 };
    countdown.querySelectorAll('[data-unit]').forEach((el) => { el.textContent = pad(values[el.dataset.unit]); });
    countdown.querySelector('[data-unit="d"]').parentElement.hidden = values.d === 0;
    countdown.hidden = false;
    const urgent = remaining > 0 && remaining <= URGENT_MS;
    root.dataset.urgent = String(urgent);
    if (remaining === 0) {
      badge.dataset.tone = 'ended';
      badgeLabel.textContent = root.dataset.endedLabel;
      root.querySelectorAll('.auction-widget__form, .auction-widget__buy-now-form, .auction-widget__offer').forEach((el) => { el.hidden = true; });
    } else {
      badge.dataset.tone = urgent ? 'urgent' : 'live';
      badgeLabel.textContent = urgent ? root.dataset.endingSoonLabel : root.dataset.liveLabel;
    }
  };

  const renderChips = (root, formatter, minCents, stepCents) => {
    const chips = root.querySelector('.auction-widget__chips');
    const amount = root.querySelector('.auction-widget__form [name="amount"]');
    chips.replaceChildren();
    if (root.dataset.showQuickBids === 'false' || !stepCents) {
      chips.hidden = true;
      return;
    }
    [0, 1, 3].forEach((multiple) => {
      const cents = minCents + stepCents * multiple;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'auction-widget__chip';
      chip.textContent = formatter.format(cents / 100);
      chip.setAttribute('aria-pressed', 'false');
      chip.addEventListener('click', () => {
        amount.value = (cents / 100).toFixed(2);
        chips.querySelectorAll('.auction-widget__chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
        amount.focus();
      });
      chips.append(chip);
    });
    chips.hidden = false;
  };

  const render = async (root) => {
    const query = new URLSearchParams({ product_id: root.dataset.productId });
    const response = await fetch(`${root.dataset.endpoint}?${query}`, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(root.dataset.unavailableMessage);
    const payload = await response.json();
    const skeleton = root.querySelector('.auction-widget__skeleton');
    const details = root.querySelector('.auction-widget__details');
    skeleton.hidden = true;
    if (!payload.auction) {
      details.hidden = true;
      root.hidden = true;
      return;
    }
    root.hidden = false;
    root.querySelector('.auction-widget__header').hidden = false;

    const auction = payload.auction;
    const loggedIn = payload.customerLoggedIn === true || root.dataset.storefrontCustomerLoggedIn === 'true';
    const isPenny = auction.auctionType === 'PENNY';
    const hasBids = auction.currentBidCents !== null && auction.currentBidCents !== undefined;
    const formatter = new Intl.NumberFormat(undefined, { style: 'currency', currency: auction.currencyCode });
    const symbol = currencySymbol(formatter);

    // Header
    const title = root.querySelector('.auction-widget__title');
    title.textContent = root.dataset.editorHeading || auction.title;
    title.hidden = root.dataset.showTitle === 'false' || !title.textContent;
    const count = auction.bidCount ?? 0;
    root.querySelector('.auction-widget__bid-count').textContent = count === 0
      ? root.dataset.noBids
      : (count === 1 ? root.dataset.bidsOne : root.dataset.bidsOther).replace('{count}', count.toLocaleString());

    // Current bid
    const leading = hasBids ? auction.currentBidCents : auction.startingPriceCents;
    const current = root.querySelector('.auction-widget__current');
    const formattedLeading = formatter.format(leading / 100);
    if (root._lastLeading !== undefined && root._lastLeading !== leading) {
      current.classList.remove('is-updated');
      void current.offsetWidth;
      current.classList.add('is-updated');
    }
    root._lastLeading = leading;
    current.textContent = formattedLeading;
    root.querySelector('.auction-widget__current-label').textContent = hasBids ? root.dataset.currentBidLabel : root.dataset.startingBidLabel;
    const currentRow = root.querySelector('.auction-widget__current-row');
    const closingRow = root.querySelector('.auction-widget__closing-row');
    currentRow.hidden = root.dataset.showCurrentBid === 'false';
    closingRow.hidden = root.dataset.showClosingTime === 'false';
    root.querySelector('.auction-widget__stats').hidden = currentRow.hidden && closingRow.hidden;

    // Closing time
    const end = root.querySelector('.auction-widget__ends');
    if (auction.endsAt) {
      root._endsAt = new Date(auction.endsAt).getTime();
      end.dateTime = auction.endsAt;
      end.textContent = new Date(auction.endsAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    } else {
      root._endsAt = null;
      end.removeAttribute('datetime');
      end.textContent = root.dataset.noEndMessage;
    }
    root.querySelectorAll('[name="auctionId"]').forEach((input) => { input.value = auction.id; });
    root.querySelectorAll('.auction-widget__currency').forEach((el) => { el.textContent = symbol; });

    // Login state
    root.querySelector('.auction-widget__login-panel').hidden = loggedIn;

    // Bid form
    const bidForm = root.querySelector('.auction-widget__form');
    const amountField = bidForm.querySelector('.auction-widget__amount-field');
    const amount = bidForm.querySelector('[name="amount"]');
    const step = isPenny ? 1 : auction.bidIncrementCents;
    const minCents = leading + (hasBids ? step : 0);
    amount.min = (minCents / 100).toFixed(2);
    amount.placeholder = (minCents / 100).toFixed(2);
    amount.required = !isPenny;
    amountField.hidden = isPenny;
    bidForm.querySelector('.auction-widget__amount-label').textContent = auction.proxyBiddingEnabled ? root.dataset.proxyBidLabel : root.dataset.bidAmountLabel;
    const minHint = root.dataset.minBidHint.replace('{amount}', formatter.format(minCents / 100));
    bidForm.querySelector('.auction-widget__hint').textContent = auction.proxyBiddingEnabled ? `${minHint}. ${root.dataset.proxyHint}` : minHint;
    if (!isPenny && document.activeElement !== amount && !amount.value) renderChips(root, formatter, minCents, step);
    else if (isPenny) bidForm.querySelector('.auction-widget__chips').hidden = true;
    bidForm.hidden = !loggedIn;

    // Buy now
    const buyNowForm = root.querySelector('.auction-widget__buy-now-form');
    buyNowForm.hidden = !loggedIn || auction.buyNowPriceCents === null;
    if (auction.buyNowPriceCents !== null) buyNowForm.querySelector('button').textContent = `${root.dataset.buyNowLabel} · ${formatter.format(auction.buyNowPriceCents / 100)}`;

    // Offers
    const myOffer = payload.myOffer;
    const offerOpenStatus = myOffer && ['PENDING', 'COUNTERED', 'ACCEPTED'].includes(myOffer.status);
    root.querySelector('.auction-widget__offer').hidden = !loggedIn || !auction.offersEnabled || offerOpenStatus;
    const notice = root.querySelector('.auction-widget__notice');
    const offerStatus = root.querySelector('.auction-widget__offer-status');
    const counterForm = root.querySelector('.auction-widget__counter-form');
    counterForm.hidden = !loggedIn || !myOffer || myOffer.status !== 'COUNTERED';
    let offerMessage = '';
    if (myOffer) {
      if (myOffer.status === 'PENDING') offerMessage = root.dataset.pendingMessage;
      if (myOffer.status === 'ACCEPTED') offerMessage = root.dataset.acceptedMessage;
      if (myOffer.status === 'DECLINED') offerMessage = root.dataset.declinedMessage;
      if (myOffer.status === 'COUNTERED') {
        offerMessage = `${root.dataset.counterMessage} ${formatter.format(myOffer.counterAmountCents / 100)}.`;
        counterForm.querySelector('[name="offerId"]').value = myOffer.id;
      }
    }
    offerStatus.textContent = offerMessage;
    notice.hidden = !loggedIn || !offerMessage;

    details.hidden = false;
    tick(root);
  };

  const bindSubmit = (form, root, onSuccess, onError) => {
    const button = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const amount = form.querySelector('[name="amount"]');
      if (amount && amount.required && !form.closest('[hidden]') && !amount.checkValidity()) {
        const message = amount.value ? root.querySelector('.auction-widget__hint').textContent : amount.validationMessage;
        if (onError) onError(message);
        else setStatus(root, message, 'error');
        amount.focus();
        return;
      }
      button.disabled = true;
      setStatus(root, '');
      const query = new URLSearchParams({ product_id: root.dataset.productId });
      try {
        const response = await fetch(`${root.dataset.endpoint}?${query}`, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || root.dataset.errorMessage);
        form.reset();
        await render(root);
        if (onSuccess) onSuccess(result);
      } catch (error) {
        const message = error.message === 'Log in to your customer account to bid.' ? root.dataset.loginMessage : (error.message || root.dataset.errorMessage);
        if (onError) onError(message);
        else setStatus(root, message, 'error');
      } finally {
        button.disabled = false;
      }
    });
  };

  const init = () => document.querySelectorAll('[data-auction-widget]').forEach((root) => {
    if (root.dataset.initialized) return;
    root.dataset.initialized = 'true';
    const bidSuccess = (result) => {
      setStatus(root, result.status === 'BUY_NOW' ? root.dataset.acceptedMessage : root.dataset.successMessage, 'success');
    };
    const offerSuccess = () => {
      root.querySelector('.auction-widget__offer').open = false;
    };
    const placeBidSuccess = () => {
      const current = root.querySelector('.auction-widget__current').textContent;
      toast('success', root.dataset.toastBidSuccessTitle, root.dataset.toastBidSuccessDescription.replace('{amount}', current));
    };
    const placeBidError = (message) => toast('error', root.dataset.toastBidErrorTitle, message);
    bindSubmit(root.querySelector('.auction-widget__form'), root, placeBidSuccess, placeBidError);
    bindSubmit(root.querySelector('.auction-widget__buy-now-form'), root, bidSuccess);
    bindSubmit(root.querySelector('.auction-widget__offer-form'), root, offerSuccess);
    bindSubmit(root.querySelector('.auction-widget__counter-form'), root, offerSuccess);
    render(root).catch(() => {
      root.querySelector('.auction-widget__skeleton').hidden = true;
      root.querySelector('.auction-widget__details').hidden = false;
      root.querySelector('.auction-widget__header').hidden = true;
      root.querySelector('.auction-widget__stats').hidden = true;
      root.querySelector('.auction-widget__login-panel').hidden = true;
      setStatus(root, root.dataset.unavailableMessage, 'error');
    });
    window.setInterval(() => render(root).catch(() => {}), 10000);
    window.setInterval(() => { if (root._endsAt !== undefined) tick(root); }, 1000);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
