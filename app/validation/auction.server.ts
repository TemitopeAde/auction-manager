import { z } from "zod";

const localDateTimeSchema = z.string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Enter a start date and time.")
  .transform((value, context) => {
    const [datePart, timePart] = value.split("T");
    const [year, month, day] = datePart.split("-").map(Number);
    const [hour, minute] = timePart.split(":").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || date.getUTCHours() !== hour || date.getUTCMinutes() !== minute) {
      context.addIssue({ code: "custom", message: "Enter a valid date and time." });
      return z.NEVER;
    }
    return date;
  });

const optionalLocalDateTimeSchema = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? null : value,
  localDateTimeSchema.nullable(),
);

const requiredAmountSchema = z.string()
  .trim()
  .min(1, "Enter a price.")
  .transform(Number)
  .pipe(z.number().finite("Enter a valid price.").nonnegative("Prices can’t be negative."));

const optionalAmountSchema = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? null : value,
  z.string().trim().min(1).transform(Number).pipe(z.number().finite("Enter a valid price.").nonnegative("Prices can’t be negative.")).nullable(),
);

const commonFields = {
  title: z.string().trim().min(1, "Enter an auction title."),
  startsAt: localDateTimeSchema,
  endsAt: optionalLocalDateTimeSchema,
  startingPrice: requiredAmountSchema,
  bidIncrement: requiredAmountSchema,
  reservePrice: optionalAmountSchema,
  buyNowPrice: optionalAmountSchema,
};

const auctionSettingsFields = {
  auctionType: z.preprocess((value) => value === "" ? "STANDARD" : value, z.enum(["STANDARD", "PENNY"], { error: "Choose an auction type." })),
  buyersPremiumPercent: z.string().trim().transform((value) => value === "" ? 0 : Number(value)).pipe(z.number().finite().min(0, "Buyer premium can’t be negative.").max(100, "Buyer premium can’t exceed 100%.")),
  offerAutoAccept: optionalAmountSchema,
  offerAutoDecline: optionalAmountSchema,
  offersEnabled: z.boolean(),
  popcorn: z.boolean(),
  proxyBidding: z.boolean(),
  requireApprovedBidders: z.boolean(),
};

function refineAuction(value: { startsAt: Date; endsAt: Date | null; startingPrice: number; bidIncrement: number; reservePrice: number | null; buyNowPrice: number | null }, context: z.RefinementCtx) {
  if (value.endsAt && value.endsAt <= value.startsAt) {
    context.addIssue({ code: "custom", path: ["endsAt"], message: "End time must be after start time." });
  }
  if (value.bidIncrement <= 0) {
    context.addIssue({ code: "custom", path: ["bidIncrement"], message: "Bid increment must be greater than zero." });
  }
  if (value.reservePrice !== null && value.reservePrice < value.startingPrice) {
    context.addIssue({ code: "custom", path: ["reservePrice"], message: "Reserve price must be at least the starting bid." });
  }
  if (value.buyNowPrice !== null && value.buyNowPrice <= value.startingPrice) {
    context.addIssue({ code: "custom", path: ["buyNowPrice"], message: "Buy now must be higher than the starting bid." });
  }
  if (value.reservePrice !== null && value.buyNowPrice !== null && value.reservePrice > value.buyNowPrice) {
    context.addIssue({ code: "custom", path: ["buyNowPrice"], message: "Buy now must be at least the reserve price." });
  }
}

export const createAuctionSchema = z.object({
  ...commonFields,
  productId: z.string().trim().min(1, "Select an active product."),
  ...auctionSettingsFields,
}).superRefine(refineAuction);

export const updateAuctionSchema = z.object({ ...commonFields, ...auctionSettingsFields }).superRefine(refineAuction);

export const getAuctionFormValues = (form: FormData) => ({
  productId: String(form.get("productId") ?? ""),
  title: String(form.get("title") ?? ""),
  startsAt: String(form.get("startsAt") ?? ""),
  endsAt: String(form.get("endsAt") ?? ""),
  startingPrice: String(form.get("startingPrice") ?? ""),
  bidIncrement: String(form.get("bidIncrement") ?? ""),
  reservePrice: String(form.get("reservePrice") ?? ""),
  buyNowPrice: String(form.get("buyNowPrice") ?? ""),
  auctionType: String(form.get("auctionType") ?? ""),
  buyersPremiumPercent: String(form.get("buyersPremiumPercent") ?? ""),
  offerAutoAccept: String(form.get("offerAutoAccept") ?? ""),
  offerAutoDecline: String(form.get("offerAutoDecline") ?? ""),
  offersEnabled: form.get("offersEnabled") === "on",
  popcorn: form.get("popcorn") === "on",
  proxyBidding: form.get("proxyBidding") === "on",
  requireApprovedBidders: form.get("requireApprovedBidders") === "on",
});
