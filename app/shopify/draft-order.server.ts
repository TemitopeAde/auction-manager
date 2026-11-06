type GraphqlAdmin = { graphql: (query: string, options?: { variables: Record<string, unknown> }) => Promise<Response> };

type InvoiceInput = {
  customerId: string;
  variantId: string;
  title: string;
  amountCents: number;
  buyerPremiumBps: number;
  currencyCode: string;
};

export async function createInvoice(admin: GraphqlAdmin, input: InvoiceInput) {
  const lineItems: Record<string, unknown>[] = [{
    variantId: input.variantId,
    quantity: 1,
    originalUnitPriceWithCurrency: {
      amount: (input.amountCents / 100).toFixed(2),
      currencyCode: input.currencyCode,
    },
  }];
  const premiumCents = Math.round(input.amountCents * input.buyerPremiumBps / 10000);
  if (premiumCents > 0) {
    lineItems.push({
      title: `Buyer's premium (${(input.buyerPremiumBps / 100).toFixed(2)}%)`,
      quantity: 1,
      originalUnitPriceWithCurrency: {
        amount: (premiumCents / 100).toFixed(2),
        currencyCode: input.currencyCode,
      },
    });
  }
  const createResponse = await admin.graphql(`#graphql
    mutation AuctionWinnerDraft($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder { id }
        userErrors { field message }
      }
    }`, {
    variables: {
      input: {
        purchasingEntity: {
          customerId: input.customerId.startsWith("gid://shopify/Customer/")
            ? input.customerId
            : `gid://shopify/Customer/${input.customerId}`,
        },
        lineItems,
        note: `Auction winner: ${input.title}`,
        tags: ["auction-winner"],
      },
    },
  });
  const created = await createResponse.json();
  const createResult = created.data?.draftOrderCreate;
  if (!createResult?.draftOrder?.id || createResult.userErrors?.length) {
    throw new Error(createResult?.userErrors?.map((error: { message: string }) => error.message).join("; ") || "Could not create the winner invoice.");
  }
  const draftOrderId = createResult.draftOrder.id as string;
  const invoiceResponse = await admin.graphql(`#graphql
    mutation SendAuctionInvoice($id: ID!) {
      draftOrderInvoiceSend(id: $id) {
        draftOrder { id }
        userErrors { field message }
      }
    }`, { variables: { id: draftOrderId } });
  const invoice = await invoiceResponse.json();
  const invoiceResult = invoice.data?.draftOrderInvoiceSend;
  if (invoiceResult?.userErrors?.length) {
    throw new Error(invoiceResult.userErrors.map((error: { message: string }) => error.message).join("; "));
  }
  return draftOrderId;
}
