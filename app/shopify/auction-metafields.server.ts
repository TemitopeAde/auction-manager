import prisma from "../db.server";

type GraphqlAdmin = { graphql: (query: string, options?: { variables: Record<string, unknown> }) => Promise<Response> };

export async function syncAuctionCheckoutLock(admin: GraphqlAdmin, shop: string, productId: string) {
  const now = new Date();
  const active = await prisma.auction.findFirst({
    where: {
      shop,
      productId,
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      closedAt: null,
      status: { in: ["LIVE", "SCHEDULED"] },
    },
    select: { id: true },
  });
  const response = await admin.graphql(`#graphql
    mutation SetAuctionCheckoutLock($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id }
        userErrors { field message }
      }
    }`, {
    variables: {
      metafields: [{
        ownerId: productId,
        key: "auction_active",
        type: "boolean",
        value: active ? "true" : "false",
      }],
    },
  });
  const payload = await response.json();
  const result = payload.data?.metafieldsSet;
  if (result?.userErrors?.length) {
    throw new Error(result.userErrors.map((error: { message: string }) => error.message).join("; "));
  }
}

export async function ensureAuctionCheckoutValidation(admin: GraphqlAdmin, shop: string) {
  const settings = await prisma.shopSettings.upsert({
    where: { shop },
    create: { shop },
    update: {},
  });
  if (settings.checkoutValidationId) {
    const currentResponse = await admin.graphql(`#graphql
      query AuctionCheckoutValidation($id: ID!) { validation(id: $id) { id enabled } }`, {
      variables: { id: settings.checkoutValidationId },
    });
    const currentPayload = await currentResponse.json();
    const current = currentPayload.data?.validation;
    if (current?.enabled) return { enabled: true };
    if (current) {
      const updateResponse = await admin.graphql(`#graphql
        mutation EnableAuctionCheckoutValidation($id: ID!, $validation: ValidationUpdateInput!) {
          validationUpdate(id: $id, validation: $validation) {
            validation { id enabled }
            userErrors { field message }
          }
        }`, {
        variables: {
          id: settings.checkoutValidationId,
          validation: { enable: true, blockOnFailure: true },
        },
      });
      const updatePayload = await updateResponse.json();
      const updated = updatePayload.data?.validationUpdate;
      if (updated?.validation?.enabled && !updated.userErrors?.length) return { enabled: true };
      return { enabled: false, error: updated?.userErrors?.map((error: { message: string }) => error.message).join("; ") || "Could not enable checkout protection." };
    }
    await prisma.shopSettings.update({ where: { shop }, data: { checkoutValidationId: null } });
  }

  const response = await admin.graphql(`#graphql
    mutation ActivateAuctionCheckoutValidation($validation: ValidationCreateInput!) {
      validationCreate(validation: $validation) {
        validation { id enabled }
        userErrors { field message }
      }
    }`, {
    variables: {
      validation: {
        functionHandle: "active-auction-checkout",
        title: "Block checkout for products in active auctions",
        enable: true,
        blockOnFailure: true,
      },
    },
  });
  const payload = await response.json();
  const result = payload.data?.validationCreate;
  const id = result?.validation?.id as string | undefined;
  if (!id || result.userErrors?.length) {
    const message = result?.userErrors?.map((error: { message: string }) => error.message).join("; ");
    return { enabled: false, error: message || "The checkout validation is not available yet. Install the latest app version and reload this page." };
  }
  await prisma.shopSettings.update({ where: { shop }, data: { checkoutValidationId: id } });
  return { enabled: true };
}
