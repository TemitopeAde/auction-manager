(() => {
  const render = async (root) => {
    const query = new URLSearchParams({ product_id: root.dataset.productId });
    const response = await fetch(`${root.dataset.endpoint}?${query}`, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(root.dataset.unavailableMessage);
    const payload = await response.json();
    const status = root.querySelector('.auction-widget__status');
    const skeleton = root.querySelector('.auction-widget__skeleton');
    const loginLink = root.querySelector('.auction-widget__login');
    const details = root.querySelector('.auction-widget__details');
    skeleton.hidden = true;
    if (!payload.auction) {
      status.textContent = '';
      details.hidden = true;
      return;
    }

    const auction = payload.auction;
    const customerLoggedIn = payload.customerLoggedIn === true;
    loginLink.hidden = customerLoggedIn;
    const formatter = new Intl.NumberFormat(undefined, { style: 'currency', currency: auction.currencyCode });
    root.querySelector('.auction-widget__title').textContent = auction.title;
    root.querySelector('.auction-widget__current').textContent = formatter.format((auction.currentBidCents ?? auction.startingPriceCents) / 100);
    const end = root.querySelector('.auction-widget__ends');
    if (auction.endsAt) {
      end.dateTime = auction.endsAt;
      end.textContent = new Date(auction.endsAt).toLocaleString();
    } else {
      end.removeAttribute('datetime');
      end.textContent = root.dataset.noEndMessage;
    }
    root.querySelectorAll('[name="auctionId"]').forEach((input) => { input.value = auction.id; });

    const bidForm = root.querySelector('.auction-widget__form');
    const amountField = bidForm.querySelector('.auction-widget__amount-field');
    const amount = bidForm.querySelector('[name="amount"]');
    const leading = auction.currentBidCents ?? auction.startingPriceCents;
    const increment = auction.currentBidCents === null ? 0 : (auction.auctionType === 'PENNY' ? 1 : auction.bidIncrementCents);
    amount.min = (leading + increment) / 100;
    amount.placeholder = formatter.format(Number(amount.min));
    amountField.hidden = auction.auctionType === 'PENNY';
    amount.required = auction.auctionType !== 'PENNY';
    amountField.querySelector('span').textContent = auction.proxyBiddingEnabled ? root.dataset.proxyBidLabel : root.dataset.bidAmountLabel;
    bidForm.hidden = !customerLoggedIn;

    const buyNowForm = root.querySelector('.auction-widget__buy-now-form');
    buyNowForm.hidden = !customerLoggedIn || auction.buyNowPriceCents === null;
    if (auction.buyNowPriceCents !== null) buyNowForm.querySelector('button').textContent = `${root.dataset.buyNowLabel} · ${formatter.format(auction.buyNowPriceCents / 100)}`;
    root.querySelector('.auction-widget__offer-form').hidden = !customerLoggedIn || !auction.offersEnabled;

    const offerStatus = root.querySelector('.auction-widget__offer-status');
    const counterForm = root.querySelector('.auction-widget__counter-form');
    const myOffer = payload.myOffer;
    counterForm.hidden = !customerLoggedIn || !myOffer || myOffer.status !== 'COUNTERED';
    if (myOffer) {
      if (myOffer.status === 'PENDING') offerStatus.textContent = root.dataset.pendingMessage;
      if (myOffer.status === 'ACCEPTED') offerStatus.textContent = root.dataset.acceptedMessage;
      if (myOffer.status === 'DECLINED') offerStatus.textContent = root.dataset.declinedMessage;
      if (myOffer.status === 'COUNTERED') {
        offerStatus.textContent = `${root.dataset.counterMessage} ${formatter.format(myOffer.counterAmountCents / 100)}`;
        counterForm.querySelector('[name="offerId"]').value = myOffer.id;
      }
    } else {
      offerStatus.textContent = '';
    }
    status.textContent = customerLoggedIn ? '' : root.dataset.loginMessage;
    details.hidden = false;
  };

  const bindSubmit = (form, root, onSuccess) => {
    const button = form.querySelector('button');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      button.disabled = true;
      const status = root.querySelector('.auction-widget__status');
      status.textContent = '';
      const query = new URLSearchParams({ product_id: root.dataset.productId });
      try {
        const response = await fetch(`${root.dataset.endpoint}?${query}`, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || root.dataset.errorMessage);
        if (onSuccess) onSuccess(result);
        form.reset();
        await render(root);
      } catch (error) {
        status.textContent = error.message === 'Log in to your customer account to bid.' ? root.dataset.loginMessage : (error.message || root.dataset.errorMessage);
      } finally {
        button.disabled = false;
      }
    });
  };

  const init = () => document.querySelectorAll('[data-auction-widget]').forEach((root) => {
    if (root.dataset.initialized) return;
    root.dataset.initialized = 'true';
    const status = root.querySelector('.auction-widget__status');
    const offerStatus = root.querySelector('.auction-widget__offer-status');
    const bidSuccess = (result) => {
      status.textContent = result.status === 'BUY_NOW' ? root.dataset.acceptedMessage : root.dataset.successMessage;
    };
    const offerSuccess = (result) => {
      offerStatus.textContent = result.status === 'ACCEPTED' ? root.dataset.acceptedMessage : result.status === 'DECLINED' ? root.dataset.declinedMessage : root.dataset.pendingMessage;
    };
    bindSubmit(root.querySelector('.auction-widget__form'), root, bidSuccess);
    bindSubmit(root.querySelector('.auction-widget__buy-now-form'), root, bidSuccess);
    bindSubmit(root.querySelector('.auction-widget__offer-form'), root, offerSuccess);
    bindSubmit(root.querySelector('.auction-widget__counter-form'), root, offerSuccess);
    render(root).catch(() => {
      root.querySelector('.auction-widget__skeleton').hidden = true;
      status.textContent = root.dataset.unavailableMessage;
    });
    window.setInterval(() => render(root).catch(() => {}), 10000);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
