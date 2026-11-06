use super::schema;
use shopify_function::prelude::*;
use shopify_function::Result;

#[shopify_function]
fn cart_validations_generate_run(
    input: schema::cart_validations_generate_run::Input,
) -> Result<schema::CartValidationsGenerateRunResult> {
    let has_active_auction = input.cart().lines().iter().any(|line| {
        let product = match &line.merchandise() {
            schema::cart_validations_generate_run::input::cart::lines::Merchandise::ProductVariant(variant) => {
                &variant.product()
            }
            _ => return false,
        };
        product
            .auction_active()
            .is_some_and(|metafield| metafield.value() == "true")
    });

    let operations = if has_active_auction {
        vec![schema::Operation::ValidationAdd(
            schema::ValidationAddOperation {
                errors: vec![schema::ValidationError {
                    message: "This product is currently in an auction. Checkout is unavailable until the auction ends.".to_owned(),
                    target: "$.cart".to_owned(),
                }],
            },
        )]
    } else {
        Vec::new()
    };

    Ok(schema::CartValidationsGenerateRunResult { operations })
}
